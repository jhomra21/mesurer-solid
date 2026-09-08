import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Keep custom Typography dropdown popups inside the same pointer-interactive
 * rectangle as the inspector card. The isolated Mesurer host is intentionally
 * zero-sized, so overflow can paint outside an interactive ancestor without
 * becoming a reliable pointer target in every browser. Dropdowns therefore
 * overlay the card itself instead of relying on out-of-bounds hit testing.
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
  let frame = 0;

  const positionPopup = (popup: HTMLElement, shell: HTMLElement) => {
    const kind = popup.dataset.mesurerUnifiedSelectKind;
    if (!kind) return;
    const trigger = Array.from(
      shell.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-trigger]"),
    ).find((candidate) => candidate.dataset.mesurerUnifiedSelectTrigger === kind);
    if (!trigger) return;

    const shellRect = shell.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    if (shellRect.width <= 0 || shellRect.height <= 0 || triggerRect.width <= 0) return;

    popup.style.position = "absolute";
    popup.style.width = `${triggerRect.width}px`;
    popup.style.maxWidth = `${shellRect.width}px`;
    popup.style.margin = "0";

    const left = clamp(
      triggerRect.left - shellRect.left,
      0,
      Math.max(0, shellRect.width - triggerRect.width),
    );
    const above = Math.max(0, triggerRect.top - shellRect.top - MENU_GAP);
    const below = Math.max(0, shellRect.bottom - triggerRect.bottom - MENU_GAP);
    const naturalHeight = Math.min(MENU_MAX_HEIGHT, Math.max(MENU_MIN_HEIGHT, popup.scrollHeight));
    const openBelow = below >= naturalHeight || below >= above;
    const available = Math.max(MENU_MIN_HEIGHT, openBelow ? below : above);
    const height = Math.min(naturalHeight, available, MENU_MAX_HEIGHT);
    const top = openBelow
      ? triggerRect.bottom - shellRect.top + MENU_GAP
      : triggerRect.top - shellRect.top - MENU_GAP - height;

    popup.style.left = `${left}px`;
    popup.style.top = `${clamp(top, 0, Math.max(0, shellRect.height - height))}px`;
    popup.style.maxHeight = `${height}px`;
  };

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
        positionPopup(popup, shell);
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
  });
}
