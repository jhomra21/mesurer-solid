import type { MesurerPlugin } from "./core";
import { edit, MESURER_ARRANGE_PLUGIN_ID } from "./arrange";
import { codex, MESURER_CODEX_PLUGIN_ID } from "./plugins/codex";
import { context, MESURER_CONTEXT_PLUGIN_ID } from "./context-plugin";
import { layoutGuides, MESURER_LAYOUT_GUIDES_PLUGIN_ID } from "./layout-guides";
import { screenshot, MESURER_SCREENSHOT_PLUGIN_ID } from "./screenshot";

type MesurerPluginRegistryEntry = {
  id: string;
  label?: string;
  description?: string;
  order?: number;
  enabled?: boolean;
  create(): MesurerPlugin | Promise<MesurerPlugin>;
  settingsIds?: string[];
  hiddenSettingsControlIds?: string[];
};

export type MesurerPluginCatalogEntry = {
  id: string;
  label: string;
  description?: string;
  order?: number;
  enabled?: boolean;
  optIn?: boolean;
  create(): MesurerPlugin;
  settingsIds?: string[];
  hiddenSettingsControlIds?: string[];
};

/**
 * Canonical first-party plugin registry.
 *
 * Default loading, explicit initial enablement, Settings discovery, and later
 * re-enablement are all derived from this one list. Adding a first-party plugin
 * requires one registration here and nowhere else.
 */
const codexHostAvailable = () => typeof window !== "undefined"
  && typeof window.__MESURER_HOST__?.codexBridge === "function";

export const MESURER_FIRST_PARTY_PLUGINS: readonly MesurerPluginCatalogEntry[] = [
  {
    id: MESURER_CONTEXT_PLUGIN_ID,
    label: "Context",
    order: 30,
    create: context,
    settingsIds: ["context"],
    hiddenSettingsControlIds: ["ui"],
  },
  {
    id: MESURER_ARRANGE_PLUGIN_ID,
    label: "Edit",
    order: 35,
    create: edit,
    settingsIds: ["arrange"],
  },
  {
    id: MESURER_LAYOUT_GUIDES_PLUGIN_ID,
    label: "Layout Guides",
    order: 38,
    create: layoutGuides,
  },
  {
    id: MESURER_SCREENSHOT_PLUGIN_ID,
    label: "Screenshot",
    order: 40,
    create: screenshot,
    settingsIds: ["screenshot"],
    hiddenSettingsControlIds: ["tool"],
  },
  {
    id: MESURER_CODEX_PLUGIN_ID,
    label: "Codex",
    description: "Connects Mesurer to open Codex threads on this computer. Electron hosts provide the native Codex connection through preload.",
    order: 45,
    create: codex,
  },
];

/**
 * Resolve the single renderer plugin registry for one mount.
 *
 * With no explicit `plugins`, first-party registrations use their catalog defaults.
 * When callers provide `plugins`, that list is the initial enabled set while
 * omitted first-party registrations remain known to Settings and can be enabled
 * later. Explicit first-party instances retain their caller-supplied options
 * across disable/re-enable cycles.
 */
export const createPluginRegistry = (
  plugins?: readonly MesurerPlugin[],
): MesurerPluginRegistryEntry[] => {
  const hasExplicitSet = plugins !== undefined;
  const explicitPlugins = new Map((plugins ?? []).map((plugin) => [plugin.id, plugin]));
  const firstPartyIds = new Set(MESURER_FIRST_PARTY_PLUGINS.map((entry) => entry.id));

  const registry: MesurerPluginRegistryEntry[] = MESURER_FIRST_PARTY_PLUGINS.map((entry) => {
    const explicit = explicitPlugins.get(entry.id);

    return {
      ...entry,
      settingsIds: entry.settingsIds ? [...entry.settingsIds] : undefined,
      hiddenSettingsControlIds: entry.hiddenSettingsControlIds
        ? [...entry.hiddenSettingsControlIds]
        : undefined,
      enabled: hasExplicitSet
        ? Boolean(explicit)
        : entry.id === MESURER_CODEX_PLUGIN_ID
          ? codexHostAvailable()
          : entry.enabled !== false,
      create: explicit ? () => explicit : entry.create,
    };
  });

  for (const [index, plugin] of (plugins ?? []).entries()) {
    if (firstPartyIds.has(plugin.id)) continue;
    registry.push({
      id: plugin.id,
      order: 1_000 + index,
      enabled: true,
      create: () => plugin,
    });
  }

  return registry;
};
