import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const MENU_GAP = 4;
const MENU_PADDING = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Keep Typography dropdowns inside the active inspector card.
 *
 * The text-edit core treats pointer input inside its inspector card as part of
 * the active edit session. Keeping custom menus as descendants of that card
 * preserves that ownership through native pointerdown/click dispatch while the
 * placement shell still provides the viewport-constrained positioning frame.
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

  const positionInsideCard = (
    popup: HTMLElement,
    shell: HTMLElement,
    card: HTMLElement,
  ) => {
    const trigger = triggerFor(popup);
    if (!trigger?.isConnected) return;

    const triggerRect = trigger.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (
      triggerRect.width <= 0
      || triggerRect.height <= 0
      || shellRect.width <= 0
      || shellRect.height <= 0
      || cardRect.width <= 0
      || cardRect.height <= 0
    ) return;

    popup.style.position = "absolute";
    popup.style.inset = "auto";
    popup.style.margin = "0";
    popup.style.pointerEvents = "auto";
    popup.style.zIndex = "2147483647";

    const usableWidth = Math.max(1, cardRect.width - MENU_PADDING * 2);
    const width = Math.min(Math.max(triggerRect.width, 120), usableWidth);
    popup.style.width = `${width}px`;
    popup.style.maxWidth = `${usableWidth}px`;

    const cardMaxHeight = Math.max(1, cardRect.height - MENU_PADDING * 2);
    const naturalHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(MENU_MIN_HEIGHT, popup.scrollHeight),
    );
    const height = Math.min(naturalHeight, cardMaxHeight);
    popup.style.maxHeight = `${height}px`;

    // The card is static inside the fixed placement shell, so absolute popup
    // coordinates are expressed in the shell's coordinate space. Clamp them
    // to the card's actual visible rectangle so overflow never becomes part of
    // the pointer-ownership contract.
    const cardLeft = cardRect.left - shellRect.left;
    const cardTop = cardRect.top - shellRect.top;
    const triggerLeft = triggerRect.left - shellRect.left;
    const triggerTop = triggerRect.top - shellRect.top;
    const triggerBottom = triggerRect.bottom - shellRect.top;
    const spaceAbove = Math.max(0, triggerTop - cardTop - MENU_GAP - MENU_PADDING);
    const cardBottom = cardRect.bottom - shellRect.top;
    const spaceBelow = Math.max(0, cardBottom - triggerBottom - MENU_GAP - MENU_PADDING);
    const openBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const desiredTop = openBelow
      ? triggerBottom + MENU_GAP
      : triggerTop - MENU_GAP - height;

    const minLeft = cardLeft + MENU_PADDING;
    const maxLeft = Math.max(minLeft, cardLeft + cardRect.width - MENU_PADDING - width);
    const minTop = cardTop + MENU_PADDING;
    const maxTop = Math.max(minTop, cardTop + cardRect.height - MENU_PADDING - height);
    popup.style.left = `${clamp(triggerLeft, minLeft, maxLeft)}px`;
    popup.style.top = `${clamp(desiredTop, minTop, maxTop)}px`;
  };

  const reconcile = () => {
    if (disposed || moving) return;
    moving = true;
    try {
      const shell = runtimeMount.querySelector<HTMLElement>(
        "[data-mesurer-text-inspector-placement-shell='true']",
      );
      const card = runtimeMount.querySelector<HTMLElement>(
        "[data-mesurer-text-inspector-info='true'][data-mesurer-text-inspector-unified='true']",
      );
      if (!shell || !card) return;

      for (const popup of Array.from(
        runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-unified-select-popup='true']"),
      )) {
        // The popup remains a descendant of the core-owned inspector card so a
        // native pointerdown cannot be mistaken for an outside-editor click.
        // Append it last so it paints above equal-z-index inspector controls.
        if (popup.parentElement !== card || card.lastElementChild !== popup) card.append(popup);
        positionInsideCard(popup, shell, card);
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
