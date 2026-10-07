// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { CLICK_CYCLE_THRESHOLD, MIN_MULTI_TARGET_SIZE, MIN_SINGLE_TARGET_SIZE } from "./constants";
import { getBodyElementsCached, getFrameToken, getRectFromDomCached } from "./dom";
import { isInsideMesurer, isMesurerInputBoundary } from "./events";
import { rectsOverlap } from "./geometry";
import { isElementWithinAccessibleTarget } from "./document-tree";
import {
  getAccessibleFrameDocument,
  parentPointToFrame,
} from "./frame-geometry";
import { pickMultiTargets, pickPointTarget, pickSingleTarget } from "./targets";
import { getDomTreeRoot, getVisualElementAtPoint, isElementWithinDomTarget, withPointerEventsDisabled } from "@jhomra21/mesurer-solid-dom";
import type { Point, Rect } from "./types";

const isShadowRoot = (value: Node): value is ShadowRoot => value.nodeType === 11;

const getOverlayHost = (overlayNode: HTMLDivElement | null) => {
  if (!overlayNode) return null;
  const rootNode = overlayNode.getRootNode();

  return isShadowRoot(rootNode) ? rootNode.host : null;
};

const isOverlayElement = (element: Element, overlayNode: HTMLDivElement | null, overlayHost: Element | null) =>
  Boolean(overlayNode?.contains(element) || (overlayHost && element === overlayHost));

const deepestOpenShadowHit = (
  element: Element,
  point: Point,
) => {
  let current = element;

  while (current.shadowRoot) {
    const nested = current.shadowRoot.elementFromPoint(point.x, point.y);

    if (!nested || nested === current) break;
    current = nested;
  }

  return current;
};

/**
 * Select's full-viewport interaction plane has to be ignored to discover page
 * content, but explicit Mesurer UI beneath that plane is a hard occluder. Check
 * the browser's physical hit stack before disabling the interaction overlay so
 * an inspector card, toolbar, settings panel, annotation control, or similar UI
 * can never be skipped in favor of inspected-page content underneath it.
 */
export const isSelectionPointBlockedByMesurerUi = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const ownerWindow = ownerDocument.defaultView;

  if (!ownerWindow) return false;
  // SAFETY: ownerWindow is ownerDocument.defaultView, so these constructors own every hit from ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;
  const overlayHost = getOverlayHost(overlayNode);

  for (const hit of ownerDocument.elementsFromPoint(point.x, point.y)) {
    if (!(hit instanceof realm.Element)) continue;
    const deepest = deepestOpenShadowHit(hit, point);

    if (isOverlayElement(deepest, overlayNode, overlayHost)) continue;

    if (isMesurerInputBoundary(deepest, ownerWindow)) return true;

    // Once the physical stack has reached ordinary inspected-page content,
    // anything underneath it is irrelevant to this pointer.
    if (
      isElementWithinDomTarget(deepest, pageTarget)
      && !isInsideMesurer(deepest, ownerWindow)
    ) return false;
  }

  return false;
};

const getSelectionTarget = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document,
  pageTarget: HTMLElement | ShadowRoot,
) => {
  if (isSelectionPointBlockedByMesurerUi(point, overlayNode, ownerDocument, pageTarget)) return null;

  return withPointerEventsDisabled(
    overlayNode,
    () => getVisualElementAtPoint(point, pageTarget, ownerDocument),
  );
};

export const getTargetElement = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const overlayHost = getOverlayHost(overlayNode);

  const initial = getSelectionTarget(
    point,
    overlayNode,
    ownerDocument,
    pageTarget,
  );

  const ownerWindow = ownerDocument.defaultView;

  if (!ownerWindow || !initial) return null;

  const element = deepestAccessibleFrameHit(initial, point);

  if (
    !isElementWithinAccessibleTarget(element, pageTarget)
    || isOverlayElement(element, overlayNode, overlayHost)
    || isInsideMesurer(element, ownerWindow)
  ) {
    return null;
  }

  if (
    element === element.ownerDocument.body
    || element === element.ownerDocument.documentElement
  ) {
    return null;
  }

  const rect = getRectFromDomCached(element);

  return rect.width > 2 && rect.height > 2 ? element : null;
};

export type ClickCycleState = {
  point: Point;
  index: number;
  stack: Element[];
};

const isSameClickSpot = (left: Point, right: Point) =>
  Math.abs(left.x - right.x) <= CLICK_CYCLE_THRESHOLD
  && Math.abs(left.y - right.y) <= CLICK_CYCLE_THRESHOLD;

