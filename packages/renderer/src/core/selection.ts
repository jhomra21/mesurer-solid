// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { MIN_MULTI_TARGET_SIZE } from "./constants";
import { getBodyElementsCached, getFrameToken, getRectFromDomCached } from "./dom";
import { rectsOverlap } from "./geometry";
import { pickMultiTargets, pickPointTarget, pickSingleTarget } from "./targets";
import { getDeepestElementAtPoint, getDomTreeRoot, isElementWithinDomTarget, withPointerEventsDisabled } from "@jhomra21/mesurer-solid-dom";
import type { Point, Rect } from "./types";

const isShadowRoot = (value: Node): value is ShadowRoot => value.nodeType === 11;
const getOverlayHost = (overlayNode: HTMLDivElement | null) => {
  if (!overlayNode) return null;
  const rootNode = overlayNode.getRootNode();
  return isShadowRoot(rootNode) ? rootNode.host : null;
};
const isOverlayElement = (element: HTMLElement, overlayNode: HTMLDivElement | null, overlayHost: Element | null) =>
  Boolean(overlayNode?.contains(element) || (overlayHost && element === overlayHost));
const getSelectionTarget = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document,
  pageTarget: HTMLElement | ShadowRoot,
) => withPointerEventsDisabled(overlayNode, () => getDeepestElementAtPoint(point, pageTarget, ownerDocument));

export const getTargetElement = (
  point: Point,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
) => {
  const overlayHost = getOverlayHost(overlayNode);
  const element = getSelectionTarget(point, overlayNode, ownerDocument, pageTarget);
  const HTMLElementConstructor = ownerDocument.defaultView?.HTMLElement;
  if (!HTMLElementConstructor || !(element instanceof HTMLElementConstructor)) return null;
  const html = element;
  if (!isElementWithinDomTarget(html, pageTarget) || isOverlayElement(html, overlayNode, overlayHost)) return null;
  if (html === ownerDocument.body || html === ownerDocument.documentElement) return null;
  const rect = html.getBoundingClientRect();
  return rect.width > 2 && rect.height > 2 ? html : null;
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
  const candidates = treeEntries.some(({ element }) => element === direct)
    ? treeEntries
    : [{ element: direct, rect: getRectFromDomCached(direct) }, ...treeEntries];
  return pickPointTarget(point, candidates) ?? pickSingleTarget(probeRect, point, candidates) ?? direct;
};

export const getElementsInRect = (
  rect: Rect,
  overlayNode: HTMLDivElement | null,
  ownerDocument: Document = document,
  pageTarget: HTMLElement | ShadowRoot = ownerDocument.body,
): HTMLElement[] => {
  const entries = getSelectionEntries(rect, overlayNode, ownerDocument, pageTarget);
  return entries.length ? pickMultiTargets(rect, entries) : [];
};

let cachedSelectionFrame = -1;
let cachedSelectionKey = "";
let cachedSelectionEntries: Array<{ element: HTMLElement; rect: Rect }> = [];
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
        !isElementWithinDomTarget(element, pageTarget)
        || isOverlayElement(element, overlayNode, overlayHost)
        || element === ownerDocument.body
        || element === ownerDocument.documentElement
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
  entries: Array<{ element: HTMLElement; rect: Rect }>;
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
