/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { getSelectionSpacingOverlays } from "../src/core/distances";
import type { InspectMeasurement } from "../src/core/types";

const measurement = (id: string, left: number, top: number): InspectMeasurement => ({
  id,
  rect: { left, top, width: 80, height: 60 },
  elementRef: document.createElement("div"),
} as InspectMeasurement);

describe("selection spacing overlay stability", () => {
  it("preserves overlay identity when a transient snapshot only clones the selection array", () => {
    const selected = [
      measurement("a", 0, 0),
      measurement("b", 104, 0),
      measurement("c", 0, 92),
      measurement("d", 104, 92),
    ];

    const first = getSelectionSpacingOverlays(selected, window);
    const hoverSnapshot = [...selected];
    const second = getSelectionSpacingOverlays(hoverSnapshot, window);

    expect(second).toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second).toHaveLength(6);
  });

  it("invalidates the stable overlay cache when actual selection geometry changes", () => {
    const selected = [
      measurement("a", 0, 0),
      measurement("b", 104, 0),
      measurement("c", 0, 92),
    ];

    const first = getSelectionSpacingOverlays(selected, window);
    selected[1].rect = { ...selected[1].rect, left: 120 };
    const second = getSelectionSpacingOverlays([...selected], window);

    expect(second).not.toBe(first);
    expect(second).toHaveLength(3);
    expect(second.find((overlay) => overlay.id.includes(":a:b"))?.horizontal?.value).toBe(40);
  });
});
