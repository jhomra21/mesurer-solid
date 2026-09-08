import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

/**
 * The unified Typography inspector has to create its placement shell while the
 * edit ring is still inside Mesurer's normal portal. Once that structure
 * exists, move the intact runtime into the document layer so CSS anchors can
 * follow compositor scrolling. Restore it when editing ends so the next edit
 * starts from the normal portal again.
 */
export function stabilizeNativeScrollRuntimeLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  const mounts = ownerDocument.querySelectorAll<HTMLElement>(
    "[data-mesurer-text-edit-runtime='true'][data-mesurer-native-scroll-runtime-layer='true']",
  );
  const mount = mounts.item(mounts.length - 1);
  if (!mount || !ownerDocument.body) return;

  let disposed = false;
  let queued = false;

  // Native anchoring installs last and initially moves this owner to <body>.
  // Put it back before the first edit so the existing inspector can discover
  // the ring and create its placement shell without any special-case path.
  if (mount.parentNode !== portalTarget) portalTarget.append(mount);

  const sync = () => {
    if (disposed || !mount.isConnected) return;
    const ring = mount.querySelector<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const shell = mount.querySelector<HTMLElement>("[data-mesurer-text-inspector-placement-shell='true']");
    const card = mount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    const readyForDocumentLayer = Boolean(ring?.isConnected && shell?.isConnected && card?.isConnected);

    if (readyForDocumentLayer) {
      if (mount.parentNode !== ownerDocument.body) ownerDocument.body.append(mount);
      return;
    }

    if (mount.parentNode !== portalTarget) portalTarget.append(mount);
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const observer = new ownerWindow.MutationObserver(schedule);
  observer.observe(mount, { subtree: true, childList: true });
  ownerWindow.addEventListener("dblclick", schedule, true);
  ownerWindow.addEventListener("pointerup", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    ownerWindow.removeEventListener("dblclick", schedule, true);
    ownerWindow.removeEventListener("pointerup", schedule, true);
  });
}
