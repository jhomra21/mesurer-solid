import type { MesurerPlugin } from "./core";
import { arrange, MESURER_ARRANGE_PLUGIN_ID } from "./arrange";
import { codex, MESURER_CODEX_PLUGIN_ID } from "./codex-plugin";
import { context, MESURER_CONTEXT_PLUGIN_ID } from "./context-plugin";
import { screenshot, MESURER_SCREENSHOT_PLUGIN_ID } from "./screenshot";

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
 * Settings discovery and default loading are both derived from this one list so
 * adding a first-party plugin never requires keeping a second availability list
 * in sync.
 */
export const MESURER_FIRST_PARTY_PLUGINS = [
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
] as const satisfies readonly MesurerPluginCatalogEntry[];

export const firstPartyPluginCatalog = (): MesurerPluginCatalogEntry[] =>
  MESURER_FIRST_PARTY_PLUGINS.map((entry) => ({
    ...entry,
    settingsIds: entry.settingsIds ? [...entry.settingsIds] : undefined,
    hiddenSettingsControlIds: entry.hiddenSettingsControlIds
      ? [...entry.hiddenSettingsControlIds]
      : undefined,
  }));

export const defaultFirstPartyPlugins = (): MesurerPlugin[] =>
  MESURER_FIRST_PARTY_PLUGINS.map((entry) => entry.create());
