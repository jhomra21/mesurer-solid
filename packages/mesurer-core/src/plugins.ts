import { createEventBus } from "./events";

export type Registration = { readonly dispose: () => void };
export type PluginId = string;

export type ToolContribution = {
  id: string;
  label: string;
  shortcut?: string;
  command: string;
  order?: number;
  builtin?: string;
  icon?: { viewBox?: string; paths: string[] };
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
  changed: { pluginId?: string; reason: "load" | "remove" | "replace" | "registration" | "state" };
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
  command: { register(id: string, handler: CommandHandler): Registration; execute(id: string, args?: unknown, source?: unknown): Promise<void> };
  hook: { on(name: string, handler: HookHandler): Registration; emit(name: string, event: unknown): Promise<void> };
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
  tools: ToolContribution[];
  settings: SettingsContribution[];
  overlays: OverlayContribution[];
  state: Array<{ id: string; history: boolean; persist: boolean }>;
  commands: string[];
  hooks: string[];
};

export function createMesurerPluginHost() {
  let nextRegistrationId = 1;
  const events = createEventBus<PluginEvents>();
  const plugins = new Map<string, { plugin: MesurerPlugin; registrations: Registration[] }>();
  const tools = new Map<number, Owned<ToolContribution>>();
  const settings = new Map<number, Owned<SettingsContribution>>();
  const overlays = new Map<number, Owned<OverlayContribution>>();
  const commands = new Map<number, Owned<{ id: string; handler: CommandHandler }>>();
  const hooks = new Map<number, Owned<{ name: string; handler: HookHandler }>>();
  const stateDefinitions = new Map<number, Owned<StateSliceDefinition>>();
  const state = new Map<string, unknown>();
  let loadingPluginId: string | null = null;

  const notify = (pluginId: string | undefined, reason: PluginEvents["changed"]["reason"]) => {
    void events.emit("changed", { pluginId, reason });
  };

  const register = <T>(map: Map<number, Owned<T>>, value: T): Registration => {
    if (!loadingPluginId) throw new Error("Mesurer registrations are only allowed during plugin setup");
    const registrationId = nextRegistrationId++;
    map.set(registrationId, { ...value, pluginId: loadingPluginId, registrationId });
    let disposed = false;
    const registration = {
      dispose() {
        if (disposed) return;
        disposed = true;
        map.delete(registrationId);
        notify(loadingPluginId ?? undefined, "registration");
      },
    };
    return registration;
  };

  const context: MesurerPluginContext = {
    state: {
      register(definition) {
        const registration = register(stateDefinitions, definition as StateSliceDefinition);
        if (!state.has(definition.id)) state.set(definition.id, definition.initial);
        return registration;
      },
      get: (id) => state.get(id) as never,
      update(id, update) {
        if (!state.has(id)) throw new Error(`Unknown Mesurer state slice: ${id}`);
        state.set(id, update(state.get(id) as never));
        notify(undefined, "state");
      },
    },
    tool: { register: (value) => register(tools, value) },
    settings: { register: (value) => register(settings, value) },
    overlay: { register: (value) => register(overlays, value) },
    command: {
      register: (id, handler) => register(commands, { id, handler }),
      async execute(id, args, source) {
        const match = [...commands.values()].reverse().find((item) => item.id === id);
        if (!match) throw new Error(`Unknown Mesurer command: ${id}`);
        await match.handler(args, { source });
        await events.emit("command", { id, args });
      },
    },
    hook: {
      on: (name, handler) => register(hooks, { name, handler }),
      async emit(name, event) {
        for (const hook of [...hooks.values()].filter((item) => item.name === name)) await hook.handler(event);
      },
    },
  };

  const remove = (id: string) => {
    const loaded = plugins.get(id);
    if (!loaded) return false;
    for (const registration of [...loaded.registrations].reverse()) registration.dispose();
    plugins.delete(id);
    notify(id, "remove");
    return true;
  };

  const load = async (plugin: MesurerPlugin) => {
    if (plugins.has(plugin.id)) remove(plugin.id);
    const missing = (plugin.requires ?? []).filter((required) =>
      ![...plugins.values()].some(({ plugin: existing }) => existing.provides?.includes(required)),
    );
    if (missing.length) throw new Error(`Plugin ${plugin.id} requires missing capabilities: ${missing.join(", ")}`);
    const registrations: Registration[] = [];
    const capture = <T extends (...args: any[]) => Registration>(fn: T): T => ((...args: Parameters<T>) => {
      const registration = fn(...args);
      registrations.push(registration);
      return registration;
    }) as T;
    loadingPluginId = plugin.id;
    const scoped: MesurerPluginContext = {
      state: { ...context.state, register: capture(context.state.register) },
      tool: { register: capture(context.tool.register) },
      settings: { register: capture(context.settings.register) },
      overlay: { register: capture(context.overlay.register) },
      command: { ...context.command, register: capture(context.command.register) },
      hook: { ...context.hook, on: capture(context.hook.on) },
    };
    try {
      await plugin.setup(scoped);
      plugins.set(plugin.id, { plugin, registrations });
      notify(plugin.id, "load");
    } catch (error) {
      for (const registration of registrations.reverse()) registration.dispose();
      throw error;
    } finally {
      loadingPluginId = null;
    }
  };

  const listByOrder = <T extends { order?: number }>(values: Iterable<T>) =>
    [...values].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return {
    load,
    remove,
    replace: load,
    has: (id: string) => plugins.has(id),
    plugin: (id: string) => plugins.get(id)?.plugin,
    listPlugins: () => [...plugins.values()].map((item) => item.plugin),
    tools: () => listByOrder(tools.values()).map(({ pluginId: _pluginId, registrationId: _registrationId, ...item }) => item),
    settings: () => listByOrder(settings.values()).map(({ pluginId: _pluginId, registrationId: _registrationId, ...item }) => item),
    overlays: () => listByOrder(overlays.values()).map(({ pluginId: _pluginId, registrationId: _registrationId, ...item }) => item),
    state: context.state,
    command: context.command,
    hook: context.hook,
    subscribe: (listener: (event: PluginEvents["changed"]) => void) => events.on("changed", listener),
    describe(): MesurerPluginDescription {
      return {
        plugins: [...plugins.values()].map(({ plugin }) => ({ id: plugin.id, version: plugin.version, requires: plugin.requires ?? [], provides: plugin.provides ?? [] })),
        tools: this.tools(),
        settings: this.settings(),
        overlays: this.overlays(),
        state: [...stateDefinitions.values()].map(({ id, history, persist }) => ({ id, history: history ?? false, persist: persist ?? false })),
        commands: [...new Set([...commands.values()].map((item) => item.id))],
        hooks: [...new Set([...hooks.values()].map((item) => item.name))],
      };
    },
    dispose() {
      for (const id of [...plugins.keys()].reverse()) remove(id);
      events.clear();
      state.clear();
    },
  };
}

export type MesurerPluginHost = ReturnType<typeof createMesurerPluginHost>;
