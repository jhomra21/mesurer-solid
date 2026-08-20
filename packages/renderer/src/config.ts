import type { MesurerPlugin } from "@jhomra21/mesurer-solid-core";
import type { MesurerBuiltinPluginId } from "./plugins/builtins";

export type MesurerConfig = {
  plugins?: MesurerPlugin[];
  excludePlugins?: MesurerBuiltinPluginId[];
};

/**
 * Agent- and user-friendly configuration surface. The object can be spread into
 * `<Measurer />` or passed directly to the universal `mountMeasurer()` API.
 */
export const defineMesurerConfig = <T extends MesurerConfig>(config: T): T => config;
