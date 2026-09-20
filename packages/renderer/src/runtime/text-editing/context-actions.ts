import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../../ComposableMesurer";

const EDITOR = "[data-mesurer-text-editor='true']";

const RUNTIME_MOUNT = "[data-mesurer-text-edit-runtime='true']";

const RENDERER_ROOT = "[data-mesurer-root='true']";

const ACTIVE_ATTRIBUTE = "data-mesurer-direct-text-edit-active";

/**
 * Direct text edit can intentionally render in a document-backed runtime while
 * Context stays inside the canonical renderer root. Keep those two ownership
 * planes explicit: observe editor lifecycle in the text runtime, but publish
 * contextual-action suppression on the exact renderer root that owns Context.
 *
 * Production renderer runtimes carry that root identity explicitly. The local
 * ancestor fallback exists only for synthetic/test runtimes that predate the
 * identity field; it never queries another renderer root from the portal.
 *
 * The observer remains scoped to Mesurer's text-edit runtime. It never watches
 * page content and does no work on pointermove or scroll.
 */
export function installDirectEditContextActionSuppression(
  ctx: MesurerPluginContext,
  textRuntime: MesurerSolidRuntimeService,
  rendererRuntime: MesurerSolidRuntimeService,
) {
  const { ownerWindow, portalTarget } = textRuntime;
  // SAFETY: ownerWindow is the browsing-context global paired with this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  const mounts = portalTarget.querySelectorAll<HTMLElement>(RUNTIME_MOUNT);
  const runtimeMount = mounts.item(mounts.length - 1);

  const rendererRoot = rendererRuntime.rendererRoot
    ?? runtimeMount?.closest<HTMLElement>(RENDERER_ROOT)
    ?? null;

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
