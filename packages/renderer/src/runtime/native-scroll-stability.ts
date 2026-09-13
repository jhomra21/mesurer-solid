import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const FALLBACK_SETTLE_MS = 48;
const HIGHLIGHT_SELECTOR = "[data-mesurer-text-selection-highlight='true']";

type ScrollBaseline = {
  x: number;
  y: number;
};

/**
 * Keep native anchor fallbacks stable while compositor scrolling owns the
 * visible geometry.
 *
 * The scroll-event hot path is intentionally O(1): it samples only window
 * scrollX/scrollY and resets one idle timer. Selection-highlight nodes are
 * registered when they enter the document, then their hidden inline fallback
 * coordinates are reconciled once the scroll burst settles. This keeps DOM
 * scans, layout reads, and per-highlight writes out of trackpad/wheel events.
 *
 * The 48ms reconciliation runs before document-scroll-anchoring's 80ms settle
 * pass, so that pass still sees fallback coordinates in the expected viewport
 * space when it needs to re-bind an anchor.
 */
export function installNativeScrollStability(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;

  const style = ownerDocument.createElement("style");
  style.dataset.mesurerNativeScrollStability = "true";
  style.dataset.mesurerInspectorUi = "true";
  style.textContent = `
[data-mesurer-selected-measurement="true"] > div {
  transition: none !important;
  animation: none !important;
}
`;
  ownerDocument.head.append(style);

  const highlights = new Map<HTMLElement, ScrollBaseline>();
  let latestX = ownerWindow.scrollX;
  let latestY = ownerWindow.scrollY;
  let settleTimer = 0;
  let disposed = false;

  const registerHighlight = (element: HTMLElement) => {
    if (highlights.has(element)) return;
    highlights.set(element, { x: latestX, y: latestY });
  };

  const registerNode = (node: Node) => {
    if (!(node instanceof realm.HTMLElement)) return;
    if (node.matches(HIGHLIGHT_SELECTOR)) registerHighlight(node);
    for (const highlight of node.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR)) {
      registerHighlight(highlight);
    }
  };

  for (const highlight of ownerDocument.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR)) {
    registerHighlight(highlight);
  }

  const observer = new realm.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) registerNode(node);
    }
  });
  if (ownerDocument.body) observer.observe(ownerDocument.body, { childList: true, subtree: true });

  const reconcileFallbacks = () => {
    settleTimer = 0;
    if (disposed) return;
    for (const [highlight, baseline] of Array.from(highlights)) {
      if (!highlight.isConnected) {
        highlights.delete(highlight);
        continue;
      }

      const deltaX = latestX - baseline.x;
      const deltaY = latestY - baseline.y;
      baseline.x = latestX;
      baseline.y = latestY;
      if (deltaX === 0 && deltaY === 0) continue;
      if (highlight.dataset.mesurerNativeScrollAnchor !== "offset") continue;

      const left = Number.parseFloat(highlight.style.left);
      const top = Number.parseFloat(highlight.style.top);
      if (Number.isFinite(left)) highlight.style.left = `${left - deltaX}px`;
      if (Number.isFinite(top)) highlight.style.top = `${top - deltaY}px`;
    }
  };

  const onScroll = () => {
    if (disposed) return;
    latestX = ownerWindow.scrollX;
    latestY = ownerWindow.scrollY;
    if (settleTimer) ownerWindow.clearTimeout(settleTimer);
    settleTimer = ownerWindow.setTimeout(reconcileFallbacks, FALLBACK_SETTLE_MS);
  };

  ownerWindow.addEventListener("scroll", onScroll, { capture: true, passive: true });

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (settleTimer) ownerWindow.clearTimeout(settleTimer);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    highlights.clear();
    style.remove();
  });
}
