import { createEventBus } from "./events";

export type Registration = { readonly dispose: () => void };
export type PluginId = string;
export type PluginStateSnapshot = Record<string, unknown>;
export type PluginStateScope = "all" | "history" | "persist";

export type ToolContribution = {
  id: string;
  label: string;
  shortcut?: string;
  command: string;
  order?: number;
  builtin?: string;
  icon?: { viewBox?: string; paths: string[] };
  active?: () => boolean;
  disabled?: () => boolean;
};

export type SettingsContribution = { id: string; label: string; order?: number; builtin?: string };
export type OverlayContribution = { id: string; order?: number; builtin?: string };
export type CommandHandler = (args: unknown, context: { source?: unknown }) => void | Promise<void>;
export type HookHandler = (event: unknown) => void | Promise<void>;

export type StateSliceDefinition<T = unknown> = {
  id: string;
  initial: T;
  history?: boolean;
  persist?: boolean;
};

type Owned<T> = T & { pluginId: PluginId; registrationId: number };
type PluginEvents = {
  changed: { pluginId?: string; reason: "load" | "remove" | "replace" | "registration" | "state" | "history" };
  command: { id: string; args: unknown };
};

export type MesurerPluginContext = {
  state: {
    register<T>(definition: StateSliceDefinition<T>): Registration;
    get<T>(id: string): T | undefined;
    update<T>(id: string, update: (value: T) => T): void;
  };
  tool: { register(contribution: ToolContribution): Registration };
  settings: { register(contribution: SettingsContribution): Registration };
  overlay: { register(contribution: OverlayContribution): Registration };
  command: {
    register(id: string, handler: CommandHandler): Registration;
    execute(id: string, args?: unknown, source?: unknown): Promise<void>;
  };
  hook: {
    on(name: string, handler: HookHandler): Registration;
    emit(name: string, event: unknown): Promise<void>;
  };
  /** Opaque renderer/browser services. Values never enter persistence or history. */
  service: {
    provide<T>(id: string, value: T): Registration;
    get<T>(id: string): T | undefined;
  };
  /** Register imperative cleanup that runs when a plugin is removed, replaced, or setup fails. */
  lifecycle: {
    onDispose(handler: () => void): Registration;
  };
};

export type MesurerPlugin = {
  id: PluginId;
  version?: string;
  requires?: string[];
  provides?: string[];
  setup(context: MesurerPluginContext): void | Promise<void>;
};

export const defineMesurerPlugin = <T extends MesurerPlugin>(plugin: T) => plugin;

export type MesurerPluginDescription = {
  plugins: Array<{ id: string; version?: string; requires: string[]; provides: string[] }>;
  tools: Array<{ id: string; label: string; shortcut?: string; command: string; order?: number; builtin?: string }>;
  settings: SettingsContribution[];
  overlays: OverlayContribution[];
  state: Array<{ id: string; history: boolean; persist: boolean }>;
  commands: string[];
  hooks: string[];
  services: string[];
};

const HISTORY_LIMIT = 50;

