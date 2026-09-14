import { describe, expect, it } from "vitest";
import {
  expectedDimensionsLabelBand,
  resolveMeasurementAwareInspectorPlacement,
} from "../src/runtime/text-editing-measurement-label-clearance";

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
  it("reserves the standard dimensions lane before a label DOM node is discoverable", () => {
    expect(expectedDimensionsLabelBand(host)).toEqual({
      left: 193,
      top: 167,
      right: 633,
      bottom: 187,
      width: 440,
      height: 20,
    });

    const placement = resolveMeasurementAwareInspectorPlacement(host, [], card, viewport);
    expect(placement).toEqual({
      left: 53,
      top: 189,
      placement: "below",
      maxHeight: null,
    });
  });

  it("uses the same spacing below the dimensions pill as above it", () => {
    const placement = resolveMeasurementAwareInspectorPlacement(host, [label], card, viewport);
    const elementToPillGap = label.top - host.bottom;
    const pillToTypographyGap = placement.top - label.bottom;

    expect(placement).toEqual({
      left: 53,
      top: 189,
      placement: "below",
      maxHeight: null,
    });
    expect(elementToPillGap).toBe(2);
    expect(pillToTypographyGap).toBe(elementToPillGap);
  });
});
