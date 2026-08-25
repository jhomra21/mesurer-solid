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

/**
 * Build complete spacing evidence for the current multi-selection.
 *
 * Every unique pair of selected elements gets a direct overlay. This intentionally
 * scales as n * (n - 1) / 2: multi-selection spacing is measurement evidence, so
 * omitting non-neighbor pairs can hide relevant geometry from both people and
 * agent context. Identical geometries still produce no zero-value overlay.
 */
export const getSelectionSpacingOverlays = (
  selected: InspectMeasurement[],
  ownerWindow: Window = window,
): DistanceOverlay[] => {
  if (selected.length < 2) return [];

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
      overlays.push({
        ...overlay,
        id: stablePairId(first, second),
      });
    }
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
