import type { MesurerPlugin } from "./core";
import { arrange, MESURER_ARRANGE_PLUGIN_ID } from "./arrange";
import { codex, MESURER_CODEX_PLUGIN_ID } from "./codex-plugin";
import { context, MESURER_CONTEXT_PLUGIN_ID } from "./context-plugin";
import { layoutGuides, MESURER_LAYOUT_GUIDES_PLUGIN_ID } from "./layout-guides";
import { screenshot, MESURER_SCREENSHOT_PLUGIN_ID } from "./screenshot";

type MesurerPluginRegistryEntry = {
  id: string;
  label?: string;
  order?: number;
  enabled?: boolean;
  create(): MesurerPlugin | Promise<MesurerPlugin>;
  settingsIds?: string[];
  hiddenSettingsControlIds?: string[];
};

export type MesurerPluginCatalogEntry = {
  id: string;
  label: string;
  order?: number;
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
    label: "Arrange",
    order: 35,
    create: arrange,
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
    order: 45,
    create: codex,
  },
];

/**
 * Resolve the single renderer plugin registry for one mount.
 *
 * With no explicit `plugins`, every first-party registration starts enabled.
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
      enabled: hasExplicitSet ? Boolean(explicit) : true,
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
