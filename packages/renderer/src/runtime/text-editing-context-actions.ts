import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const EDITOR = "[data-mesurer-text-editor='true']";
const RUNTIME_MOUNT = "[data-mesurer-text-edit-runtime='true']";
const RENDERER_ROOT = "[data-mesurer-root='true']";
const ACTIVE_ATTRIBUTE = "data-mesurer-direct-text-edit-active";

/**
 * Direct text edit and Context are both renderer-owned interactions. Keep their
 * coordination inside the same canonical Mesurer root rather than using a
 * document-global style/attribute that cannot cross an isolated ShadowRoot.
 *
 * The observer is scoped to Mesurer's text-edit runtime. It never watches page
 * content and does no work on pointermove or scroll.
 */
export function installDirectEditContextActionSuppression(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global paired with this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  const mounts = portalTarget.querySelectorAll<HTMLElement>(RUNTIME_MOUNT);
  const runtimeMount = mounts.item(mounts.length - 1);
  const rendererRoot = runtimeMount?.closest<HTMLElement>(RENDERER_ROOT) ?? null;
  if (!runtimeMount?.isConnected || !rendererRoot?.isConnected) return;

  let active = false;
  const sync = () => {
    const next = Boolean(runtimeMount.querySelector(EDITOR));
    if (next === active) return;
    active = next;
    if (active) rendererRoot.setAttribute(ACTIVE_ATTRIBUTE, "true");
    else rendererRoot.removeAttribute(ACTIVE_ATTRIBUTE);
  };

  const observer = new realm.MutationObserver(sync);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  sync();

  ctx.lifecycle.onDispose(() => {
    observer.disconnect();
    rendererRoot.removeAttribute(ACTIVE_ATTRIBUTE);
  });
}
