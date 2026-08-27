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
  /**
   * Reuse an already-mounted connected injected Mesurer instance.
   * Defaults to true so an agent cannot accidentally destroy human selections,
   * measurements, guides, annotations, or other live review state by reinjecting.
   * New injection configuration is applied only when no live instance exists or
   * when this is set to false for deliberate replacement.
   */
  reuseExisting?: boolean;
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
  reuseExisting = true,
  ...options
} = config;

const existing = globalThis.__MESURER_INSTANCE__;
const reusableExisting = reuseExisting && existing?.element.isConnected
  ? existing
  : undefined;

function mountInjectedMeasurer(): MountedMeasurer {
  const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
  if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

  const injectedPlugins = context === false
    ? plugins
    : [contextPlugin(context === true ? {} : context), ...plugins];

  existing?.dispose();
  return mountMeasurer({
    ...options,
    plugins: injectedPlugins,
    target,
    agent: { globalName, root: document },
  });
}

export const mesurer = reusableExisting ?? mountInjectedMeasurer();
globalThis.__MESURER_INSTANCE__ = mesurer;
await mesurer.ready;
