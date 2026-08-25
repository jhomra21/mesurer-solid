/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const focusRuleStart = styles.indexOf("/* A focused spacing pair");
const focusRuleEnd = styles.indexOf("/* Upstream X-ray", focusRuleStart);

const focusStyles = () => {
  expect(focusRuleStart).toBeGreaterThanOrEqual(0);
  expect(focusRuleEnd).toBeGreaterThan(focusRuleStart);
  return styles.slice(focusRuleStart, focusRuleEnd);
};

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("selection spacing focus styles", () => {
  it("dims normal selection chrome while leaving active pair emphasis full-strength", () => {
    const style = document.createElement("style");
    style.textContent = focusStyles();
    document.head.append(style);

    const scope = document.createElement("div");
    scope.setAttribute("data-mesurer-spacing-focus", "selection-spacing:pair:a:d");

    const selectedMeasurement = document.createElement("div");
    selectedMeasurement.setAttribute("data-mesurer-selected-measurement", "true");

    const selectionTarget = document.createElement("div");
    selectionTarget.setAttribute("data-mesurer-selection-spacing-target", "true");

    const activePairTarget = document.createElement("div");
    activePairTarget.setAttribute("data-mesurer-distance-hover-target", "true");

    scope.append(selectedMeasurement, selectionTarget, activePairTarget);
    document.body.append(scope);

    expect(getComputedStyle(selectedMeasurement).opacity).toBe("0.32");
    expect(getComputedStyle(selectionTarget).opacity).toBe("0.32");
    expect(getComputedStyle(activePairTarget).opacity).toBe("1");

    scope.removeAttribute("data-mesurer-spacing-focus");
    expect(getComputedStyle(selectedMeasurement).opacity).toBe("1");
    expect(getComputedStyle(selectionTarget).opacity).toBe("1");
  });
});
