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
  let edgeDistances: NonNullable<DistanceOverlay["edgeDistances"]> = [];
  const connectors: DistanceOverlay["connectors"] = [];
  const separatedX = rightA <= rectB.left || rightB <= rectA.left;
  const separatedY = bottomA <= rectB.top || bottomB <= rectA.top;

  const overlappingEdgeLines = (
    first: number,
    firstEnd: number,
    second: number,
    secondEnd: number,
    overlapStartA: number,
    overlapEndA: number,
    overlapStartB: number,
    overlapEndB: number,
  ) => {
    const candidates = [
      { side: "start" as const, x1: first, x2: second },
      { side: "end" as const, x1: firstEnd, x2: secondEnd },
    ]
      .map((candidate) => ({ ...candidate, value: Math.abs(candidate.x2 - candidate.x1) }))
      .filter((candidate) => candidate.value > 0.5)
      .sort((a, b) => a.value - b.value);
    const overlapStart = Math.max(overlapStartA, overlapStartB);
    const overlapEnd = Math.min(overlapEndA, overlapEndB);
    return candidates.map((candidate) => ({
      x1: candidate.x1,
      x2: candidate.x2,
      side: candidate.side,
      value: candidate.value,
      midpoint: (overlapStart + overlapEnd) / 2,
    }));
  };

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

  if (!separatedX && !separatedY) {
    const edges = overlappingEdgeLines(
      rectA.left,
      rightA,
      rectB.left,
      rightB,
      rectA.top,
      bottomA,
      rectB.top,
      bottomB,
    );
    const edge = edges[0];
    if (edge) horizontal = { x1: edge.x1, x2: edge.x2, y: edge.midpoint, value: edge.value };
    edgeDistances.push(...edges.map((line) => ({
      axis: "x" as const,
      side: line.side === "start" ? "left" as const : "right" as const,
      x1: line.x1,
      x2: line.x2,
      y: line.midpoint,
      value: line.value,
    })));
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

  if (!separatedX && !separatedY) {
    const edges = overlappingEdgeLines(
      rectA.top,
      bottomA,
      rectB.top,
      bottomB,
      rectA.left,
      rightA,
      rectB.left,
      rightB,
    );
    const edge = edges[0];
    if (edge) vertical = { y1: edge.x1, y2: edge.x2, x: edge.midpoint, value: edge.value };
    edgeDistances.push(...edges.map((line) => ({
      axis: "y" as const,
      side: line.side === "start" ? "top" as const : "bottom" as const,
      y1: line.x1,
      y2: line.x2,
      x: line.midpoint,
      value: line.value,
    })));
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
    edgeDistances: edgeDistances.length ? edgeDistances : undefined,
    connectors: normalizedConnectors,
  };
};

const stablePairId = (a: InspectMeasurement, b: InspectMeasurement) => {
  const [first, second] = [a.id, b.id].sort();
  return `selection-spacing:pair:${first}:${second}`;
};

type DistanceLine = NonNullable<DistanceOverlay["horizontal"]>
  | NonNullable<DistanceOverlay["vertical"]>
  | NonNullable<DistanceOverlay["diagonal"]>
  | NonNullable<DistanceOverlay["edgeDistances"]>[number];

const labelKey = (line: DistanceLine) => {
  if ("axis" in line && line.axis === "d") {
    const forward = `${line.x1}:${line.y1}:${line.x2}:${line.y2}`;
    const reverse = `${line.x2}:${line.y2}:${line.x1}:${line.y1}`;
    return `d:${forward < reverse ? forward : reverse}:${line.value}`;
  }
  return "x1" in line
    ? `x:${Math.min(line.x1, line.x2)}:${Math.max(line.x1, line.x2)}:${line.y}:${line.value}`
    : `y:${Math.min(line.y1, line.y2)}:${Math.max(line.y1, line.y2)}:${line.x}:${line.value}`;
};

