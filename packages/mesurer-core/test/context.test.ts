import { describe, expect, it } from "vitest";
import {
  createMesurerAnnotationBaseline,
  selectMesurerRelevantEvidence,
} from "../src/context";

const rect = (left: number, top: number, width = 20, height = 20) => ({ left, top, width, height });

describe("context evidence semantics", () => {
  it("uses one relevance contract for scoped context and annotation baselines", () => {
    const element = {};
    const workspace = {
      guides: [
        { id: "near", orientation: "vertical" as const, position: 105 },
        { id: "far", orientation: "vertical" as const, position: 300 },
      ],
      measurements: [
        { id: "by-ref", rect: rect(500, 500), deltaX: 20, deltaY: 20, elementRef: element },
        { id: "by-rect", rect: rect(95, 95), deltaX: 20, deltaY: 20 },
        { id: "far", rect: rect(500, 500), deltaX: 20, deltaY: 20 },
      ],
      activeMeasurement: null,
      distances: [],
    };
    const region = rect(100, 100, 50, 50);

    const relevant = selectMesurerRelevantEvidence({
      workspace,
      scope: { kind: "scoped", elements: [element], regions: [region] },
      guideTolerance: 10,
    });
    expect(relevant.guides.map((guide) => guide.id)).toEqual(["near"]);
    expect(relevant.measurements.map((measurement) => measurement.id)).toEqual(["by-ref", "by-rect"]);

    const baseline = createMesurerAnnotationBaseline({
      targets: [{
        id: "target-1",
        selector: "#target",
        fingerprint: {
          tag: "div",
          id: "target",
          testId: null,
          role: null,
          ariaLabel: null,
          classes: [],
          text: null,
        },
        lastRect: region,
      }],
      elements: [element],
      workspace,
      guideTolerance: 10,
    });
    expect(baseline.guides.map((guide) => guide.id)).toEqual(["near"]);
    expect(baseline.measurements.map((measurement) => measurement.id)).toEqual(["by-ref", "by-rect"]);
  });
});
