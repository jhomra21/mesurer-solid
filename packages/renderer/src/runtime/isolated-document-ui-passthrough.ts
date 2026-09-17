import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type CachedUiRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const DOCUMENT_UI_SELECTOR = "[data-mesurer-inspector-ui='true'], [data-mesurer-annotation-marker='true']";
const SCROLL_IDLE_MS = 80;

const isDocumentBackedRuntime = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument
  && (
    runtime.portalTarget instanceof realm.ShadowRoot
      ? runtime.portalTarget.host.getRootNode() === runtime.ownerDocument
      : runtime.portalTarget.getRootNode() === runtime.ownerDocument
  );

const containsPoint = (rect: CachedUiRect, x: number, y: number) => (
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
);

/**
 * Mesurer's protected renderer host can sit above ordinary document content,
 * while page-following inspector surfaces such as Typography and Context notes
 * intentionally live in the document so window scrolling is compositor-owned.
 * This is true for both the isolated top-layer host and the fixed non-isolated
 * compatibility host.
 *
 * A protected selection plane otherwise wins hit testing even when one of those
 * document-backed Mesurer controls is visibly on top of the page. Keep a small
 * cached set of rendered Mesurer UI rectangles and make only the selection/
 * ruler plane transparent while the pointer is over one of them. The real
 * browser event then lands on the real document-backed control; nothing is
 * redispatched or synthesized.
 *
 * Geometry is sampled when Mesurer-owned UI changes, on resize, and once after
 * scrolling settles. Window scrolling translates the cached rectangles by the
 * known scroll delta, so even a stationary pointer stays synchronized without a
 * layout read. Nested scrolling only marks the cache stale; the next pointer
 * approach may synchronously refresh it before the ensuing press. The scroll
 * hot path itself performs no DOM queries or geometry reads.
 */
export function installIsolatedDocumentUiPassthrough(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and portalTarget.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedRuntime(runtime, realm)) return;

  const rendererRoot = runtime.rendererRoot
    ?? portalTarget.querySelector<HTMLElement>("[data-mesurer-root='true']");
  if (!rendererRoot) return;

  const style = ownerDocument.createElement("style");
  style.dataset.mesurerDocumentUiPassthroughStyle = "true";
  style.textContent = `
[data-mesurer-document-ui-passthrough="true"] {
  pointer-events: none !important;
}
[data-mesurer-document-ui-passthrough="true"] > :not([data-mesurer-inspector-ui="true"]),
[data-mesurer-document-ui-passthrough="true"] > :not([data-mesurer-inspector-ui="true"]) * {
  pointer-events: none !important;
}
`;
  portalTarget.append(style);

  let disposed = false;
  let captureFrame = 0;
  let scrollIdleTimer = 0;
  let geometryStale = false;
  let cachedRects: CachedUiRect[] = [];
  let pointer: { x: number; y: number } | null = null;
  let windowScrollX = ownerWindow.scrollX;
  let windowScrollY = ownerWindow.scrollY;

  const setPassthrough = (active: boolean) => {
    if (active) rendererRoot.dataset.mesurerDocumentUiPassthrough = "true";
    else delete rendererRoot.dataset.mesurerDocumentUiPassthrough;
  };

  const applyPointer = () => {
    if (!pointer) {
      setPassthrough(false);
      return;
    }
    setPassthrough(cachedRects.some((rect) => containsPoint(rect, pointer!.x, pointer!.y)));
  };

  const capture = () => {
    captureFrame = 0;
    geometryStale = false;
    if (disposed) return;
    const next: CachedUiRect[] = [];
    for (const element of ownerDocument.body.querySelectorAll<HTMLElement>(DOCUMENT_UI_SELECTOR)) {
      if (!element.isConnected || element.getRootNode() !== ownerDocument) continue;
      if (element.getAttribute("aria-hidden") === "true") continue;
      const computed = ownerWindow.getComputedStyle(element);
      if (computed.display === "none" || computed.visibility === "hidden" || computed.pointerEvents === "none") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= ownerWindow.innerWidth || rect.top >= ownerWindow.innerHeight) continue;
      next.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
    cachedRects = next;
    windowScrollX = ownerWindow.scrollX;
    windowScrollY = ownerWindow.scrollY;
    applyPointer();
  };

  const scheduleCapture = () => {
    if (disposed || captureFrame) return;
    captureFrame = ownerWindow.requestAnimationFrame(capture);
  };

  const flushStaleGeometry = () => {
    if (!geometryStale && !captureFrame) return false;
    if (captureFrame) ownerWindow.cancelAnimationFrame(captureFrame);
    captureFrame = 0;
    capture();
    return true;
  };

  const isMesurerUiNode = (node: Node) => {
    if (!(node instanceof realm.Element)) return false;
    return node.matches(DOCUMENT_UI_SELECTOR)
      || Boolean(node.closest(DOCUMENT_UI_SELECTOR))
      || Boolean(node.querySelector(DOCUMENT_UI_SELECTOR));
  };

  const observer = new realm.MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (record.type === "attributes") return isMesurerUiNode(record.target);
      if (isMesurerUiNode(record.target)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(isMesurerUiNode);
    });
    if (relevant) scheduleCapture();
  });
  observer.observe(ownerDocument.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "aria-hidden"],
  });

  const applyPointerEvent = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!flushStaleGeometry()) applyPointer();
  };
  const onPointerLeave = () => {
    pointer = null;
    setPassthrough(false);
  };
  const onResize = () => scheduleCapture();
  const onScroll = () => {
    const nextX = ownerWindow.scrollX;
    const nextY = ownerWindow.scrollY;
    const dx = nextX - windowScrollX;
    const dy = nextY - windowScrollY;
    windowScrollX = nextX;
    windowScrollY = nextY;

    if (dx || dy) {
      cachedRects = cachedRects.map((rect) => ({
        left: rect.left - dx,
        top: rect.top - dy,
        right: rect.right - dx,
        bottom: rect.bottom - dy,
      }));
      applyPointer();
    } else {
      // A nested scroller can move document-backed UI through its lightweight
      // compensation without changing window.scrollX/Y. Defer the layout read
      // until pointer approach or scroll settle rather than doing it here.
      geometryStale = true;
    }

    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scheduleCapture();
    }, SCROLL_IDLE_MS);
  };

  // Hover-capable pointers normally arrive through pointermove. Non-hover input
  // (touch/stylus tap) emits pointerover before pointerdown, which gives the same
  // shared boundary a chance to expose the real document control without a
  // synthetic redispatch.
  ownerWindow.addEventListener("pointermove", applyPointerEvent, true);
  ownerWindow.addEventListener("pointerover", applyPointerEvent, true);
  ownerWindow.addEventListener("blur", onPointerLeave, true);
  ownerWindow.addEventListener("resize", onResize, true);
  ownerWindow.addEventListener("scroll", onScroll, true);
  scheduleCapture();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (captureFrame) ownerWindow.cancelAnimationFrame(captureFrame);
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    ownerWindow.removeEventListener("pointermove", applyPointerEvent, true);
    ownerWindow.removeEventListener("pointerover", applyPointerEvent, true);
    ownerWindow.removeEventListener("blur", onPointerLeave, true);
    ownerWindow.removeEventListener("resize", onResize, true);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    setPassthrough(false);
    style.remove();
    geometryStale = false;
    cachedRects = [];
    pointer = null;
  });
}
