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

const translated = (measurement: InspectMeasurement, dx: number, dy: number) => selected(measurement.id, {
  ...measurement.rect,
  left: measurement.rect.left + dx,
  top: measurement.rect.top + dy,
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

  it("measures every pair in a horizontal row", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 0, top: 40, width: 100, height: 60 }),
      selected("b", { left: 124, top: 40, width: 100, height: 60 }),
      selected("c", { left: 260, top: 40, width: 100, height: 60 }),
    ]);
    const values = axisValues(overlays);

    expect(overlays).toHaveLength(3);
    expect(values.horizontal.sort((a, b) => a - b)).toEqual([24, 36, 160]);
    expect(values.vertical).toEqual([]);
    expect(overlays.some((item) => item.id === "selection-spacing:pair:a:c")).toBe(true);
  });

  it("measures every unordered pair in a two-by-two grid", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 40, top: 40, width: 100, height: 60 }),
      selected("b", { left: 164, top: 40, width: 100, height: 60 }),
      selected("c", { left: 40, top: 132, width: 100, height: 60 }),
      selected("d", { left: 164, top: 132, width: 100, height: 60 }),
    ]);
    const values = axisValues(overlays);
    const lines = overlays.flatMap((item) => [item.horizontal, item.vertical].filter((line) => line !== null));
    const labelGroups = new Map<string, typeof lines>();
    for (const line of lines) {
      const key = line.labelKey ?? "";
      labelGroups.set(key, [...(labelGroups.get(key) ?? []), line]);
    }

    expect(overlays).toHaveLength(6);
    expect(values.horizontal.sort((a, b) => a - b)).toEqual([24, 24, 24, 24]);
    expect(values.vertical.sort((a, b) => a - b)).toEqual([32, 32, 32, 32]);
    expect(overlays.map((item) => item.id).sort()).toEqual([
      "selection-spacing:pair:a:b",
      "selection-spacing:pair:a:c",
      "selection-spacing:pair:a:d",
      "selection-spacing:pair:b:c",
      "selection-spacing:pair:b:d",
      "selection-spacing:pair:c:d",
    ]);
    expect(overlays.filter((item) => item.horizontal && item.vertical)).toHaveLength(2);
    expect(lines).toHaveLength(8);
    expect(labelGroups.size).toBe(4);
    expect(lines.filter((line) => line.showLabel !== false).map((line) => line.value).sort((a, b) => a - b)).toEqual([24, 24, 32, 32]);
    for (const group of labelGroups.values()) {
      expect(group.filter((line) => line.showLabel !== false)).toHaveLength(1);
      expect(group.every((line) => line.labelCount === group.length)).toBe(true);
      expect(group.map((line) => line.labelIndex).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
        Array.from({ length: group.length }, (_, index) => index),
      );
    }
  });

  it("keeps every diagonal element connected to every other selection", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 0, top: 0, width: 80, height: 50 }),
      selected("b", { left: 104, top: 0, width: 80, height: 50 }),
      selected("isolated", { left: 280, top: 180, width: 80, height: 50 }),
    ]);

    expect(overlays).toHaveLength(3);
    expect(overlays.some((item) => item.id === "selection-spacing:pair:a:isolated")).toBe(true);
    expect(overlays.some((item) => item.id === "selection-spacing:pair:b:isolated")).toBe(true);
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

  it("keeps all pair and side distances when a parent and two children are selected", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("parent", { left: 0, top: 0, width: 400, height: 300 }),
      selected("first", { left: 20, top: 30, width: 100, height: 80 }),
      selected("second", { left: 240, top: 160, width: 120, height: 90 }),
    ]);

    expect(overlays).toHaveLength(3);
    expect(overlays.map((item) => item.id).sort()).toEqual([
      "selection-spacing:pair:first:parent",
      "selection-spacing:pair:first:second",
      "selection-spacing:pair:parent:second",
    ]);

    const parentToFirst = overlays.find((item) => item.id === "selection-spacing:pair:first:parent");
    const parentToSecond = overlays.find((item) => item.id === "selection-spacing:pair:parent:second");
    const firstToSecond = overlays.find((item) => item.id === "selection-spacing:pair:first:second");

    expect(new Map(parentToFirst?.edgeDistances?.map((edge) => [edge.side, edge.value]))).toEqual(new Map([
      ["left", 20],
      ["right", 280],
      ["top", 30],
      ["bottom", 190],
    ]));
    expect(new Map(parentToSecond?.edgeDistances?.map((edge) => [edge.side, edge.value]))).toEqual(new Map([
      ["left", 240],
      ["right", 40],
      ["top", 160],
      ["bottom", 50],
    ]));
    expect(firstToSecond?.horizontal?.value).toBe(120);
    expect(firstToSecond?.vertical?.value).toBe(50);
  });

  it("keeps spacing values stable while viewport rects translate during page scroll", () => {
    const parent = selected("parent", { left: 20, top: 720, width: 100, height: 100 });
    const child = selected("child", { left: 40, top: 750, width: 40, height: 60 });
    const before = getSelectionSpacingOverlays([parent, child]);
    const after = getSelectionSpacingOverlays([
      translated(parent, 0, -600),
      translated(child, 0, -600),
    ]);

    expect(axisValues(after)).toEqual(axisValues(before));
    expect(after[0].edgeDistances?.map((edge) => edge.value)).toEqual(before[0].edgeDistances?.map((edge) => edge.value));
    expect(after[0].vertical?.y1).toBe((before[0].vertical?.y1 ?? 0) - 600);
    expect(after[0].vertical?.y2).toBe((before[0].vertical?.y2 ?? 0) - 600);
  });

  it("does not invent spacing for identical selections", () => {
    const overlays = getSelectionSpacingOverlays([
      selected("a", { left: 20, top: 20, width: 100, height: 100 }),
      selected("b", { left: 20, top: 20, width: 100, height: 100 }),
    ]);

    expect(overlays).toEqual([]);
  });
});