const containingFrame = (ownerDocument: Document): Element | null => {
  try {
    return ownerDocument.defaultView?.frameElement ?? null;
  } catch {
    return null;
  }
};

const composedParentElement = (element: Element): Element | null => {
  if (element.parentElement) return element.parentElement;

  const root = element.getRootNode();

  if (isShadowRoot(root)) return root.host;

  return containingFrame(element.ownerDocument);
};

const deepestAccessibleFrameHit = (
  element: Element,
  point: Point,
) => {
  let current = element;
  let currentPoint = point;

  for (let depth = 0; depth < 16; depth += 1) {
    const childDocument = getAccessibleFrameDocument(current);

    if (!childDocument) break;

    const childPoint = parentPointToFrame(current, currentPoint);

    if (childPoint.x < 0 || childPoint.y < 0) break;

    const child = getVisualElementAtPoint(
      childPoint,
      childDocument,
      childDocument,
    );

    if (
      !child
      || child === childDocument.body
      || child === childDocument.documentElement
    ) {
      break;
    }

    current = child;
    currentPoint = childPoint;
  }

  return current;
};

const getPointSelectionStack = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document,
  pageTarget: HTMLElement | ShadowRoot,
) => {
  if (isSelectionPointBlockedByMesurerUi(point, overlayNode, ownerDocument, pageTarget)) return [];
  const ownerWindow = ownerDocument.defaultView;

  if (!ownerWindow) return [];
  // SAFETY: ownerWindow is ownerDocument.defaultView and therefore owns every Element returned by ownerDocument hit testing.
  const realm = ownerWindow as Window & typeof globalThis;
  const overlayHost = getOverlayHost(overlayNode);
  const stack: Element[] = [];
  const seen = new Set<Element>();

  const add = (element: Element | null) => {
    if (!element || seen.has(element)) return;

    if (
      !isElementWithinAccessibleTarget(element, pageTarget)
      || isOverlayElement(element, overlayNode, overlayHost)
      || isInsideMesurer(element, ownerWindow)
      || element === element.ownerDocument.body
      || element === element.ownerDocument.documentElement
    ) return;

    const rect = getRectFromDomCached(element);

    if (rect.width <= 2 || rect.height <= 2) return;
    seen.add(element);
    stack.push(element);
  };

  const addWithAncestors = (element: Element | null) => {
    let current = element;

    while (current) {
      add(current);

      if (current === pageTarget) break;
      current = composedParentElement(current);
    }
  };

  // Preserve Mesurer Solid's visual resolver as the first candidate. This keeps
  // pointer-transparent paint, open Shadow DOM, and scoped pageTarget behavior
  // identical to normal Select while still making deeper/outer candidates
  // reachable by repeated clicks.
  addWithAncestors(getTargetElement(point, overlayNode, ownerDocument, pageTarget));

  const nativeHits = withPointerEventsDisabled(
    overlayNode,
    () => ownerDocument.elementsFromPoint(point.x, point.y),
  );

  for (const raw of nativeHits) {
    if (!(raw instanceof realm.Element)) continue;
    addWithAncestors(deepestOpenShadowHit(raw, point));
  }

  return stack;
};

export const getShiftClickTarget = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => getTargetElement(point, overlayNode, ownerDocument, pageTarget);

export const getSnappedClickTarget = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  snapEnabled: boolean,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const direct = getTargetElement(point, overlayNode, ownerDocument, pageTarget);

  if (!snapEnabled || !direct) return direct;
  const probeRect: Rect = { left: point.x - 20, top: point.y - 20, width: 40, height: 40 };
  const entries = getSelectionEntries(probeRect, overlayNode, ownerDocument, pageTarget);
  const directRoot = getDomTreeRoot(direct);

  const treeEntries = directRoot.nodeType === 11
    ? entries.filter(({ element }) => getDomTreeRoot(element) === directRoot)
    : entries;

  const directEntry = treeEntries.find(({ element }) => element === direct);

  if (
    directEntry
    && directEntry.rect.width >= MIN_SINGLE_TARGET_SIZE
    && directEntry.rect.height >= MIN_SINGLE_TARGET_SIZE
  ) return direct;

  const candidates = directEntry
    ? treeEntries
    : [{ element: direct, rect: getRectFromDomCached(direct) }, ...treeEntries];

  return pickPointTarget(point, candidates) ?? pickSingleTarget(probeRect, point, candidates) ?? direct;
};

