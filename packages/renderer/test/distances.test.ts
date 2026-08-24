import { describe, expect, it } from "vitest";
import { getSelectionSpacingOverlays } from "../src/core/distances";
import type { InspectMeasurement, Rect } from "../src/core/types";

const selected = (id: string, rect: Rect): InspectMeasurement => ({
  id,
  rect,
  paddingRect: rect,
  marginRect: rect,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  label: id,
});

const axisValues = (items: ReturnType<typeof getSelectionSpacingOverlays>) => ({
  horizontal: items.flatMap((item) => item.horizontal ? [item.horizontal.value] : []),
  vertical: items.flatMap((item) => item.vertical ? [item.vertical.value] : []),
});

describe("multi-selection spacing", () => {
  it("shows the direct x and y gaps for exactly two selected elements", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 10, top: 20, width: 50, height: 40 }),
      selected("b", { left: 84, top: 92, width: 50, height: 40 }),
    ]);

    expect(overlays).toHaveLength(1);
    expect(overlays[0].horizontal?.value).toBe(24);
    expect(overlays[0].vertical?.value).toBe(32);
  });

  it("connects only adjacent neighbors in a horizontal row", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 0, top: 40, width: 100, height: 60 }),
      selected("b", { left: 124, top: 40, width: 100, height: 60 }),
      selected("c", { left: 260, top: 40, width: 100, height: 60 }),
    ]);
    const values = axisValues(overlays);

    expect(overlays).toHaveLength(2);
    expect(values.horizontal.sort((a, b) => a - b)).toEqual([24, 36]);
    expect(values.vertical).toEqual([]);
    expect(overlays.some((item) => item.id.includes(":a:c"))).toBe(false);
  });

  it("produces the four useful gaps for a two-by-two grid without diagonal clutter", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 40, top: 40, width: 100, height: 60 }),
      selected("b", { left: 164, top: 40, width: 100, height: 60 }),
      selected("c", { left: 40, top: 132, width: 100, height: 60 }),
      selected("d", { left: 164, top: 132, width: 100, height: 60 }),
    ]);
    const values = axisValues(overlays);

    expect(overlays).toHaveLength(4);
    expect(values.horizontal.sort((a, b) => a - b)).toEqual([24, 24]);
    expect(values.vertical.sort((a, b) => a - b)).toEqual([32, 32]);
    expect(overlays.every((item) => Boolean(item.horizontal) !== Boolean(item.vertical))).toBe(true);
  });

  it("gives an isolated diagonal selection one nearest-neighbor fallback", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 0, top: 0, width: 80, height: 50 }),
      selected("b", { left: 104, top: 0, width: 80, height: 50 }),
      selected("isolated", { left: 280, top: 180, width: 80, height: 50 }),
    ]);

    expect(overlays.some((item) => item.id.startsWith("selection-spacing:fallback:") && item.id.includes("isolated"))).toBe(true);
  });

  it("shows nearest edge offsets for nested selections", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 20, top: 20, width: 100, height: 100 }),
      selected("b", { left: 40, top: 40, width: 40, height: 40 }),
    ]);

    expect(overlays).toHaveLength(1);
    expect(overlays[0].horizontal?.value).toBe(20);
    expect(overlays[0].vertical?.value).toBe(20);
    expect(overlays[0].edgeDistances?.map((edge) => edge.value).sort((a, b) => a - b)).toEqual([20, 20, 40, 40]);
    expect(overlays[0].edgeDistances?.map((edge) => edge.side).sort()).toEqual(["bottom", "left", "right", "top"]);
  });

  it("keeps nested edge labels attached to their actual sides", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("parent", { left: 20, top: 20, width: 100, height: 100 }),
      selected("child", { left: 40, top: 50, width: 40, height: 60 }),
    ]);
    const edges = new Map(overlays[0].edgeDistances?.map((edge) => [edge.side, edge.value]));

    expect(edges).toEqual(new Map([
      ["left", 20],
      ["right", 40],
      ["top", 30],
      ["bottom", 10],
    ]));
  });

  it("does not invent spacing for identical selections", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 20, top: 20, width: 100, height: 100 }),
      selected("b", { left: 20, top: 20, width: 100, height: 100 }),
    ]);

    expect(overlays).toEqual([]);
  });
});
