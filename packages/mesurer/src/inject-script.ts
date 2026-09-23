import {
  mountMesurer,
  type MountedMesurer,
} from "./index";
import type { MesurerInjectConfig } from "./inject";

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

const mountInjectedMesurer = (): MountedMesurer => {
  const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : document.body;

  if (!target) throw new Error(`Mesurer injection target not found: ${targetSelector}`);

  globalThis.__MESURER_INSTANCE__?.dispose();

  return mountMesurer({
    ...options,
    target,
    agent: { globalName, root: document },
  });
};


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

const mesurer = reusableExisting ?? mountInjectedMesurer();

globalThis.__MESURER_INSTANCE__ = mesurer;

globalThis.__MESURER_INJECT_RECOVERY__?.stop();
delete globalThis.__MESURER_INJECT_RECOVERY__;

if (recoverDisconnected) installDisconnectedRecovery(mountInjectedMesurer);

// The agent global is installed synchronously by mountMesurer(). Consumers can
// immediately call window[globalName].ready() through their existing browser
// evaluation primitive. Avoid top-level await so this file can be emitted as a
// classic self-executing script instead of an ES module.
void mesurer.ready.catch((error) => {
  queueMicrotask(() => { throw error; });
});
