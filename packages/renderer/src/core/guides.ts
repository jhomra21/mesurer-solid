// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { GUIDE_SNAP_DISTANCE, MIN_SINGLE_TARGET_SIZE } from "./constants";
import { getBodyElementsCached, getRectFromDomCached } from "./dom";
import { getViewportSize } from "./geometry";
import type { Guide, Point, Rect } from "./types";
export const getGuideRect = (guide: Guide, ownerWindow: Window = window): Rect => { const viewport = getViewportSize(ownerWindow); return guide.orientation === "vertical" ? { left: guide.position, top: 0, width: 1, height: viewport.height } : { left: 0, top: guide.position, width: viewport.width, height: 1 }; };
export const getGuideDistance = (guide: Guide, point: Point) => guide.orientation === "vertical" ? Math.abs(guide.position - point.x) : Math.abs(guide.position - point.y);
export const getSnapGuidePosition = (params: { orientation: Guide["orientation"]; point: Point; snapGuidesEnabled: boolean; overlayNode: HTMLDivElement | null; guides: Guide[]; draggingGuideId: string | null; document?: Document }) => {
  const ownerDocument = params.document ?? document; const { orientation, point, snapGuidesEnabled, overlayNode, guides } = params;
  if (!snapGuidesEnabled) return orientation === "vertical" ? point.x : point.y;
  let bestValue = orientation === "vertical" ? point.x : point.y; let bestDistance = GUIDE_SNAP_DISTANCE + 1;
  for (const element of getBodyElementsCached(ownerDocument)) {
    if (overlayNode?.contains(element) || element === ownerDocument.body || element === ownerDocument.documentElement) continue;
    const rect = getRectFromDomCached(element); if (rect.width <= 2 || rect.height <= 2) continue;
    if (orientation === "vertical" && (point.x < rect.left - GUIDE_SNAP_DISTANCE || point.x > rect.left + rect.width + GUIDE_SNAP_DISTANCE)) continue;
    if (orientation === "horizontal" && (point.y < rect.top - GUIDE_SNAP_DISTANCE || point.y > rect.top + rect.height + GUIDE_SNAP_DISTANCE)) continue;
    const candidates = orientation === "vertical" ? [rect.left, rect.left + rect.width, rect.left + rect.width / 2] : [rect.top, rect.top + rect.height, rect.top + rect.height / 2];
    for (const candidate of candidates) { const distance = orientation === "vertical" ? Math.abs(candidate - point.x) : Math.abs(candidate - point.y); if (distance <= GUIDE_SNAP_DISTANCE && distance < bestDistance) { bestValue = candidate; bestDistance = distance; } }
  }
  for (const guide of guides) { if (guide.id === params.draggingGuideId || guide.orientation !== orientation) continue; const distance = Math.abs(guide.position - (orientation === "vertical" ? point.x : point.y)); if (distance <= GUIDE_SNAP_DISTANCE && distance < bestDistance) { bestValue = guide.position; bestDistance = distance; } }
  return bestDistance <= GUIDE_SNAP_DISTANCE ? bestValue : orientation === "vertical" ? point.x : point.y;
};
export const getNearestElementToGuide = (params: { guide: Guide; overlayNode: HTMLDivElement | null; document?: Document }) => {
  const ownerDocument = params.document ?? document; const position = params.guide.position; let bestElement: HTMLElement | null = null; let bestDistance = Infinity; let bestArea = Infinity;
  for (const element of getBodyElementsCached(ownerDocument)) { if (params.overlayNode?.contains(element) || element === ownerDocument.body || element === ownerDocument.documentElement) continue; const rect = getRectFromDomCached(element); if (rect.width < MIN_SINGLE_TARGET_SIZE || rect.height < MIN_SINGLE_TARGET_SIZE) continue; const distance = params.guide.orientation === "vertical" ? position < rect.left ? rect.left - position : position > rect.left + rect.width ? position - (rect.left + rect.width) : 0 : position < rect.top ? rect.top - position : position > rect.top + rect.height ? position - (rect.top + rect.height) : 0; const area = rect.width * rect.height; if (distance < bestDistance || (distance === bestDistance && area < bestArea)) { bestDistance = distance; bestArea = area; bestElement = element; } }
  return bestElement;
};
