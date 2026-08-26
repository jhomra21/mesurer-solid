import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import type {
  CommandHandler,
  HookHandler,
  MesurerPlugin,
  MesurerPluginContext,
  MesurerPluginDescription,
  MesurerPluginHost,
  OverlayContribution,
  PluginId,
  PluginStateScope,
  PluginStateSnapshot,
  Registration,
  SettingsContribution,
  StateSliceDefinition,
  ToolContribution,
} from "@jhomra21/mesurer-solid-core";

export {
  createMesurerPluginHost,
  defineMesurerPlugin,
};

export type {
  CommandHandler,
  HookHandler,
  MesurerPlugin,
  MesurerPluginContext,
  MesurerPluginDescription,
  MesurerPluginHost,
  OverlayContribution,
  PluginId,
  PluginStateScope,
  PluginStateSnapshot,
  Registration,
  SettingsContribution,
  StateSliceDefinition,
  ToolContribution,
};

export type MesurerPluginChange = Parameters<MesurerPluginHost["subscribe"]>[0] extends (
  event: infer Event,
) => void
  ? Event
  : never;

export async function createMesurerRuntime(
  options: { plugins?: MesurerPlugin[] } = {},
): Promise<MesurerPluginHost> {
  const host = createMesurerPluginHost();
  for (const plugin of options.plugins ?? []) await host.load(plugin);
  return host;
}