const groupSelectionSpacingLabels = (overlays: DistanceOverlay[]) => {
  const groups = new Map<string, DistanceLine[]>();
  for (const overlay of overlays) {
    const lines: DistanceLine[] = overlay.edgeDistances?.length
      ? overlay.edgeDistances.filter((line) => line.showLine !== false)
      : [
          ...(overlay.horizontal?.showLine !== false && overlay.horizontal ? [overlay.horizontal] : []),
          ...(overlay.vertical?.showLine !== false && overlay.vertical ? [overlay.vertical] : []),
          ...(overlay.diagonal?.showLine !== false && overlay.diagonal ? [overlay.diagonal] : []),
        ];
    for (const line of lines) {
      const key = labelKey(line);
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }
  }

  for (const [key, lines] of groups) {
    lines.forEach((line, index) => {
      line.labelKey = key;
      line.labelIndex = index;
      line.labelCount = lines.length;
      line.showLabel = index === 0;
    });
  }
};

const right = (rect: Rect) => rect.left + rect.width;
const bottom = (rect: Rect) => rect.top + rect.height;
const separatedX = (a: Rect, b: Rect) => right(a) <= b.left || right(b) <= a.left;
const separatedY = (a: Rect, b: Rect) => bottom(a) <= b.top || bottom(b) <= a.top;
const overlaps = (startA: number, endA: number, startB: number, endB: number) =>
  Math.min(endA, endB) - Math.max(startA, startB) > 0.5;

const directHorizontalGap = (
  first: InspectMeasurement,
  second: InspectMeasurement,
  selected: InspectMeasurement[],
) => {
  const a = first.rect;
  const b = second.rect;
  if (!separatedX(a, b) || separatedY(a, b)) return false;
  const aLeft = right(a) <= b.left;
  const gapStart = aLeft ? right(a) : right(b);
  const gapEnd = aLeft ? b.left : a.left;
  const corridorTop = Math.max(a.top, b.top);
  const corridorBottom = Math.min(bottom(a), bottom(b));
  return !selected.some((other) => {
    if (other === first || other === second) return false;
    const rect = other.rect;
    return rect.left >= gapStart - 0.5
      && right(rect) <= gapEnd + 0.5
      && overlaps(rect.top, bottom(rect), corridorTop, corridorBottom);
  });
};

const directVerticalGap = (
  first: InspectMeasurement,
  second: InspectMeasurement,
  selected: InspectMeasurement[],
) => {
  const a = first.rect;
  const b = second.rect;
  if (!separatedY(a, b) || separatedX(a, b)) return false;
  const aTop = bottom(a) <= b.top;
  const gapStart = aTop ? bottom(a) : bottom(b);
  const gapEnd = aTop ? b.top : a.top;
  const corridorLeft = Math.max(a.left, b.left);
  const corridorRight = Math.min(right(a), right(b));
  return !selected.some((other) => {
    if (other === first || other === second) return false;
    const rect = other.rect;
    return rect.top >= gapStart - 0.5
      && bottom(rect) <= gapEnd + 0.5
      && overlaps(rect.left, right(rect), corridorLeft, corridorRight);
  });
};

const diagonalGap = (a: Rect, b: Rect): NonNullable<DistanceOverlay["diagonal"]> | null => {
  if (!separatedX(a, b) || !separatedY(a, b)) return null;
  const aLeft = right(a) <= b.left;
  const aTop = bottom(a) <= b.top;
  const x1 = aLeft ? right(a) : a.left;
  const x2 = aLeft ? b.left : right(b);
  const y1 = aTop ? bottom(a) : a.top;
  const y2 = aTop ? b.top : bottom(b);
  return {
    axis: "d",
    x1,
    y1,
    x2,
    y2,
    value: Math.hypot(x2 - x1, y2 - y1),
  };
};

