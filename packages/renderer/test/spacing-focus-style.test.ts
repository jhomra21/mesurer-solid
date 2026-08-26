import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");
const markerRuleStart = styles.indexOf("/* Endpoint markers are geometry/state only");
const focusRuleStart = styles.indexOf("/* A spacing pill describes one orthogonal measurement line");
const focusRuleEnd = styles.indexOf("/* Upstream X-ray", focusRuleStart);

const markerStyles = () => {
  expect(markerRuleStart).toBeGreaterThanOrEqual(0);
  expect(focusRuleStart).toBeGreaterThan(markerRuleStart);
  return styles.slice(markerRuleStart, focusRuleStart);
};

const focusStyles = () => {
  expect(focusRuleStart).toBeGreaterThanOrEqual(0);
  expect(focusRuleEnd).toBeGreaterThan(focusRuleStart);
  return styles.slice(focusRuleStart, focusRuleEnd);
};

describe("selection spacing focus styles", () => {
  it("keeps endpoint markers nonvisual and focus styling off element borders", () => {
    const marker = markerStyles();
    const focus = focusStyles();

    expect(marker).toContain("opacity: 1 !important");
    expect(marker).not.toMatch(/\bborder(?:-[a-z]+)?\s*:/);
    expect(marker).not.toMatch(/\bbackground(?:-[a-z]+)?\s*:/);
    expect(focus).not.toMatch(/\bborder(?:-[a-z]+)?\s*:/);
    expect(focus).toContain("opacity: 0.16 !important");
  });
});
