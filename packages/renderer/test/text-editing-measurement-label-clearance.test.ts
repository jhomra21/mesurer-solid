import { describe, expect, it } from "vitest";
import { resolveMeasurementAwareInspectorPlacement } from "../src/runtime/text-editing-measurement-label-clearance";

const host = {
  left: 193,
  top: 115,
  right: 633,
  bottom: 165,
  width: 440,
  height: 50,
};
const label = {
  left: 361,
  top: 167,
  right: 465,
  bottom: 187,
  width: 104,
  height: 20,
};
const card = { width: 720, height: 655 };
const viewport = { width: 828, height: 900 };

describe("Typography dimensions-pill clearance", () => {
  it("preserves the canonical below lane when no measurement label occupies it", () => {
    const placement = resolveMeasurementAwareInspectorPlacement(host, [], card, viewport);

    expect(placement).toEqual({
      left: 53,
      top: 173,
      placement: "below",
      maxHeight: null,
    });
  });

  it("moves the below lane past a visible dimensions pill", () => {
    const placement = resolveMeasurementAwareInspectorPlacement(host, [label], card, viewport);

    expect(placement).toEqual({
      left: 53,
      top: 195,
      placement: "below",
      maxHeight: null,
    });
    expect(placement.top).toBeGreaterThan(label.bottom);
  });
});
