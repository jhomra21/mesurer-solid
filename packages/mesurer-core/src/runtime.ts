import { createMesurerPluginHost, type MesurerPlugin } from "./plugins";

export type MesurerRuntimeOptions = { plugins?: readonly MesurerPlugin[] };

/**
 * Create a framework-neutral plugin runtime and load its initial plugins.
 *
 * The returned host owns the loaded plugins. If startup fails, the partial host
 * is disposed before the original error is rethrown.
 */
export async function createMesurerRuntime(options: MesurerRuntimeOptions = {}) {
  const host = createMesurerPluginHost();

  try {
    for (const plugin of options.plugins ?? []) await host.load(plugin);

    return host;
  } catch (error) {
    host.dispose();
    throw error;
  }
}
