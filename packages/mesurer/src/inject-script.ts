import { mountMeasurer, type MountMeasurerOptions, type MountedMeasurer } from "./index";

type MesurerInjectScriptConfig = Omit<MountMeasurerOptions, "target" | "agent"> & {
  /** Optional application container selector. Defaults to document.body. */
  target?: string;
  /** Global agent API name. Defaults to __MESURER__. */
  globalName?: string;
};

type InjectionGlobal = typeof globalThis & {
  __MESURER_CONFIG__?: MesurerInjectScriptConfig;
  __MESURER_INSTANCE__?: MountedMeasurer;
};

const globalObject = globalThis as InjectionGlobal;
const config = globalObject.__MESURER_CONFIG__ ?? {};
const { target: targetSelector, globalName = "__MESURER__", ...options } = config;
const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

// Reinjection is intentionally deterministic for browser-tool/HMR loops.
globalObject.__MESURER_INSTANCE__?.dispose();

const mesurer = mountMeasurer({
  ...options,
  target,
  agent: { globalName, root: document },
});

globalObject.__MESURER_INSTANCE__ = mesurer;

// The agent global is installed synchronously by mountMeasurer(). Consumers can
// immediately call window[globalName].ready() through their existing browser
// evaluation primitive. Avoid top-level await so this file can be emitted as a
// classic self-executing script instead of an ES module.
void mesurer.ready.catch((error) => {
  queueMicrotask(() => { throw error; });
});
