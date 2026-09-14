import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const MENU_GAP = 4;
const MENU_PADDING = 4;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_HEIGHT = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Let an open custom Typography menu consume Escape before the text-edit core.
 *
 * The core deliberately owns Escape at window-capture level so it can cancel a
 * direct edit from anywhere in the editing surface. A focused custom dropdown
 * is the one exception: Escape should close only that popup. The popup is
 * reparented into the core-owned inspector card after it opens, and browsers
 * may temporarily drop focus while moving that subtree. Treat the one open
 * Typography popup as authoritative even when it is absent from the keyboard
 * event's composed path, then delegate closing to the menu's real trigger.
 */
export function installUnifiedTextSelectEscapeGuard(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies the matching DOM constructors/events.
  const realm = ownerWindow as Window & typeof globalThis;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const pathPopup = event.composedPath().find((candidate) =>
      candidate instanceof realm.HTMLElement
      && candidate.dataset.mesurerUnifiedSelectPopup === "true");
    const popup = pathPopup instanceof realm.HTMLElement
      ? pathPopup
      : portalTarget.querySelector<HTMLElement>("[data-mesurer-unified-select-popup='true']");
    if (!popup) return;

    const kind = popup.dataset.mesurerUnifiedSelectKind;
    if (!kind) return;
    const card = popup.closest<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    const candidates = card?.querySelectorAll<HTMLButtonElement>("[data-mesurer-unified-select-trigger]")
      ?? portalTarget.querySelectorAll<HTMLButtonElement>("[data-mesurer-unified-select-trigger]");
    const trigger = Array.from(candidates)
      .find((candidate) => candidate.dataset.mesurerUnifiedSelectTrigger === kind);
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    // Delegate to the real menu owner instead of removing the popup directly.
    // This keeps its `openMenu` state, aria-expanded value, chevron, shell
    // chrome, and focus restoration in one lifecycle path.
    trigger.click();
  };

  ownerWindow.addEventListener("keydown", onKeyDown, true);
  ctx.lifecycle.onDispose(() => {
    ownerWindow.removeEventListener("keydown", onKeyDown, true);
  });
}

/**
 * Keep Typography dropdowns inside the active inspector card.
 *
 * The text-edit core treats pointer input inside its inspector card as part of
 * the active edit session. Keeping custom menus as descendants of that card
 * preserves that ownership through native pointerdown/click dispatch. The card
 * itself is the popup containing block, so its native scrolling carries the
 * trigger and menu through the same scroll space without a JavaScript handler.
 */
export function installUnifiedTextSelectLayer(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns ownerDocument/portalTarget and supplies their matching DOM constructors.
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

  const refineOptionSemantics = (popup: HTMLElement) => {
    if (popup.dataset.mesurerUnifiedSelectKind !== "font") return;
    for (const option of popup.querySelectorAll<HTMLButtonElement>("[data-mesurer-unified-select-option]")) {
      const value = option.dataset.mesurerUnifiedSelectOption;
      if (value) option.setAttribute("aria-label", value);
    }
  };

  const positionInsideCard = (
    popup: HTMLElement,
    card: HTMLElement,
  ) => {
    const trigger = triggerFor(popup);
    if (!trigger?.isConnected) return;

    // Make the scrolling card the containing block. An absolutely positioned
    // child whose containing block lives outside this scroller does not inherit
    // the trigger's internal-scroll movement, which is the beta.10 drift bug.
    // Relative positioning does not move the card itself; it only establishes
    // the coordinate space for this popup.
    card.style.position = "relative";

    const triggerRect = trigger.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (
      triggerRect.width <= 0
      || triggerRect.height <= 0
      || cardRect.width <= 0
      || cardRect.height <= 0
    ) return;

    popup.style.position = "absolute";
    popup.style.inset = "auto";
    popup.style.margin = "0";
    popup.style.pointerEvents = "auto";
    popup.style.zIndex = "2147483647";

    const viewportWidth = Math.max(1, card.clientWidth || cardRect.width);
    const viewportHeight = Math.max(1, card.clientHeight || cardRect.height);
    const usableWidth = Math.max(1, viewportWidth - MENU_PADDING * 2);
    const width = Math.min(Math.max(triggerRect.width, 120), usableWidth);
    popup.style.width = `${width}px`;
    popup.style.maxWidth = `${usableWidth}px`;

    const cardMaxHeight = Math.max(1, viewportHeight - MENU_PADDING * 2);
    const naturalHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(MENU_MIN_HEIGHT, popup.scrollHeight),
    );
    const height = Math.min(naturalHeight, cardMaxHeight);
    popup.style.maxHeight = `${height}px`;

    // Translate the trigger's rendered rectangle into the card's scroll-content
    // coordinate space once. The popup then remains at that content coordinate;
    // native card scrolling moves both trigger and popup by the same delta.
    const viewportLeft = card.scrollLeft;
    const viewportTop = card.scrollTop;
    const cardInnerLeft = cardRect.left + card.clientLeft;
    const cardInnerTop = cardRect.top + card.clientTop;
    const triggerLeft = triggerRect.left - cardInnerLeft + viewportLeft;
    const triggerTop = triggerRect.top - cardInnerTop + viewportTop;
    const triggerBottom = triggerRect.bottom - cardInnerTop + viewportTop;
    const viewportBottom = viewportTop + viewportHeight;
    const spaceAbove = Math.max(0, triggerTop - viewportTop - MENU_GAP - MENU_PADDING);
    const spaceBelow = Math.max(0, viewportBottom - triggerBottom - MENU_GAP - MENU_PADDING);
    const openBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const desiredTop = openBelow
      ? triggerBottom + MENU_GAP
      : triggerTop - MENU_GAP - height;

    const minLeft = viewportLeft + MENU_PADDING;
    const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - MENU_PADDING - width);
    const minTop = viewportTop + MENU_PADDING;
    const maxTop = Math.max(minTop, viewportBottom - MENU_PADDING - height);
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
        // Reparenting a focused subtree can drop document.activeElement in
        // browsers. Remember the active option and restore it after the move so
        // arrow/Escape keyboard ownership remains with the open listbox.
        const activeElement = ownerDocument.activeElement;
        const focusedDescendant = activeElement instanceof realm.HTMLElement && popup.contains(activeElement)
          ? activeElement
          : null;

        // The popup remains a descendant of the core-owned inspector card so a
        // native pointerdown cannot be mistaken for an outside-editor click.
        // Append it last so it paints above equal-z-index inspector controls.
        if (popup.parentElement !== card || card.lastElementChild !== popup) {
          card.append(popup);
          if (focusedDescendant?.isConnected) focusedDescendant.focus({ preventScroll: true });
        }
        refineOptionSemantics(popup);
        positionInsideCard(popup, card);
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
  // The popup and trigger share the Typography card's scroll-content coordinate
  // space. Page scrolling carries the whole anchored card, and internal card
  // scrolling carries both descendants, so neither path needs scroll work here.
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    ownerWindow.removeEventListener("resize", schedule);
  });
}