export function createMesurerPluginHost() {
  let nextRegistrationId = 1;
  let commandDepth = 0;
  const events = createEventBus<PluginEvents>();
  const plugins = new Map<string, { plugin: MesurerPlugin; registrations: Registration[] }>();
  const tools = new Map<number, Owned<ToolContribution>>();
  const settings = new Map<number, Owned<SettingsContribution>>();
  const overlays = new Map<number, Owned<OverlayContribution>>();
  const commands = new Map<number, Owned<{ id: string; handler: CommandHandler }>>();
  const hooks = new Map<number, Owned<{ name: string; handler: HookHandler }>>();
  const services = new Map<number, Owned<{ id: string; value: unknown }>>();
  const stateDefinitions = new Map<number, Owned<StateSliceDefinition>>();
  const state = new Map<string, unknown>();
  const history: PluginStateSnapshot[] = [];
  const future: PluginStateSnapshot[] = [];

  const notify = (pluginId: string | undefined, reason: PluginEvents["changed"]["reason"]) => {
    void events.emit("changed", { pluginId, reason });
  };

  const register = <T>(
    map: Map<number, Owned<T>>,
    pluginId: string,
    value: T,
  ): Registration => {
    const registrationId = nextRegistrationId++;
    map.set(registrationId, { ...value, pluginId, registrationId });
    let disposed = false;
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        map.delete(registrationId);
        notify(pluginId, "registration");
      },
    };
  };

  const registerLifecycle = (pluginId: string, handler: () => void): Registration => {
    let disposed = false;
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          handler();
        } finally {
          notify(pluginId, "registration");
        }
      },
    };
  };

  const definitionMatches = (definition: StateSliceDefinition, scope: PluginStateScope) =>
    scope === "all" || (scope === "history" ? definition.history === true : definition.persist === true);

  const snapshotState = (scope: PluginStateScope = "all"): PluginStateSnapshot => {
    const snapshot: PluginStateSnapshot = {};
    for (const definition of stateDefinitions.values()) {
      if (!definitionMatches(definition, scope) || !state.has(definition.id)) continue;
      snapshot[definition.id] = state.get(definition.id);
    }
    return snapshot;
  };

  const restoreState = (snapshot: PluginStateSnapshot, scope: PluginStateScope = "all") => {
    const active = new Set(
      [...stateDefinitions.values()]
        .filter((definition) => definitionMatches(definition, scope))
        .map((definition) => definition.id),
    );
    for (const [id, value] of Object.entries(snapshot)) {
      if (active.has(id)) state.set(id, value);
    }
    notify(undefined, "state");
  };

  const sameSnapshot = (left: PluginStateSnapshot, right: PluginStateSnapshot) => {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]),
    );
  };

  const clearHistory = () => {
    history.length = 0;
    future.length = 0;
  };

  const executeCommand = async (id: string, args?: unknown, source?: unknown) => {
    const match = [...commands.values()].reverse().find((item) => item.id === id);
    if (!match) throw new Error(`Unknown Mesurer command: ${id}`);

    const rootCommand = commandDepth === 0;
    const before = rootCommand ? snapshotState("history") : null;
    commandDepth += 1;
    try {
      await match.handler(args, { source });
      await events.emit("command", { id, args });
    } finally {
      commandDepth -= 1;
    }

    if (rootCommand && before) {
      const after = snapshotState("history");
      if (!sameSnapshot(before, after)) {
        history.push(before);
        if (history.length > HISTORY_LIMIT) history.shift();
        future.length = 0;
      }
    }
  };

  const undo = () => {
    const previous = history.pop();
    if (!previous) return false;
    future.push(snapshotState("history"));
    if (future.length > HISTORY_LIMIT) future.shift();
    restoreState(previous, "history");
    notify(undefined, "history");
    return true;
  };

  const redo = () => {
    const next = future.pop();
    if (!next) return false;
    history.push(snapshotState("history"));
    if (history.length > HISTORY_LIMIT) history.shift();
    restoreState(next, "history");
    notify(undefined, "history");
    return true;
  };

  const emitHook = async (name: string, event: unknown) => {
    for (const hook of [...hooks.values()].filter((item) => item.name === name)) {
      await hook.handler(event);
    }
  };

  const getService = <T>(id: string) =>
    [...services.values()].reverse().find((item) => item.id === id)?.value as T | undefined;

  const publicState = {
    get: <T>(id: string) => state.get(id) as T | undefined,
    update<T>(id: string, update: (value: T) => T) {
      if (!state.has(id)) throw new Error(`Unknown Mesurer state slice: ${id}`);
      state.set(id, update(state.get(id) as T));
      notify(undefined, "state");
    },
    serialize: snapshotState,
    restore: restoreState,
  };

  const makeContext = (pluginId: string, registrations: Registration[]): MesurerPluginContext => {
    const capture = (registration: Registration) => {
      registrations.push(registration);
      return registration;
    };
    return {
      state: {
        register<T>(definition: StateSliceDefinition<T>) {
          const registration = capture(register(stateDefinitions, pluginId, definition as StateSliceDefinition));
          if (!state.has(definition.id)) state.set(definition.id, definition.initial);
          return registration;
        },
        get: publicState.get,
        update: publicState.update,
      },
      tool: { register: (value) => capture(register(tools, pluginId, value)) },
      settings: { register: (value) => capture(register(settings, pluginId, value)) },
      overlay: { register: (value) => capture(register(overlays, pluginId, value)) },
      command: {
        register: (id, handler) => capture(register(commands, pluginId, { id, handler })),
        execute: executeCommand,
      },
      hook: {
        on: (name, handler) => capture(register(hooks, pluginId, { name, handler })),
        emit: emitHook,
      },
      service: {
        provide: <T>(id: string, value: T) => capture(register(services, pluginId, { id, value })),
        get: getService,
      },
      lifecycle: {
        onDispose: (handler) => capture(registerLifecycle(pluginId, handler)),
      },
    };
  };

  const cleanupOrphanState = () => {
    const activeIds = new Set([...stateDefinitions.values()].map((definition) => definition.id));
    for (const id of [...state.keys()]) if (!activeIds.has(id)) state.delete(id);
  };

  const remove = (id: string) => {
    const loaded = plugins.get(id);
    if (!loaded) return false;
    for (const registration of [...loaded.registrations].reverse()) registration.dispose();
    plugins.delete(id);
    cleanupOrphanState();
    clearHistory();
    notify(id, "remove");
    return true;
  };

  const load = async (plugin: MesurerPlugin) => {
    const replacing = plugins.has(plugin.id);
    if (replacing) remove(plugin.id);
    const missing = (plugin.requires ?? []).filter((required) =>
      ![...plugins.values()].some(({ plugin: existing }) => existing.provides?.includes(required)),
    );
    if (missing.length) {
      throw new Error(`Plugin ${plugin.id} requires missing capabilities: ${missing.join(", ")}`);
    }
    const registrations: Registration[] = [];
    try {
      await plugin.setup(makeContext(plugin.id, registrations));
      plugins.set(plugin.id, { plugin, registrations });
      clearHistory();
      notify(plugin.id, replacing ? "replace" : "load");
    } catch (error) {
      for (const registration of registrations.reverse()) registration.dispose();
      cleanupOrphanState();
      throw error;
    }
  };

  const listByOrder = <T extends { order?: number }>(values: Iterable<T>) =>
    [...values].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const stripOwned = <T extends { pluginId: string; registrationId: number }>({ pluginId: _pluginId, registrationId: _registrationId, ...item }: T) => item;

  const host = {
    load,
    remove,
    replace: load,
    has: (id: string) => plugins.has(id),
    plugin: (id: string) => plugins.get(id)?.plugin,
    listPlugins: () => [...plugins.values()].map((item) => item.plugin),
    tools: () => listByOrder(tools.values()).map(stripOwned),
    settings: () => listByOrder(settings.values()).map(stripOwned),
    overlays: () => listByOrder(overlays.values()).map(stripOwned),
    state: publicState,
    service: { get: getService },
    command: { execute: executeCommand },
    hook: { emit: emitHook },
    undo,
    redo,
    canUndo: () => history.length > 0,
    canRedo: () => future.length > 0,
    subscribe: (listener: (event: PluginEvents["changed"]) => void) => events.on("changed", listener),
    describe(): MesurerPluginDescription {
      return {
        plugins: [...plugins.values()].map(({ plugin }) => ({
          id: plugin.id,
          version: plugin.version,
          requires: plugin.requires ?? [],
          provides: plugin.provides ?? [],
        })),
        tools: host.tools().map(({ active: _active, disabled: _disabled, icon: _icon, ...tool }) => tool),
        settings: host.settings(),
        overlays: host.overlays(),
        state: [...stateDefinitions.values()].map(({ id, history: recordsHistory, persist }) => ({
          id,
          history: recordsHistory ?? false,
          persist: persist ?? false,
        })),
        commands: [...new Set([...commands.values()].map((item) => item.id))],
        hooks: [...new Set([...hooks.values()].map((item) => item.name))],
        services: [...new Set([...services.values()].map((item) => item.id))],
      };
    },
    dispose() {
      for (const id of [...plugins.keys()].reverse()) remove(id);
      events.clear();
      state.clear();
      clearHistory();
    },
  };

  return host;
}

export type MesurerPluginHost = ReturnType<typeof createMesurerPluginHost>;
