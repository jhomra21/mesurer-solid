import type { MesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerBuiltinPluginId } from "./plugins/builtins";

export type MesurerConfig = {
  shortcutsEnabled?: boolean;
  plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];
};

/**
 * Agent- and user-friendly configuration surface. The object can be spread into
 * `<Mesurer />` or passed directly to the universal `mountMesurer()` API.
 */
export const defineMesurerConfig = <T extends MesurerConfig>(config: T): T => config;
