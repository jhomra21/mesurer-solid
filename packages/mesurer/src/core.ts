import { createMesurerPluginHost as createInternalPluginHost } from "@jhomra21/mesurer-solid-core";

export type Registration = { readonly dispose: () => void };
export type PluginId = string;
type PluginScalar = string | number | boolean | null;
type PluginValue = PluginScalar | PluginValue[] | { [key: string]: PluginValue };
export type PluginStateSnapshot = { [id: string]: PluginValue };
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
export type CommandHandler = (args: PluginValue | undefined, context: { source?: PluginValue }) => void | Promise<void>;
export type HookHandler = (event: PluginValue) => void | Promise<void>;

export type StateSliceDefinition<T extends PluginValue = PluginValue> = {
  id: string;
  initial: T;
  history?: boolean;
  persist?: boolean;
};

export type MesurerPluginContext = {
  state: {
    register<T extends PluginValue>(definition: StateSliceDefinition<T>): Registration;
    get<T extends PluginValue>(id: string): T | undefined;
    update<T extends PluginValue>(id: string, update: (value: T) => T): void;
  };
  tool: { register(contribution: ToolContribution): Registration };
  settings: { register(contribution: SettingsContribution): Registration };
  overlay: { register(contribution: OverlayContribution): Registration };
  command: {
    register(id: string, handler: CommandHandler): Registration;
    execute(id: string, args?: PluginValue, source?: PluginValue): Promise<void>;
  };
  hook: {
    on(name: string, handler: HookHandler): Registration;
    emit(name: string, event: PluginValue): Promise<void>;
  };
  service: {
    provide<T>(id: string, value: T): Registration;
    get<T>(id: string): T | undefined;
  };
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

export type MesurerPluginChange = {
  pluginId?: string;
  reason: "load" | "remove" | "replace" | "registration" | "state" | "history";
};

export type MesurerPluginHost = {
  load(plugin: MesurerPlugin): Promise<void>;
  remove(id: string): boolean;
  replace(plugin: MesurerPlugin): Promise<void>;
  has(id: string): boolean;
  plugin(id: string): MesurerPlugin | undefined;
  listPlugins(): MesurerPlugin[];
  tools(): ToolContribution[];
  settings(): SettingsContribution[];
  overlays(): OverlayContribution[];
  state: {
    get<T extends PluginValue>(id: string): T | undefined;
    update<T extends PluginValue>(id: string, update: (value: T) => T): void;
    serialize(scope?: PluginStateScope): PluginStateSnapshot;
    restore(snapshot: PluginStateSnapshot, scope?: PluginStateScope): void;
  };
  service: { get<T>(id: string): T | undefined };
  command: { execute(id: string, args?: PluginValue, source?: PluginValue): Promise<void> };
  hook: { emit(name: string, event: PluginValue): Promise<void> };
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  subscribe(listener: (event: MesurerPluginChange) => void): () => void;
  describe(): MesurerPluginDescription;
  dispose(): void;
};

export const defineMesurerPlugin = <T extends MesurerPlugin>(plugin: T): T => plugin;

export function createMesurerPluginHost(): MesurerPluginHost {
  return createInternalPluginHost();
}

export async function createMesurerRuntime(
  options: { plugins?: MesurerPlugin[] } = {},
): Promise<MesurerPluginHost> {
  const host = createMesurerPluginHost();
  for (const plugin of options.plugins ?? []) await host.load(plugin);
  return host;
}