const applySelectionSpacingPresentation = (
  overlay: DistanceOverlay,
  first: InspectMeasurement,
  second: InspectMeasurement,
  selected: InspectMeasurement[],
) => {
  const diagonal = diagonalGap(first.rect, second.rect);
  if (diagonal) {
    if (overlay.horizontal) overlay.horizontal.showLine = false;
    if (overlay.vertical) overlay.vertical.showLine = false;
    overlay.diagonal = diagonal;
    overlay.showConnectors = false;
    return;
  }

  if (overlay.horizontal && separatedX(first.rect, second.rect)) {
    overlay.horizontal.showLine = directHorizontalGap(first, second, selected);
    if (!overlay.horizontal.showLine) overlay.showConnectors = false;
  }
  if (overlay.vertical && separatedY(first.rect, second.rect)) {
    overlay.vertical.showLine = directVerticalGap(first, second, selected);
    if (!overlay.vertical.showLine) overlay.showConnectors = false;
  }
};

type SelectionSpacingCacheEntry = {
  selected: InspectMeasurement[];
  geometrySignature: string;
  ownerWindow: Window;
  viewportWidth: number;
  viewportHeight: number;
  overlays: DistanceOverlay[];
};

const selectionSpacingCache = new WeakMap<InspectMeasurement, SelectionSpacingCacheEntry>();

const selectionSpacingGeometrySignature = (selected: InspectMeasurement[]) => selected
  .map((measurement) => {
    const rect = measurement.rect;
    return `${measurement.id}:${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
  })
  .join("|");

const cachedSelectionSpacingOverlays = (
  selected: InspectMeasurement[],
  geometrySignature: string,
  ownerWindow: Window,
) => {
  const anchor = selected[0];
  if (!anchor) return null;
  const cached = selectionSpacingCache.get(anchor);
  if (!cached) return null;
  if (cached.ownerWindow !== ownerWindow) return null;
  if (cached.viewportWidth !== ownerWindow.innerWidth || cached.viewportHeight !== ownerWindow.innerHeight) return null;
  if (cached.geometrySignature !== geometrySignature || cached.selected.length !== selected.length) return null;
  if (cached.selected.some((measurement, index) => measurement !== selected[index])) return null;
  return cached.overlays;
};

/**
 * Build complete spacing evidence for the current multi-selection.
 *
 * Every unique pair of selected elements keeps its pairwise geometry. Presentation
 * hints keep the default overlay focused on direct unobstructed horizontal/vertical
 * neighbors, while genuinely diagonal pairs retain one true Euclidean segment for
 * the optional diagonal view. Hidden visual projections remain in the overlay data.
 *
 * Core snapshots shallow-clone the selectedMeasurements array for transient state
 * updates such as hover. Preserve the exact overlay array while the selected item
 * identities and geometry are unchanged so keyed renderer children are not
 * remounted and their interactive/collision layout stays stable.
 */
export const getSelectionSpacingOverlays = (
  selected: InspectMeasurement[],
  ownerWindow: Window = window,
): DistanceOverlay[] => {
  if (selected.length < 2) return [];

  const geometrySignature = selectionSpacingGeometrySignature(selected);
  const cached = cachedSelectionSpacingOverlays(selected, geometrySignature, ownerWindow);
  if (cached) return cached;

  const overlays: DistanceOverlay[] = [];
  for (let firstIndex = 0; firstIndex < selected.length - 1; firstIndex += 1) {
    const first = selected[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < selected.length; secondIndex += 1) {
      const second = selected[secondIndex];
      const overlay = getDistanceOverlay(
        first.rect,
        second.rect,
        first.elementRef,
        second.elementRef,
        ownerWindow,
      );
      if (!overlay.horizontal && !overlay.vertical) continue;
      overlay.id = stablePairId(first, second);
      applySelectionSpacingPresentation(overlay, first, second, selected);
      overlays.push(overlay);
    }
  }

  groupSelectionSpacingLabels(overlays);
  const anchor = selected[0];
  if (anchor) {
    selectionSpacingCache.set(anchor, {
      selected: [...selected],
      geometrySignature,
      ownerWindow,
      viewportWidth: ownerWindow.innerWidth,
      viewportHeight: ownerWindow.innerHeight,
      overlays,
    });
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
