// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
import { clamp, denormalizeRect, getViewportSize, normalizeRect } from "./geometry";
import type { DistanceOverlay, InspectMeasurement, Rect } from "./types";
import { createId } from "./utils";

export const getDistanceOverlay = (
  rectA: Rect,
  rectB: Rect,
  elementRefA?: HTMLElement | null,
  elementRefB?: HTMLElement | null,
  ownerWindow: Window = window,
): DistanceOverlay => {
  const viewport = getViewportSize(ownerWindow);
  const normalizedRectA = normalizeRect(rectA, viewport);
  const normalizedRectB = normalizeRect(rectB, viewport);
  const rightA = rectA.left + rectA.width;
  const bottomA = rectA.top + rectA.height;
  const rightB = rectB.left + rectB.width;
  const bottomB = rectB.top + rectB.height;
  const centerAX = rectA.left + rectA.width / 2;
  const centerAY = rectA.top + rectA.height / 2;
  let horizontal: DistanceOverlay["horizontal"] = null;
  let vertical: DistanceOverlay["vertical"] = null;
  const connectors: DistanceOverlay["connectors"] = [];
  const separatedX = rightA <= rectB.left || rightB <= rectA.left;
  const separatedY = bottomA <= rectB.top || bottomB <= rectA.top;

  if (separatedX) {
    const aIsLeft = rightA <= rectB.left;
    const x1 = aIsLeft ? rightA : rightB;
    const x2 = aIsLeft ? rectB.left : rectA.left;
    const y = centerAY;
    horizontal = { x1, x2, y, value: Math.abs(x2 - x1) };
    const edgeBX = aIsLeft ? rectB.left : rightB;
    if (y < rectB.top) connectors.push({ x1: edgeBX, y1: y, x2: edgeBX, y2: rectB.top });
    else if (y > bottomB) connectors.push({ x1: edgeBX, y1: y, x2: edgeBX, y2: bottomB });
  }

  if (separatedY) {
    const aIsTop = bottomA <= rectB.top;
    const y1 = aIsTop ? bottomA : bottomB;
    const y2 = aIsTop ? rectB.top : rectA.top;
    const x = centerAX;
    vertical = { y1, y2, x, value: Math.abs(y2 - y1) };
    const edgeBY = aIsTop ? rectB.top : bottomB;
    if (x < rectB.left) connectors.push({ x1: x, y1: edgeBY, x2: rectB.left, y2: edgeBY });
    else if (x > rightB) connectors.push({ x1: x, y1: edgeBY, x2: rightB, y2: edgeBY });
  }

  const normalizedConnectors = connectors
    .map((segment) => ({
      x1: clamp(segment.x1, 0, ownerWindow.innerWidth),
      y1: clamp(segment.y1, 0, ownerWindow.innerHeight),
      x2: clamp(segment.x2, 0, ownerWindow.innerWidth),
      y2: clamp(segment.y2, 0, ownerWindow.innerHeight),
    }))
    .filter((segment) => Math.abs(segment.x1 - segment.x2) > 0.5 || Math.abs(segment.y1 - segment.y2) > 0.5);

  return {
    id: createId(),
    rectA,
    rectB,
    normalizedRectA,
    normalizedRectB,
    elementRefA,
    elementRefB,
    horizontal,
    vertical,
    connectors: normalizedConnectors,
  };
};

const intervalOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  Math.min(endA, endB) - Math.max(startA, startB);

const rectCenterDistanceSquared = (a: Rect, b: Rect) => {
  const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
  const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
  return dx * dx + dy * dy;
};

const stablePairId = (a: InspectMeasurement, b: InspectMeasurement, kind: string) => {
  const [first, second] = [a.id, b.id].sort();
  return `selection-spacing:${kind}:${first}:${second}`;
};

/**
 * Build a sparse spacing graph for the current multi-selection.
 *
 * Two selected elements get their direct x/y distance. Larger selections connect
 * each element to its nearest neighbor on the right and below when their
 * perpendicular projections overlap. That produces the gaps designers usually
 * care about in rows, columns, and grids without rendering every possible pair.
 * Isolated diagonal elements get one nearest-neighbor fallback so they are not
 * silently omitted.
 */
