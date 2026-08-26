import {
  contextPlugin,
  mountMeasurer,
  type MesurerContextPluginOptions,
  type MountMeasurerOptions,
  type MountedMeasurer,
} from "./index";

export type MesurerInjectConfig = Omit<MountMeasurerOptions, "target" | "agent" | "plugins"> & {
  /** Optional application container selector. Defaults to document.body. */
  target?: string;
  /** Global agent API name. Defaults to __MESURER__. */
  globalName?: string;
  /** Additional plugins loaded after the default injected context plugin. */
  plugins?: MountMeasurerOptions["plugins"];
  /** Enable/configure the removable context plugin. Defaults to true for injection. */
  context?: boolean | MesurerContextPluginOptions;
};

declare global {
  var __MESURER_CONFIG__: MesurerInjectConfig | undefined;
  var __MESURER_INSTANCE__: MountedMeasurer | undefined;
}

const config = globalThis.__MESURER_CONFIG__ ?? {};
const {
  target: targetSelector,
  globalName = "__MESURER__",
  context = true,
  plugins = [],
  ...options
} = config;
const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

const injectedPlugins = context === false
  ? plugins
  : [contextPlugin(context === true ? {} : context), ...plugins];

// Reinjection is intentionally deterministic for agent/HMR loops.
globalThis.__MESURER_INSTANCE__?.dispose();

export const mesurer = mountMeasurer({
  ...options,
  plugins: injectedPlugins,
  target,
  agent: { globalName, root: document },
});

globalThis.__MESURER_INSTANCE__ = mesurer;
await mesurer.ready;
