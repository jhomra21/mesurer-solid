import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/styles.css", "utf8");
const focusRuleStart = styles.indexOf("/* A spacing pill describes one orthogonal measurement line");
const focusRuleEnd = styles.indexOf("/* Upstream X-ray", focusRuleStart);

const focusStyles = () => {
  expect(focusRuleStart).toBeGreaterThanOrEqual(0);
  expect(focusRuleEnd).toBeGreaterThan(focusRuleStart);
  return styles.slice(focusRuleStart, focusRuleEnd);
};

describe("selection spacing focus styles", () => {
  it("keeps focus styling on measurement components instead of adding endpoint borders", () => {
    const focus = focusStyles();

    expect(styles).not.toContain("data-mesurer-distance-hover-target");
    expect(focus).not.toContain("border-width");
    expect(focus).toContain("opacity: 0.16 !important");
  });
});
