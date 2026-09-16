import { describe, expect, it } from "vitest";
import { layoutAnnotationMarkers } from "../src/components/annotation-marker-layout";

const box = (left: number, top: number, size = 24) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
});

const overlaps = (left: ReturnType<typeof box>, right: ReturnType<typeof box>) => !(
  left.right <= right.left
  || right.right <= left.left
  || left.bottom <= right.top
  || right.bottom <= left.top
);

describe("layoutAnnotationMarkers", () => {
  it("separates adjacent annotations that prefer the same boundary", () => {
    const placements = layoutAnnotationMarkers([
      { id: "beta", rect: { left: 10, top: 76, width: 540, height: 296 } },
      { id: "gamma", rect: { left: 599, top: 76, width: 540, height: 296 } },
    ], { width: 1190, height: 416 });

    expect(placements).toHaveLength(2);
    expect(overlaps(box(placements[0]!.left, placements[0]!.top), box(placements[1]!.left, placements[1]!.top))).toBe(false);
  });

  it("keeps every marker inside the viewport", () => {
    const placements = layoutAnnotationMarkers([
      { id: "top-left", rect: { left: 0, top: 0, width: 10, height: 10 } },
      { id: "bottom-right", rect: { left: 190, top: 90, width: 10, height: 10 } },
    ], { width: 200, height: 100 });

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
