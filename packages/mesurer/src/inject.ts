import { mountMeasurer, type MountMeasurerOptions, type MountedMeasurer } from "./index";

export type MesurerInjectConfig = Omit<MountMeasurerOptions, "target" | "agent"> & {
  /** Optional application container selector. Defaults to document.body. */
  target?: string;
  /** Global agent API name. Defaults to __MESURER__. */
  globalName?: string;
};

type InjectionGlobal = typeof globalThis & {
  __MESURER_CONFIG__?: MesurerInjectConfig;
  __MESURER_INSTANCE__?: MountedMeasurer;
};

const globalObject = globalThis as InjectionGlobal;
const config = globalObject.__MESURER_CONFIG__ ?? {};
const { target: targetSelector, globalName = "__MESURER__", ...options } = config;
const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

// Reinjection is intentionally deterministic for agent/HMR loops.
globalObject.__MESURER_INSTANCE__?.dispose();

export const mesurer = mountMeasurer({
  ...options,
  target,
  agent: { globalName, root: document },
});

globalObject.__MESURER_INSTANCE__ = mesurer;
await mesurer.ready;
