import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

/**
 * Keep custom Typography dropdown popups inside the same pointer-interactive
 * placement shell as the inspector card. The outer text runtime intentionally
 * owns no pointer surface of its own, so overflow painted directly beneath it
 * is not a reliable hit target in isolated/top-layer hosts.
 */
export function installUnifiedTextSelectLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies the matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const mounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = mounts.item(mounts.length - 1);
  if (!runtimeMount) return;

  let disposed = false;
  let moving = false;

  const reconcile = () => {
    if (disposed || moving) return;
    const shell = runtimeMount.querySelector<HTMLElement>(
      "[data-mesurer-text-inspector-placement-shell='true']",
    );
    if (!shell) return;

    moving = true;
    try {
      for (const popup of Array.from(
        runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-popup='true']"),
      )) {
        if (popup.parentElement !== shell) shell.append(popup);
      }
    } finally {
      moving = false;
    }
  };

  const observer = new realm.MutationObserver(reconcile);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  reconcile();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
  });
}
