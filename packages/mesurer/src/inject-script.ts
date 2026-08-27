import {
  contextPlugin,
  mountMeasurer,
  type MountedMeasurer,
} from "./index";
import type { MesurerInjectConfig } from "./inject";

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
const reusableExisting = reuseExisting
  && existing?.element.isConnected
  && Reflect.get(globalThis, globalName) === existing.agent
  ? existing
  : undefined;

if (reusableExisting) {
  void reusableExisting.ready.catch((error) => {
    queueMicrotask(() => { throw error; });
  });
} else {
  const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
  if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

  const injectedPlugins = context === false
    ? plugins
    : [contextPlugin(context === true ? {} : context), ...plugins];

  existing?.dispose();
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
}
