/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");
const focusRuleStart = styles.indexOf("/* Focus is opacity-only");
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
  it("dims unrelated selection chrome without thickening the active pair border", () => {
    const style = document.createElement("style");
    style.textContent = focusStyles();
    document.head.append(style);

    const scope = document.createElement("div");
    scope.setAttribute("data-mesurer-spacing-focus", "selection-spacing:pair:a:d");

    const selectedMeasurement = document.createElement("div");
    selectedMeasurement.setAttribute("data-mesurer-selected-measurement", "true");

    const selectionTarget = document.createElement("div");
    selectionTarget.setAttribute("data-mesurer-selection-spacing-target", "true");

    const activeRoot = document.createElement("div");
    activeRoot.setAttribute("data-mesurer-distance-kind", "selection-spacing");
    activeRoot.setAttribute("data-mesurer-distance-active", "true");
    const activePairTarget = document.createElement("div");
    activePairTarget.setAttribute("data-mesurer-distance-hover-target", "true");
    activePairTarget.style.borderStyle = "solid";
    activePairTarget.style.borderWidth = "2px";
    activeRoot.append(activePairTarget);

    const inactiveRoot = document.createElement("div");
    inactiveRoot.setAttribute("data-mesurer-distance-kind", "selection-spacing");
    const inactivePairTarget = document.createElement("div");
    inactivePairTarget.setAttribute("data-mesurer-distance-hover-target", "true");
    inactiveRoot.append(inactivePairTarget);

    scope.append(selectedMeasurement, selectionTarget, activeRoot, inactiveRoot);
    document.body.append(scope);

    expect(getComputedStyle(selectedMeasurement).opacity).toBe("0.32");
    expect(getComputedStyle(selectionTarget).opacity).toBe("0.32");
    expect(getComputedStyle(activePairTarget).opacity).toBe("1");
    expect(getComputedStyle(activePairTarget).borderTopWidth).toBe("1px");
    expect(getComputedStyle(inactivePairTarget).opacity).toBe("0");

    scope.removeAttribute("data-mesurer-spacing-focus");
    expect(getComputedStyle(selectedMeasurement).opacity).toBe("1");
    expect(getComputedStyle(selectionTarget).opacity).toBe("1");
  });
});
