import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

/**
 * The unified Typography inspector has to create its placement shell while the
 * edit ring is still inside Mesurer's normal portal. Once that structure
 * exists, move the intact runtime into the document layer so CSS anchors can
 * follow compositor scrolling. Keep it there for the lifetime of that edit so
 * transient inspector rebuilds cannot reparent the pointer target between
 * pointerup and click; restore it only after the editor itself is gone.
 */
export function stabilizeNativeScrollRuntimeLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies this runtime's DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
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
    const editor = mount.querySelector<HTMLTextAreaElement>("[data-mesurer-text-editor='true']");
    if (!editor?.isConnected) {
      if (mount.parentNode !== portalTarget) portalTarget.append(mount);
      return;
    }

    // Once an active edit has entered the document layer, do not move it back
    // just because the inspector temporarily rebuilds a child. Reparenting the
    // pointer target during a native click sequence can suppress the click.
    if (mount.parentNode === ownerDocument.body) return;

    const ring = mount.querySelector<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const shell = mount.querySelector<HTMLElement>("[data-mesurer-text-inspector-placement-shell='true']");
    const card = mount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    if (ring?.isConnected && shell?.isConnected && card?.isConnected) {
      ownerDocument.body.append(mount);
    }
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(mount, { subtree: true, childList: true });
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
  });
}
