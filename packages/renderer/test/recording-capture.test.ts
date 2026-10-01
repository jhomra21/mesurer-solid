import { describe, expect, it } from "vitest";
import { placeRecordingRectInVideo } from "../src/core/recording-capture";

describe("recording capture geometry", () => {
  it("maps a matching-aspect viewport directly into video pixels", () => {
    expect(
      placeRecordingRectInVideo(
        { left: 100, top: 50, width: 200, height: 100 },
        2000,
        1000,
        { width: 1000, height: 500 },
      ),
    ).toEqual({
      sx: 200,
      sy: 100,
      sw: 400,
      sh: 200,
      dx: 0,
      dy: 0,
      dw: 1,
      dh: 1,
    });
  });

  it("centers a letterboxed viewport instead of stretching axis scales", () => {
    const placed = placeRecordingRectInVideo(
      { left: 0, top: 0, width: 1000, height: 500 },
      1920,
      1080,
      { width: 1000, height: 500 },
    );

    expect(placed.sx).toBe(0);
    expect(placed.sw).toBe(1920);
    expect(placed.sy).toBe(60);
    expect(placed.sh).toBe(960);
  });

  it("preserves destination fractions when part of a fixed selection is outside the captured viewport", () => {
    const placed = placeRecordingRectInVideo(
      { left: -100, top: 0, width: 400, height: 200 },
      1000,
      500,
      { width: 1000, height: 500 },
    );

    expect(placed.sx).toBe(0);
    expect(placed.sw).toBe(300);
    expect(placed.dx).toBeCloseTo(0.25);
    expect(placed.dw).toBeCloseTo(0.75);
  });
});
