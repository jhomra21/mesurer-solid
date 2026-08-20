import { describe, expect, it } from "vitest";
import { pickMultiTargets, pickPointTarget, pickSingleTarget } from "../src/core/targets";

describe("selection target scoring", () => {
  it("prefers the smallest useful point target over a large ancestor", () => {
    const large = document.createElement("div");
    const small = document.createElement("button");
    const items = [
      { element: large, rect: { left: 0, top: 0, width: 500, height: 500 } },
      { element: small, rect: { left: 10, top: 10, width: 40, height: 30 } },
    ];
    expect(pickPointTarget({ x: 20, y: 20 }, items)).toBe(small);
    expect(pickSingleTarget({ left: 8, top: 8, width: 45, height: 35 }, { x: 20, y: 20 }, items)).toBe(small);
  });

  it("prunes ancestor-like boxes from multi selections", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    const selected = pickMultiTargets(
      { left: 0, top: 0, width: 100, height: 100 },
      [
        { element: parent, rect: { left: 0, top: 0, width: 200, height: 200 } },
        { element: child, rect: { left: 10, top: 10, width: 40, height: 40 } },
      ],
    );
    expect(selected).toContain(child);
  });
});
