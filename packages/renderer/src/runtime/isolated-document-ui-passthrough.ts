import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type CachedUiRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const DOCUMENT_UI_SELECTOR = "[data-mesurer-inspector-ui='true']";
const SCROLL_IDLE_MS = 80;

const isDocumentBackedIsolatedRuntime = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => runtime.portalTarget instanceof realm.ShadowRoot
  && !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

const containsPoint = (rect: CachedUiRect, x: number, y: number) => (
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
);

/**
 * The public isolated mount lives in the browser top layer while page-following
 * inspector surfaces such as Typography and annotation actions may be portaled
 * into the document so CSS anchors can follow the inspected page element.
 *
 * A top-layer selection plane otherwise wins hit testing even when one of those
 * document-backed Mesurer controls is visibly on top of the page. Keep a small
 * cached set of rendered Mesurer UI rectangles and make only the selection/
 * ruler plane transparent while the pointer is over one of them. The real
 * browser event then lands on the real document-backed control; nothing is
 * redispatched or synthesized.
 *
 * Geometry is sampled when Mesurer-owned UI changes, on resize, and once after
 * scrolling settles. Pointer movement is O(number of visible Mesurer surfaces)
 * scalar containment checks only, and the scroll hot path does no layout reads.
 */
export function installIsolatedDocumentUiPassthrough(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument and portalTarget.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedIsolatedRuntime(runtime, realm)) return;

  const rendererRoot = portalTarget.querySelector<HTMLElement>("[data-mesurer-root='true']");
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
  let cachedRects: CachedUiRect[] = [];
  let pointer: { x: number; y: number } | null = null;

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
    applyPointer();
  };

  const scheduleCapture = () => {
    if (disposed || captureFrame) return;
    captureFrame = ownerWindow.requestAnimationFrame(capture);
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

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    applyPointer();
  };
  const onPointerLeave = () => {
    pointer = null;
    setPassthrough(false);
  };
  const onResize = () => scheduleCapture();
  const onScroll = () => {
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scheduleCapture();
    }, SCROLL_IDLE_MS);
  };

  ownerWindow.addEventListener("pointermove", onPointerMove, true);
  ownerWindow.addEventListener("blur", onPointerLeave, true);
  ownerWindow.addEventListener("resize", onResize, true);
  ownerWindow.addEventListener("scroll", onScroll, true);
  scheduleCapture();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (captureFrame) ownerWindow.cancelAnimationFrame(captureFrame);
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    ownerWindow.removeEventListener("pointermove", onPointerMove, true);
    ownerWindow.removeEventListener("blur", onPointerLeave, true);
    ownerWindow.removeEventListener("resize", onResize, true);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    setPassthrough(false);
    style.remove();
    cachedRects = [];
    pointer = null;
  });
}
