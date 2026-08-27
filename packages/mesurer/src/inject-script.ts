import {
  contextPlugin,
  mountMeasurer,
  type MountedMeasurer,
} from "./index";
import {
  connectContextPluginToHost,
  isMesurerHostBridge,
  type MesurerHostBridge,
} from "./host-bridge";
import type { MesurerInjectConfig } from "./inject";

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

const hostBridge = isMesurerHostBridge(globalThis.__MESURER_HOST__)
  ? globalThis.__MESURER_HOST__
  : undefined;
const contextOptions = context === true ? {} : context;
const injectedPlugins = context === false
  ? plugins
  : [contextPlugin(connectContextPluginToHost(contextOptions, hostBridge)), ...plugins];

// Reinjection is intentionally deterministic for browser-tool/HMR loops.
globalThis.__MESURER_INSTANCE__?.dispose();

const mesurer = mountMeasurer({
  ...options,
  plugins: injectedPlugins,
  target,
  agent: { globalName, root: document },
});

globalThis.__MESURER_INSTANCE__ = mesurer;

// The agent global is installed synchronously by mountMeasurer(). Consumers can
// immediately call window[globalName].ready() through their existing browser
// evaluation primitive. Avoid top-level await so this file can be emitted as a
// classic self-executing script instead of an ES module.
void mesurer.ready.catch((error) => {
  queueMicrotask(() => { throw error; });
});
