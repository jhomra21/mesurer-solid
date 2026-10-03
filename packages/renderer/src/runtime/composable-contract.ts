import type {
  MesurerPlugin,
  MesurerPluginHost,
  MesurerTheme,
  PluginStateSnapshot,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerProps as BaseMesurerProps } from "../Mesurer";
import type { MesurerModel } from "../model/create-mesurer-model";
import type { MesurerBuiltinPluginId } from "../plugins/builtins";
import type { MesurerWorkspaceRuntime } from "./workspace-context";

export type MesurerSolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  pageTarget: HTMLElement | ShadowRoot;
  rendererRoot?: HTMLDivElement;
  currentToolMode?(): MesurerModel["state"]["toolMode"];
  currentToolbarMode?(): "select" | "edit";
  theme?(): MesurerTheme;
  subscribeTheme?(listener: (theme: MesurerTheme) => void): () => void;
  createWorkspaceRuntime(persistenceNamespace?: string): MesurerWorkspaceRuntime;
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

export type MesurerPluginRegistration = {
  id: string;
  label?: string;
  description?: string;
  order?: number;
  enabled?: boolean;
  create(): MesurerPlugin | Promise<MesurerPlugin>;
  settingsIds?: string[];
  hiddenSettingsControlIds?: string[];
};

export type MesurerPluginInput = MesurerPlugin | MesurerPluginRegistration;

export type MesurerProps = Omit<
  BaseMesurerProps,
  "pluginTools" | "onPluginTool" | "onPluginToolMenuItem" | "isBuiltinActionDisabled" | "onBuiltinController"
> & {
  version?: string;
  plugins?: MesurerPluginInput[];
  excludePlugins?: MesurerBuiltinPluginId[];
  pluginHost?: MesurerPluginHost;
  onPluginHost?: (host: MesurerPluginHost) => void;
  onPluginsReady?: (host: MesurerPluginHost) => void;
  onPluginError?: (cause: unknown, pluginId: string) => void;
};

export const BUILTIN_TOOL_IDS = [
  "select",
  "xray",
  "color-picker",
  "rulers",
  "text-inspector",
  "guides",
  "settings",
] as const satisfies readonly Exclude<MesurerBuiltinPluginId, "distance">[];

export const DEFAULT_PLUGIN_STORAGE_KEY = "mesurer-plugin-settings";

export const PLUGIN_REGISTRY_STORAGE_VERSION = 3;

export type StoredPluginRegistryState = {
  version: number;
  enabled: Record<string, boolean>;
  state: Record<string, PluginStateSnapshot>;
};

export const pluginLabelFromId = (id: string) => {
  const value = id.startsWith("mesurer.") ? id.slice("mesurer.".length) : id;

  return value
    .split(/[.-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || id;
};

export const isPluginRegistration = (
  plugin: MesurerPluginInput,
): plugin is MesurerPluginRegistration =>
  "create" in plugin && typeof plugin.create === "function";

export const isBuiltinPluginId = (
  value: string,
): value is MesurerBuiltinPluginId =>
  value === "select"
  || value === "xray"
  || value === "color-picker"
  || value === "rulers"
  || value === "text-inspector"
  || value === "guides"
  || value === "distance"
  || value === "settings";

export const builtinCommand = (id: MesurerBuiltinPluginId) => `builtin.${id}`;

export const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const parts = shortcut
    .toLowerCase()
    .replaceAll("cmd", "meta")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return false;
  const key = parts.at(-1)!;
  const modifiers = new Set(parts.slice(0, -1));
  const wantsMod = modifiers.has("mod");
  const wantsMeta = modifiers.has("meta");
  const wantsCtrl = modifiers.has("ctrl") || modifiers.has("control");
  const wantsShift = modifiers.has("shift");
  const wantsAlt = modifiers.has("alt") || modifiers.has("option");

  if (
    wantsMod
      ? !(event.metaKey || event.ctrlKey)
      : wantsMeta !== event.metaKey || wantsCtrl !== event.ctrlKey
  ) {
    return false;
  }

  if (wantsShift !== event.shiftKey || wantsAlt !== event.altKey) return false;

  if (!wantsMod && !wantsMeta && !wantsCtrl && (event.metaKey || event.ctrlKey)) {
    return false;
  }

  return event.key.toLowerCase() === key;
};
