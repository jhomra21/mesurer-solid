export type AnnotationMarkerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AnnotationMarkerItem = {
  id: string;
  rect: AnnotationMarkerRect;
};

export type AnnotationMarkerViewport = {
  width: number;
  height: number;
};

export type AnnotationMarkerPlacement = {
  id: string;
  left: number;
  top: number;
};

type MarkerLayoutOptions = {
  markerSize?: number;
  markerGap?: number;
  targetGap?: number;
  targetClearance?: number;
  viewportPadding?: number;
  /** Transient Mesurer UI or active-selection geometry markers must not cover. */
  obstacles?: readonly AnnotationMarkerRect[];
  /** Bound local displacement so a note cannot drift into another target's visual territory. */
  maxShiftRings?: number;
  /**
   * Viewport-aware placement is useful for transient controls, but saved
   * annotations are page-owned evidence. Their offsets must remain invariant
   * under page translation so scrolling cannot relane or pin them to an edge.
   */
  viewportAware?: boolean;
};

type CandidateGroup = {
  axis: "horizontal" | "vertical";
  space: number;
  points: Array<{ left: number; top: number }>;
};

type MarkerBox = AnnotationMarkerRect;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const overlaps = (left: MarkerBox, right: MarkerBox, gap = 0) => !(
  left.left + left.width + gap <= right.left
  || right.left + right.width + gap <= left.left
  || left.top + left.height + gap <= right.top
  || right.top + right.height + gap <= left.top
);

const candidateGroups = (
  rect: AnnotationMarkerRect,
  viewport: AnnotationMarkerViewport,
  markerSize: number,
  targetGap: number,
  viewportAware: boolean,
): CandidateGroup[] => {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const groups: CandidateGroup[] = [
    {
      axis: "vertical",
      space: viewport.width - right,
      points: [
        { left: right + targetGap, top: rect.top },
        { left: right + targetGap, top: bottom - markerSize },
      ],
    },
    {
      axis: "vertical",
      space: rect.left,
      points: [
        { left: rect.left - markerSize - targetGap, top: rect.top },
        { left: rect.left - markerSize - targetGap, top: bottom - markerSize },
      ],
    },
    {
      axis: "horizontal",
      space: viewport.height - bottom,
      points: [
        { left: right - markerSize, top: bottom + targetGap },
        { left: rect.left, top: bottom + targetGap },
      ],
    },
    {
      axis: "horizontal",
      space: rect.top,
      points: [
        { left: right - markerSize, top: rect.top - markerSize - targetGap },
        { left: rect.left, top: rect.top - markerSize - targetGap },
      ],
    },
  ];
  return viewportAware
    ? groups.sort((left, right) => right.space - left.space)
    : groups;
};

/**
 * Walk all target sides at the same displacement before moving farther away.
 * This keeps ownership proximity more important than one side's raw free space.
 */
const localCandidates = (
  groups: readonly CandidateGroup[],
  step: number,
  maxShiftRings: number,
) => {
  const points: Array<{ left: number; top: number }> = [];
  for (let ring = 0; ring <= maxShiftRings; ring += 1) {
    const offset = ring * step;
    for (const group of groups) {
      for (const point of group.points) {
        if (ring === 0) {
          points.push(point);
          continue;
        }
        if (group.axis === "vertical") {
          points.push(
            { left: point.left, top: point.top + offset },
            { left: point.left, top: point.top - offset },
          );
        } else {
          points.push(
            { left: point.left + offset, top: point.top },
            { left: point.left - offset, top: point.top },
          );
        }
      }
    }
  }
  return points;
};

/**
 * Places saved annotation markers around their rendered targets without letting
 * markers overlap or visually enter another target's territory. Geometry is an
 * ephemeral renderer concern: annotation data stays target-bound and contains no
 * presentation offsets.
 *
 * Source-relative layout is the default. Translating every target by the same
 * scroll delta therefore translates every marker by exactly that delta. Opt in
 * to `viewportAware` only for transient controls that intentionally need to be
 * clamped to the currently visible viewport.
 */
export function layoutAnnotationMarkers(
  items: readonly AnnotationMarkerItem[],
  viewport: AnnotationMarkerViewport,
  options: MarkerLayoutOptions = {},
): AnnotationMarkerPlacement[] {
  const markerSize = options.markerSize ?? 24;
  const markerGap = options.markerGap ?? 4;
  const targetGap = options.targetGap ?? 6;
  const targetClearance = options.targetClearance ?? 2;
  const viewportPadding = options.viewportPadding ?? 4;
  const obstacles = options.obstacles ?? [];
  const maxShiftRings = Math.max(0, options.maxShiftRings ?? 2);
  const viewportAware = options.viewportAware ?? false;
  const step = markerSize + markerGap;
  const maxLeft = Math.max(viewportPadding, viewport.width - markerSize - viewportPadding);
  const maxTop = Math.max(viewportPadding, viewport.height - markerSize - viewportPadding);
  const occupied: MarkerBox[] = [];
  const targetRects = items.map((item) => item.rect);
  const placements: AnnotationMarkerPlacement[] = [];

  for (const item of items) {
    const seen = new Set<string>();
    const candidates: Array<{ left: number; top: number }> = [];
    const groups = candidateGroups(item.rect, viewport, markerSize, targetGap, viewportAware);
    for (const point of localCandidates(groups, step, maxShiftRings)) {
      const normalized = viewportAware
        ? {
            left: clamp(point.left, viewportPadding, maxLeft),
            top: clamp(point.top, viewportPadding, maxTop),
          }
        : point;
      const key = `${normalized.left}:${normalized.top}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(normalized);
    }

    const valid = candidates.filter((candidate) => {
      const box = { ...candidate, width: markerSize, height: markerSize };
      return targetRects.every((target) => !overlaps(box, target, targetClearance))
        && obstacles.every((obstacle) => !overlaps(box, obstacle, markerGap));
    });
    const chosen = valid.find((candidate) => {
      const box = { ...candidate, width: markerSize, height: markerSize };
      return occupied.every((current) => !overlaps(box, current, markerGap));
    }) ?? valid.find((candidate) => {
      const box = { ...candidate, width: markerSize, height: markerSize };
      return occupied.every((current) => !overlaps(box, current));
    }) ?? valid[0] ?? candidates[0] ?? { left: viewportPadding, top: viewportPadding };

    occupied.push({ ...chosen, width: markerSize, height: markerSize });
    placements.push({ id: item.id, ...chosen });
  }

  return placements;
}
