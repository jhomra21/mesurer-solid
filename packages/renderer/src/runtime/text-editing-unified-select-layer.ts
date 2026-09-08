import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const MENU_GAP = 4;
const MENU_PADDING = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Keep Typography dropdowns inside the inspector placement shell's real
 * hit-test rectangle. The shell is already a proven pointer-interactive Mesurer
 * surface; using local absolute coordinates avoids depending on overflow from
 * the renderer's pointer-transparent roots.
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

  const triggerFor = (popup: HTMLElement) => {
    const kind = popup.dataset.mesurerUnifiedSelectKind;
    if (!kind) return null;
    return Array.from(
      runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-trigger]"),
    ).find((candidate) => candidate.dataset.mesurerUnifiedSelectTrigger === kind) ?? null;
  };

  const positionInsideShell = (popup: HTMLElement, shell: HTMLElement) => {
    const trigger = triggerFor(popup);
    if (!trigger?.isConnected) return;

    const triggerRect = trigger.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    if (
      triggerRect.width <= 0
      || triggerRect.height <= 0
      || shellRect.width <= 0
      || shellRect.height <= 0
    ) return;

    popup.style.position = "absolute";
    popup.style.inset = "auto";
    popup.style.margin = "0";
    popup.style.pointerEvents = "auto";
    popup.style.zIndex = "2147483647";

    const usableWidth = Math.max(1, shellRect.width - MENU_PADDING * 2);
    const width = Math.min(Math.max(triggerRect.width, 120), usableWidth);
    popup.style.width = `${width}px`;
    popup.style.maxWidth = `${usableWidth}px`;

    const shellMaxHeight = Math.max(1, shellRect.height - MENU_PADDING * 2);
    const naturalHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(MENU_MIN_HEIGHT, popup.scrollHeight),
    );
    const height = Math.min(naturalHeight, shellMaxHeight);
    popup.style.maxHeight = `${height}px`;

    const triggerLeft = triggerRect.left - shellRect.left;
    const triggerTop = triggerRect.top - shellRect.top;
    const triggerBottom = triggerRect.bottom - shellRect.top;
    const spaceAbove = Math.max(0, triggerTop - MENU_GAP - MENU_PADDING);
    const spaceBelow = Math.max(0, shellRect.height - triggerBottom - MENU_GAP - MENU_PADDING);
    const openBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const desiredTop = openBelow
      ? triggerBottom + MENU_GAP
      : triggerTop - MENU_GAP - height;

    const maxLeft = Math.max(MENU_PADDING, shellRect.width - MENU_PADDING - width);
    const maxTop = Math.max(MENU_PADDING, shellRect.height - MENU_PADDING - height);
    popup.style.left = `${clamp(triggerLeft, MENU_PADDING, maxLeft)}px`;
    popup.style.top = `${clamp(desiredTop, MENU_PADDING, maxTop)}px`;
  };

  const reconcile = () => {
    if (disposed || moving) return;
    moving = true;
    try {
      const shell = runtimeMount.querySelector<HTMLElement>(
        "[data-mesurer-text-inspector-placement-shell='true']",
      );
      if (!shell) return;

      for (const popup of Array.from(
        runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-popup='true']"),
      )) {
        // Append after the card so equal-z-index inspector controls cannot paint
        // above the active menu.
        if (popup.parentElement !== shell || shell.lastElementChild !== popup) shell.append(popup);
        positionInsideShell(popup, shell);
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
