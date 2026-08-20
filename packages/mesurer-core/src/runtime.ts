import { createMesurerPluginHost, type MesurerPlugin } from "./plugins";

export type MesurerRuntimeOptions = { plugins?: MesurerPlugin[] };

export async function createMesurerRuntime(options: MesurerRuntimeOptions = {}) {
  const host = createMesurerPluginHost();
  for (const plugin of options.plugins ?? []) await host.load(plugin);
  return host;
}
