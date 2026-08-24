import { afterEach, describe, expect, it } from "vitest";
import { getSelectedMeasurementHit } from "../src/core/selection-helpers";
import type { InspectMeasurement } from "../src/core/types";

const originalElementsFromPoint = document.elementsFromPoint;

const measurementFor = (element: HTMLElement): InspectMeasurement => ({
  id: "selected",
  rect: { left: 0, top: 0, width: 200, height: 120 },
  paddingRect: { left: 0, top: 0, width: 200, height: 120 },
  marginRect: { left: 0, top: 0, width: 200, height: 120 },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  label: "selected",
  elementRef: element,
});

afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: originalElementsFromPoint });
});

describe("selected measurement hit testing", () => {
  it("does not toggle a selected ancestor when Shift-clicking an unselected descendant", () => {
    const parent = document.createElement("button");
    const child = document.createElement("span");
    parent.append(child);
    document.body.append(parent);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [child, parent] });

    expect(getSelectedMeasurementHit({
      point: { x: 20, y: 20 },
      selectedMeasurements: [measurementFor(parent)],
      overlayNode: null,
      exact: true,
    })).toBeNull();
  });

  it("still toggles a selected element when its own box is hit", () => {
    const parent = document.createElement("button");
    document.body.append(parent);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [parent] });

    expect(getSelectedMeasurementHit({
      point: { x: 20, y: 20 },
      selectedMeasurements: [measurementFor(parent)],
      overlayNode: null,
      exact: true,
    })?.elementRef).toBe(parent);
  });
});
