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
  /**
   * Remount the injected instance if page DOM replacement disconnects its host.
   * Defaults to false. The browser extension enables this for explicitly opened tabs.
   */
  recoverDisconnected?: boolean;
};

declare global {
  var __MESURER_CONFIG__: MesurerInjectConfig | undefined;
  var __MESURER_INSTANCE__: MountedMesurer | undefined;
  var __MESURER_INJECT_RECOVERY__: { stop(): void } | undefined;
}

const config = globalThis.__MESURER_CONFIG__ ?? {};

const {
  target: targetSelector,
  globalName = "__MESURER__",
  reuseExisting = true,
  recoverDisconnected = false,
  ...options
} = config;

const existing = globalThis.__MESURER_INSTANCE__;

const reusableExisting = reuseExisting && existing?.element.isConnected
  ? existing
  : undefined;

function mountInjectedMesurer(): MountedMesurer {
  const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;

  if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

  globalThis.__MESURER_INSTANCE__?.dispose();

  return mountMesurer({
    ...options,
    target,
    agent: { globalName, root: document },
  });
}

const installDisconnectedRecovery = (
  mount: () => MountedMesurer,
) => {
  globalThis.__MESURER_INJECT_RECOVERY__?.stop();

  let stopped = false;
  let queued = false;

  const recover = () => {
    queued = false;

    if (stopped || globalThis.__MESURER_INSTANCE__?.element.isConnected) return;
    const next = mount();

    globalThis.__MESURER_INSTANCE__ = next;
    void next.ready.catch((error) => {
      queueMicrotask(() => { throw error; });
    });
  };

  const observer = new MutationObserver(() => {
    if (stopped || queued || globalThis.__MESURER_INSTANCE__?.element.isConnected) return;

    queued = true;
    queueMicrotask(recover);
  });

  observer.observe(document, { childList: true, subtree: true });

  globalThis.__MESURER_INJECT_RECOVERY__ = {
    stop() {
      stopped = true;
      observer.disconnect();
    },
  };
};

export const mesurer = reusableExisting ?? mountInjectedMesurer();

globalThis.__MESURER_INSTANCE__ = mesurer;

globalThis.__MESURER_INJECT_RECOVERY__?.stop();
delete globalThis.__MESURER_INJECT_RECOVERY__;

if (recoverDisconnected) installDisconnectedRecovery(mountInjectedMesurer);

await mesurer.ready;
