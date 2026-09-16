import {
  mountMesurer,
  type MountMesurerOptions,
  type MountedMesurer,
} from "./index";

export type MesurerInjectConfig = Omit<MountMesurerOptions, "target" | "agent"> & {
  /** Optional application container selector. Defaults to document.body. */
  target?: string;
  /** Global agent API name. Defaults to __MESURER__. */
  globalName?: string;
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
  var __MESURER_INSTANCE__: MountedMesurer | undefined;
}

const config = globalThis.__MESURER_CONFIG__ ?? {};
const {
  target: targetSelector,
  globalName = "__MESURER__",
  reuseExisting = true,
  ...options
} = config;

const existing = globalThis.__MESURER_INSTANCE__;
const reusableExisting = reuseExisting && existing?.element.isConnected
  ? existing
  : undefined;

function mountInjectedMesurer(): MountedMesurer {
  const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;
  if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

  existing?.dispose();
  return mountMesurer({
    ...options,
    target,
    agent: { globalName, root: document },
  });
}

export const mesurer = reusableExisting ?? mountInjectedMesurer();
globalThis.__MESURER_INSTANCE__ = mesurer;
await mesurer.ready;
