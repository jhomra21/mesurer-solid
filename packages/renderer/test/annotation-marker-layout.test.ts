import { describe, expect, it } from "vitest";
import { layoutAnnotationMarkers } from "../src/components/annotation-marker-layout";

const box = (left: number, top: number, size = 24) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
});

const rectBox = (rect: { left: number; top: number; width: number; height: number }) => ({
  left: rect.left,
  top: rect.top,
  right: rect.left + rect.width,
  bottom: rect.top + rect.height,
});

const overlaps = (left: ReturnType<typeof box>, right: ReturnType<typeof box>) => !(
  left.right <= right.left
  || right.right <= left.left
  || left.bottom <= right.top
  || right.bottom <= left.top
);

const distanceToRect = (
  placement: { left: number; top: number },
  rect: { left: number; top: number; width: number; height: number },
) => {
  const x = placement.left + 12;
  const y = placement.top + 12;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  const dx = x < rect.left ? rect.left - x : x > right ? x - right : 0;
  const dy = y < rect.top ? rect.top - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
};

describe("layoutAnnotationMarkers", () => {
  it("separates adjacent annotations that prefer the same boundary", () => {
    const placements = layoutAnnotationMarkers([
      { id: "beta", rect: { left: 10, top: 76, width: 540, height: 296 } },
      { id: "gamma", rect: { left: 599, top: 76, width: 540, height: 296 } },
    ], { width: 1190, height: 416 });

    expect(placements).toHaveLength(2);
    expect(overlaps(box(placements[0]!.left, placements[0]!.top), box(placements[1]!.left, placements[1]!.top))).toBe(false);
  });

  it("does not place a note inside an adjacent target", () => {
    const beta = { left: 10, top: 76, width: 540, height: 296 };
    const gamma = { left: 550, top: 76, width: 540, height: 296 };
    const placements = layoutAnnotationMarkers([
      { id: "beta", rect: beta },
      { id: "gamma", rect: gamma },
    ], { width: 1128, height: 416 });

    const betaMarker = box(placements.find((placement) => placement.id === "beta")!.left,
      placements.find((placement) => placement.id === "beta")!.top);
    const gammaMarker = box(placements.find((placement) => placement.id === "gamma")!.left,
      placements.find((placement) => placement.id === "gamma")!.top);
    expect(overlaps(betaMarker, rectBox(gamma))).toBe(false);
    expect(overlaps(gammaMarker, rectBox(beta))).toBe(false);
  });

  it("avoids transient selection and note-trigger obstacles", () => {
    const target = { left: 80, top: 80, width: 220, height: 150 };
    const obstacle = { left: 306, top: 80, width: 24, height: 24 };
    const [placement] = layoutAnnotationMarkers([
      { id: "saved-note", rect: target },
    ], { width: 520, height: 320 }, { obstacles: [obstacle] });

    expect(placement).toBeDefined();
    expect(overlaps(box(placement!.left, placement!.top), rectBox(obstacle))).toBe(false);
  });

  it("tries another nearby side before drifting down one edge", () => {
    const target = { left: 120, top: 100, width: 180, height: 120 };
    const rightSideObstacle = { left: 306, top: 70, width: 40, height: 190 };
    const [placement] = layoutAnnotationMarkers([
      { id: "owned", rect: target },
    ], { width: 600, height: 400 }, { obstacles: [rightSideObstacle] });

    expect(placement).toBeDefined();
    const markerCenter = {
      x: placement!.left + 12,
      y: placement!.top + 12,
    };
    const targetCenter = {
      x: target.left + target.width / 2,
      y: target.top + target.height / 2,
    };
    expect(Math.hypot(markerCenter.x - targetCenter.x, markerCenter.y - targetCenter.y)).toBeLessThan(180);
    expect(overlaps(box(placement!.left, placement!.top), rectBox(rightSideObstacle))).toBe(false);
  });

  it("keeps repeated notes in a tight non-overlapping cluster beside one target", () => {
    const target = { left: 31, top: 310, width: 441, height: 71 };
    const placements = layoutAnnotationMarkers([
      { id: "note-1", rect: target },
      { id: "note-2", rect: target },
      { id: "note-3", rect: target },
    ], { width: 1062, height: 830 });

    expect(placements).toHaveLength(3);
    for (const placement of placements) {
      expect(distanceToRect(placement, target)).toBeLessThanOrEqual(64);
    }
    for (let left = 0; left < placements.length; left += 1) {
      for (let right = left + 1; right < placements.length; right += 1) {
        expect(overlaps(
          box(placements[left]!.left, placements[left]!.top),
          box(placements[right]!.left, placements[right]!.top),
        )).toBe(false);
      }
    }
  });

  it("keeps source-relative offsets invariant under page scrolling", () => {
    const beforeTarget = { left: 31, top: 310, width: 441, height: 71 };
    const afterTarget = { ...beforeTarget, top: 70 };
    const before = layoutAnnotationMarkers([
      { id: "note-1", rect: beforeTarget },
      { id: "note-2", rect: beforeTarget },
      { id: "note-3", rect: beforeTarget },
    ], { width: 1062, height: 830 });
    const after = layoutAnnotationMarkers([
      { id: "note-1", rect: afterTarget },
      { id: "note-2", rect: afterTarget },
      { id: "note-3", rect: afterTarget },
    ], { width: 1062, height: 830 });

    for (const beforePlacement of before) {
      const afterPlacement = after.find((placement) => placement.id === beforePlacement.id)!;
      expect(afterPlacement.left - afterTarget.left).toBe(beforePlacement.left - beforeTarget.left);
      expect(afterPlacement.top - afterTarget.top).toBe(beforePlacement.top - beforeTarget.top);
    }
  });

  it("keeps transient viewport-aware markers inside the viewport", () => {
    const placements = layoutAnnotationMarkers([
      { id: "top-left", rect: { left: 0, top: 0, width: 10, height: 10 } },
      { id: "bottom-right", rect: { left: 190, top: 90, width: 10, height: 10 } },
    ], { width: 200, height: 100 }, { viewportAware: true });

    for (const placement of placements) {
      expect(placement.left).toBeGreaterThanOrEqual(4);
      expect(placement.top).toBeGreaterThanOrEqual(4);
      expect(placement.left + 24).toBeLessThanOrEqual(196);
      expect(placement.top + 24).toBeLessThanOrEqual(96);
    }
  });

  it("is deterministic for the same annotation order and geometry", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `note-${index + 1}`,
      rect: { left: 80, top: 80, width: 120, height: 80 },
    }));
    const viewport = { width: 420, height: 320 };

    expect(layoutAnnotationMarkers(items, viewport)).toEqual(layoutAnnotationMarkers(items, viewport));
  });
});
