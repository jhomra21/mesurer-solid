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
  viewportPadding?: number;
};

type CandidateGroup = {
  axis: "horizontal" | "vertical";
  space: number;
  points: Array<{ left: number; top: number }>;
};

type MarkerBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const overlaps = (left: MarkerBox, right: MarkerBox, gap: number) => !(
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
): CandidateGroup[] => {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return [
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
  ].sort((left, right) => right.space - left.space);
};

const shiftedPoints = (
  group: CandidateGroup,
  step: number,
  rings: number,
) => {
  const points: Array<{ left: number; top: number }> = [];
  for (const point of group.points) {
    points.push(point);
    for (let ring = 1; ring <= rings; ring += 1) {
      const offset = ring * step;
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
  return points;
};

/**
 * Places saved annotation markers around their rendered targets without letting
 * markers overlap. Geometry is an ephemeral renderer concern: annotation data
 * stays target-bound and contains no presentation offsets.
 */
export function layoutAnnotationMarkers(
  items: readonly AnnotationMarkerItem[],
  viewport: AnnotationMarkerViewport,
  options: MarkerLayoutOptions = {},
): AnnotationMarkerPlacement[] {
  const markerSize = options.markerSize ?? 24;
  const markerGap = options.markerGap ?? 4;
  const targetGap = options.targetGap ?? 6;
  const viewportPadding = options.viewportPadding ?? 4;
  const step = markerSize + markerGap;
  const rings = Math.max(8, items.length + 2);
  const maxLeft = Math.max(viewportPadding, viewport.width - markerSize - viewportPadding);
  const maxTop = Math.max(viewportPadding, viewport.height - markerSize - viewportPadding);
  const occupied: MarkerBox[] = [];
  const placements: AnnotationMarkerPlacement[] = [];

  for (const item of items) {
    const seen = new Set<string>();
    const candidates: Array<{ left: number; top: number }> = [];
    for (const group of candidateGroups(item.rect, viewport, markerSize, targetGap)) {
      for (const point of shiftedPoints(group, step, rings)) {
        const normalized = {
          left: clamp(point.left, viewportPadding, maxLeft),
          top: clamp(point.top, viewportPadding, maxTop),
        };
        const key = `${normalized.left}:${normalized.top}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(normalized);
      }
    }

    const chosen = candidates.find((candidate) => {
      const box = { ...candidate, width: markerSize, height: markerSize };
      return occupied.every((current) => !overlaps(box, current, markerGap));
    }) ?? candidates[0] ?? { left: viewportPadding, top: viewportPadding };

    occupied.push({ ...chosen, width: markerSize, height: markerSize });
    placements.push({ id: item.id, ...chosen });
  }

  return placements;
}
