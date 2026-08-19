import { describe, expect, it } from "vitest";
import { clamp, getRectFromPoints, normalizeRect } from "../src/core/geometry";

describe("geometry", () => {
  it("builds a rect regardless of drag direction", () => {
    expect(getRectFromPoints({ x: 30, y: 40 }, { x: 10, y: 15 })).toEqual({
      left: 10,
      top: 15,
      width: 20,
      height: 25,
    });
  });

  it("normalizes to the supplied viewport", () => {
    expect(
      normalizeRect(
        { left: 50, top: 25, width: 100, height: 50 },
        { width: 200, height: 100 },
      ),
    ).toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 });
  });

  it("clamps values", () => {
    expect(clamp(20, 0, 10)).toBe(10);
    expect(clamp(-2, 0, 10)).toBe(0);
  });
});