export const getSelectionSpacingOverlays = (
  selected: InspectMeasurement[],
  ownerWindow: Window = window,
): DistanceOverlay[] => {
  if (selected.length < 2) return [];

  const makeOverlay = (a: InspectMeasurement, b: InspectMeasurement, kind: string) => {
    const overlay = getDistanceOverlay(a.rect, b.rect, a.elementRef, b.elementRef, ownerWindow);
    return {
      ...overlay,
      id: stablePairId(a, b, kind),
    };
  };

  if (selected.length === 2) {
    const overlay = makeOverlay(selected[0], selected[1], "pair");
    return overlay.horizontal || overlay.vertical ? [overlay] : [];
  }

  const overlays: DistanceOverlay[] = [];
  const seen = new Set<string>();
  const connected = new Set<string>();

  const addPair = (a: InspectMeasurement, b: InspectMeasurement, kind: "x" | "y" | "fallback") => {
    const key = stablePairId(a, b, kind);
    if (seen.has(key)) return;
    const overlay = makeOverlay(a, b, kind);
    if (!overlay.horizontal && !overlay.vertical) return;
    seen.add(key);
    connected.add(a.id);
    connected.add(b.id);
    overlays.push(overlay);
  };

  for (const item of selected) {
    const right = selected
      .filter((candidate) => candidate !== item)
      .filter((candidate) => item.rect.left + item.rect.width <= candidate.rect.left)
      .filter((candidate) => intervalOverlap(
        item.rect.top,
        item.rect.top + item.rect.height,
        candidate.rect.top,
        candidate.rect.top + candidate.rect.height,
      ) > 0)
      .sort((a, b) => {
        const gapA = a.rect.left - (item.rect.left + item.rect.width);
        const gapB = b.rect.left - (item.rect.left + item.rect.width);
        if (gapA !== gapB) return gapA - gapB;
        const centerA = Math.abs((a.rect.top + a.rect.height / 2) - (item.rect.top + item.rect.height / 2));
        const centerB = Math.abs((b.rect.top + b.rect.height / 2) - (item.rect.top + item.rect.height / 2));
        return centerA - centerB;
      })[0];
    if (right) addPair(item, right, "x");

    const below = selected
      .filter((candidate) => candidate !== item)
      .filter((candidate) => item.rect.top + item.rect.height <= candidate.rect.top)
      .filter((candidate) => intervalOverlap(
        item.rect.left,
        item.rect.left + item.rect.width,
        candidate.rect.left,
        candidate.rect.left + candidate.rect.width,
      ) > 0)
      .sort((a, b) => {
        const gapA = a.rect.top - (item.rect.top + item.rect.height);
        const gapB = b.rect.top - (item.rect.top + item.rect.height);
        if (gapA !== gapB) return gapA - gapB;
        const centerA = Math.abs((a.rect.left + a.rect.width / 2) - (item.rect.left + item.rect.width / 2));
        const centerB = Math.abs((b.rect.left + b.rect.width / 2) - (item.rect.left + item.rect.width / 2));
        return centerA - centerB;
      })[0];
    if (below) addPair(item, below, "y");
  }

  for (const item of selected) {
    if (connected.has(item.id)) continue;
    const nearest = selected
      .filter((candidate) => candidate !== item)
      .sort((a, b) => rectCenterDistanceSquared(item.rect, a.rect) - rectCenterDistanceSquared(item.rect, b.rect))[0];
    if (nearest) addPair(item, nearest, "fallback");
  }

  return overlays;
};

export const updateDistanceForResize = (
  distance: DistanceOverlay,
  viewport = getViewportSize(),
  ownerDocument: Document = document,
  ownerWindow: Window = window,
): DistanceOverlay => {
  const normalizedRectA = distance.normalizedRectA ?? normalizeRect(distance.rectA, viewport);
  const normalizedRectB = distance.normalizedRectB ?? normalizeRect(distance.rectB, viewport);
  const rectA = distance.elementRefA?.isConnected
    ? distance.elementRefA.getBoundingClientRect()
    : denormalizeRect(normalizedRectA, viewport);
  const rectB = distance.elementRefB?.isConnected
    ? distance.elementRefB.getBoundingClientRect()
    : denormalizeRect(normalizedRectB, viewport);
  return {
    ...getDistanceOverlay(rectA, rectB, distance.elementRefA, distance.elementRefB, ownerWindow),
    id: distance.id,
  };
};
