import {
  contextPlugin,
  mountMeasurer,
  type MesurerContextPluginOptions,
  type MountMeasurerOptions,
  type MountedMeasurer,
} from "./index";
import { createMesurerFeedbackBus } from "./context";
import { isWebMcpAvailable, webMcpPlugin } from "./webmcp";
import {
  connectContextPluginToHost,
  getMesurerHostBridge,
  type MesurerHostBridge,
} from "./host-bridge";

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

export type { MesurerHostBridge } from "./host-bridge";
export { MESURER_HOST_BRIDGE_PROTOCOL } from "./host-bridge";

declare global {
  var __MESURER_CONFIG__: MesurerInjectConfig | undefined;
  var __MESURER_HOST__: MesurerHostBridge | undefined;
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

const hostBridge = getMesurerHostBridge(globalThis.__MESURER_HOST__);
const webMcpAvailable = isWebMcpAvailable(document);
const feedbackBus = webMcpAvailable ? createMesurerFeedbackBus() : undefined;
const configuredContext: MesurerContextPluginOptions = context === true || context === false ? {} : context;
const contextOptions = feedbackBus ? { ...configuredContext, feedbackBus } : configuredContext;
const injectedPlugins = context === false
  ? plugins
  : [
      contextPlugin(connectContextPluginToHost(contextOptions, hostBridge)),
      ...(feedbackBus ? [webMcpPlugin({ feedbackBus })] : []),
      ...plugins,
    ];

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
