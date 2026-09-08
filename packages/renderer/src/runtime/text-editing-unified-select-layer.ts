import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const VIEWPORT_PADDING = 8;
const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Give Typography dropdowns a real viewport-sized interaction surface.
 *
 * Mesurer's protected outer host is intentionally zero-sized so ordinary page
 * input can pass around the renderer. That works for fixed descendants that
 * own their own box, but a dropdown painted as overflow from an inspector-sized
 * ancestor is not a reliable hit target in every browser/top-layer combination.
 *
 * This layer spans the viewport while remaining pointer-transparent. Only the
 * popup itself opts back into pointer input, so the page stays interactive
 * everywhere outside the open menu.
 */
export function installUnifiedTextSelectLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies the matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const mounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = mounts.item(mounts.length - 1);
  if (!runtimeMount) return;

  const interactionLayer = ownerDocument.createElement("div");
  interactionLayer.dataset.mesurerUnifiedSelectInteractionLayer = "true";
  interactionLayer.dataset.mesurerInspectorUi = "true";
  Object.assign(interactionLayer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    width: "100vw",
    height: "100vh",
    overflow: "visible",
    pointerEvents: "none",
  });
  runtimeMount.append(interactionLayer);

  let disposed = false;
  let moving = false;
  let frame = 0;

  const triggerFor = (popup: HTMLElement) => {
    const kind = popup.dataset.mesurerUnifiedSelectKind;
    if (!kind) return null;
    return Array.from(
      runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-trigger]"),
    ).find((candidate) => candidate.dataset.mesurerUnifiedSelectTrigger === kind) ?? null;
  };

  const positionPopup = (popup: HTMLElement) => {
    const trigger = triggerFor(popup);
    if (!trigger?.isConnected) return;

    const triggerRect = trigger.getBoundingClientRect();
    if (triggerRect.width <= 0 || triggerRect.height <= 0) return;

    popup.style.position = "fixed";
    popup.style.pointerEvents = "auto";
    popup.style.margin = "0";

    const width = Math.min(
      Math.max(triggerRect.width, 120),
      Math.max(120, ownerWindow.innerWidth - VIEWPORT_PADDING * 2),
    );
    popup.style.width = `${width}px`;
    popup.style.maxWidth = `${Math.max(120, ownerWindow.innerWidth - VIEWPORT_PADDING * 2)}px`;

    const naturalHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(MENU_MIN_HEIGHT, popup.scrollHeight),
    );
    const below = Math.max(
      0,
      ownerWindow.innerHeight - VIEWPORT_PADDING - triggerRect.bottom - MENU_GAP,
    );
    const above = Math.max(0, triggerRect.top - VIEWPORT_PADDING - MENU_GAP);
    const openBelow = below >= naturalHeight || below >= above;
    const available = Math.max(MENU_MIN_HEIGHT, openBelow ? below : above);
    const height = Math.min(naturalHeight, available, MENU_MAX_HEIGHT);

    const left = clamp(
      triggerRect.left,
      VIEWPORT_PADDING,
      Math.max(VIEWPORT_PADDING, ownerWindow.innerWidth - VIEWPORT_PADDING - width),
    );
    const top = openBelow
      ? triggerRect.bottom + MENU_GAP
      : triggerRect.top - MENU_GAP - height;

    popup.style.left = `${left}px`;
    popup.style.top = `${clamp(
      top,
      VIEWPORT_PADDING,
      Math.max(VIEWPORT_PADDING, ownerWindow.innerHeight - VIEWPORT_PADDING - height),
    )}px`;
    popup.style.maxHeight = `${height}px`;
  };

  const reconcile = () => {
    if (disposed || moving) return;
    moving = true;
    try {
      const popups = Array.from(
        runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-popup='true']"),
      );

      // The inspector placement shell uses the same maximum z-index. Keep the
      // active menu layer after it in DOM order so menu options paint and hit-test
      // above inspector controls such as color swatches.
      if (popups.length > 0 && runtimeMount.lastElementChild !== interactionLayer) {
        runtimeMount.append(interactionLayer);
      }

      for (const popup of popups) {
        if (popup.parentElement !== interactionLayer) interactionLayer.append(popup);
        positionPopup(popup);
      }
    } finally {
      moving = false;
    }
  };

  const schedule = () => {
    reconcile();
    if (disposed || frame) return;
    frame = ownerWindow.requestAnimationFrame(() => {
      frame = 0;
      reconcile();
    });
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  ownerWindow.addEventListener("resize", schedule);
  ownerWindow.addEventListener("scroll", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    ownerWindow.removeEventListener("resize", schedule);
    ownerWindow.removeEventListener("scroll", schedule, true);
    interactionLayer.remove();
  });
}