export const getCycledClickTarget = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  snapEnabled: boolean,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
  cycle: ClickCycleState | null = null,
) => {
  const ownerWindow = ownerDocument.defaultView;

  if (
    ownerWindow
    && cycle
    && isSameClickSpot(point, cycle.point)
    && cycle.stack.length > 0
  ) {
    const liveStack = cycle.stack.filter((element) =>
      element.isConnected
      && isElementWithinDomTarget(element, pageTarget)
      && !isInsideMesurer(element, ownerWindow)
    );

    if (liveStack.length > 0) {
      const current = cycle.stack[cycle.index] ?? null;
      const currentIndex = current ? liveStack.indexOf(current) : -1;
      const nextIndex = (currentIndex + 1 + liveStack.length) % liveStack.length;

      return {
        target: liveStack[nextIndex] ?? null,
        cycle: { point, index: nextIndex, stack: liveStack },
      };
    }
  }

  const initial = getSnappedClickTarget(
    point,
    overlayNode,
    snapEnabled,
    ownerDocument,
    pageTarget,
  );

  if (!initial) return { target: null, cycle: null };
  const candidates = getPointSelectionStack(point, overlayNode, ownerDocument, pageTarget);
  const stack = [initial, ...candidates.filter((element) => element !== initial)];

  return {
    target: initial,
    cycle: { point, index: 0, stack },
  };
};

export const getElementsInRect = (
  rect: Rect,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
): Element[] => {
  const entries = getSelectionEntries(rect, overlayNode, ownerDocument, pageTarget);

  return entries.length ? pickMultiTargets(rect, entries) : [];
};

let cachedSelectionFrame = -1;

let cachedSelectionKey = "";

let cachedSelectionEntries: Array<{ element: Element; rect: Rect }> = [];

let cachedOverlayNode: HTMLDivElement | null = null;

let cachedSelectionDocument: Document | null = null;

let cachedSelectionTarget: HTMLElement | ShadowRoot | null = null;

export const getSelectionEntries = (
  rect: Rect,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const overlayHost = getOverlayHost(overlayNode);
  const ownerWindow = ownerDocument.defaultView;

  if (!ownerWindow) return [];
  const frame = getFrameToken();
  const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;

  if (
    frame === cachedSelectionFrame
    && cachedSelectionKey === key
    && cachedOverlayNode === overlayNode
    && cachedSelectionDocument === ownerDocument
    && cachedSelectionTarget === pageTarget
  ) return cachedSelectionEntries;
  const minLeft = rect.left - 1;
  const minTop = rect.top - 1;
  const maxRight = rect.left + rect.width + 1;
  const maxBottom = rect.top + rect.height + 1;

  const entries = getBodyElementsCached(ownerDocument)
    .map((element) => ({ element, rect: getRectFromDomCached(element) }))
    .filter(({ element, rect: elementRect }) => {
      if (
        !isElementWithinAccessibleTarget(element, pageTarget)
        || isOverlayElement(element, overlayNode, overlayHost)
        || isInsideMesurer(element, ownerWindow)
        || element === element.ownerDocument.body
        || element === element.ownerDocument.documentElement
      ) return false;

      if (elementRect.width < MIN_MULTI_TARGET_SIZE || elementRect.height < MIN_MULTI_TARGET_SIZE) return false;

      if (
        elementRect.left > maxRight
        || elementRect.top > maxBottom
        || elementRect.left + elementRect.width < minLeft
        || elementRect.top + elementRect.height < minTop
      ) return false;

      return rectsOverlap(rect, elementRect);
    });

  cachedSelectionFrame = frame;
  cachedSelectionKey = key;
  cachedOverlayNode = overlayNode;
  cachedSelectionDocument = ownerDocument;
  cachedSelectionTarget = pageTarget;
  cachedSelectionEntries = entries;

  return entries;
};

export type SelectionEntriesCache = {
  key: string;
  entries: Array<{ element: Element; rect: Rect }>;
  overlayNode: HTMLDivElement | null;
  frame: number;
};

export const getSelectionEntriesCached = (
  rect: Rect,
  overlayNode: HTMLDivElement | null,
  cache: SelectionEntriesCache,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const frame = getFrameToken();
  const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;

  if (cache.key === key && cache.overlayNode === overlayNode && cache.frame === frame) return cache.entries;
  const entries = getSelectionEntries(rect, overlayNode, ownerDocument, pageTarget);
  cache.key = key;
  cache.overlayNode = overlayNode;
  cache.frame = frame;
  cache.entries = entries;

  return entries;
};

export const getElementsInRectCached = (
  rect: Rect,
  overlayNode: HTMLDivElement | null,
  cache: SelectionEntriesCache,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const entries = getSelectionEntriesCached(rect, overlayNode, cache, ownerDocument, pageTarget);

  return entries.length ? pickMultiTargets(rect, entries) : [];
};
