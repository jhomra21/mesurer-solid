import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.MULTI_SPACING_URL;
const outputDir = process.env.MULTI_SPACING_OUT;
const deviceScaleFactor = Number.parseFloat(process.env.MULTI_SPACING_DPR ?? "3");

if (!url || !outputDir) {
  throw new Error("MULTI_SPACING_URL and MULTI_SPACING_OUT are required");
}
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
  throw new Error(`MULTI_SPACING_DPR must be positive, received ${process.env.MULTI_SPACING_DPR}`);
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor,
});
const page = await context.newPage();

const center = (box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

const clickCard = async (id) => {
  const box = await page.locator(`[data-spacing-card='${id}']`).boundingBox();
  assert(box, `Card ${id} must have a bounding box`);
  const point = center(box);
  await page.mouse.click(point.x, point.y);
};

const captureGrid = async (name) => {
  const gridRect = await page.locator(".spacing-grid").boundingBox();
  assert(gridRect, "Spacing grid must have a bounding box");
  const paddingX = 28;
  const paddingY = 60;
  const clipX = Math.max(0, gridRect.x - paddingX);
  const clipY = Math.max(0, gridRect.y - paddingY);
  await page.screenshot({
    path: path.join(outputDir, `${name}-${deviceScaleFactor}x.png`),
    clip: {
      x: clipX,
      y: clipY,
      width: Math.min(1280 - clipX, gridRect.width + paddingX * 2),
      height: Math.min(720 - clipY, gridRect.height + paddingY * 2),
    },
  });
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_MULTI_SPACING_FIXTURE__?.mesurer));

  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.select");
  });

  // First prove the UX the feature is meant to unlock: A + C only.
  // B and D must remain unselected even though they sit inside the overall grid.
  await clickCard("a");
  await page.keyboard.down("Shift");
  try {
    await clickCard("c");
  } finally {
    await page.keyboard.up("Shift");
  }

  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length === 2
    && document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]').length === 1,
  );

  const sparseEvidence = await page.evaluate(async () => {
    const instance = window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer;
    await instance.agent.stable();
    const spacingRoots = [...document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]')];
    const group = document.querySelector('[data-mesurer-selection-group="true"]');
    return {
      aToC: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='c']"),
      selectionTargetCount: document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length,
      spacingOverlayCount: spacingRoots.length,
      spacingLabels: spacingRoots.map((root) => root.textContent?.trim() ?? "").filter(Boolean),
      groupChildCount: group?.children.length ?? 0,
      dashedLines: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length,
    };
  });

  assert.equal(sparseEvidence.selectionTargetCount, 2, "A + C should be the only selected elements");
  assert.equal(sparseEvidence.spacingOverlayCount, 1, "Sparse A + C selection should render one spacing overlay");
  assert.deepEqual(sparseEvidence.spacingLabels, ["32"], "Sparse A + C spacing label");
  assert.equal(sparseEvidence.aToC?.verticalGap, 32, "A→C vertical spacing");
  assert.equal(sparseEvidence.groupChildCount, 1, "Aggregate selection should keep only its size readout, not a filled union box");
  assert.equal(sparseEvidence.dashedLines, 1, "Sparse spacing should use a dashed measurement line");

  await captureGrid("multi-selection-sparse");

  // Expand to the complete grid and verify the sparse neighbor graph.
  await page.keyboard.down("Shift");
  try {
    await clickCard("b");
    await clickCard("d");
  } finally {
    await page.keyboard.up("Shift");
  }

  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length === 4
    && document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]').length === 4,
  );

  const evidence = await page.evaluate(async () => {
    const instance = window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer;
    await instance.agent.stable();

    const distances = {
      aToB: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='b']"),
      aToC: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='c']"),
      cToD: instance.agent.distance("[data-spacing-card='c']", "[data-spacing-card='d']"),
      bToD: instance.agent.distance("[data-spacing-card='b']", "[data-spacing-card='d']"),
    };
    const feedback = await instance.agent.feedback(["[data-spacing-card]"]);
    const selectionTargets = instance.agent.inspectAll('[data-mesurer-selection-spacing-target="true"]');
    const spacingRoots = [...document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]')];
    const spacingLabels = spacingRoots
      .map((root) => root.textContent?.trim() ?? "")
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));

    return {
      distances,
      feedback,
      selectionTargets,
      spacingLabels,
      spacingOverlayCount: spacingRoots.length,
      dashedLineCount: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length,
    };
  });

  assert.equal(evidence.distances.aToB?.horizontalGap, 24, "A→B horizontal spacing");
  assert.equal(evidence.distances.aToB?.verticalGap, 0, "A→B vertical overlap");
  assert.equal(evidence.distances.cToD?.horizontalGap, 24, "C→D horizontal spacing");
  assert.equal(evidence.distances.aToC?.horizontalGap, 0, "A→C horizontal overlap");
  assert.equal(evidence.distances.aToC?.verticalGap, 32, "A→C vertical spacing");
  assert.equal(evidence.distances.bToD?.verticalGap, 32, "B→D vertical spacing");
  assert.equal(evidence.spacingOverlayCount, 4, "Only adjacent row/column spacing overlays should render");
  assert.deepEqual(evidence.spacingLabels, ["24", "24", "32", "32"], "Rendered spacing labels");
  assert.equal(evidence.selectionTargets.length, 4, "Every selected card should retain an individual outline");
  assert.equal(evidence.dashedLineCount, 4, "Every automatic spacing guide should use the dashed measurement treatment");

  const report = {
    deviceScaleFactor,
    expected: {
      horizontal: 24,
      vertical: 32,
      overlayCount: 4,
    },
    sparseEvidence,
    evidence,
  };

  await fs.writeFile(
    path.join(outputDir, "multi-selection-spacing.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  await page.screenshot({
    path: path.join(outputDir, `multi-selection-spacing-${deviceScaleFactor}x.png`),
    fullPage: false,
  });

  await captureGrid("multi-selection-spacing-detail");

  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
  const spacingSettings = page.locator('[data-mesurer-distance="true"]').filter({ hasText: "Selection spacing" });
  await spacingSettings.getByRole("radio", { name: "Dotted spacing pattern" }).click();
  const weight = spacingSettings.getByRole("slider", { name: "Weight" });
  await weight.focus();
  await weight.press("ArrowRight");
  await weight.press("ArrowRight");
  const colorInput = spacingSettings.getByLabel("Line color hex value");
  await colorInput.fill("FF00AA");
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
  await page.waitForFunction(() => {
    const line = document.querySelector('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]');
    return line?.getAttribute("data-mesurer-line-pattern") === "dotted"
      && line?.getAttribute("data-mesurer-line-width") === "3"
      && line?.getAttribute("data-mesurer-line-color")?.toLowerCase() === "#ff00aa";
  });
  const customStyleEvidence = await page.evaluate(() => {
    const line = document.querySelector('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]');
    const style = line ? getComputedStyle(line) : null;
    const stored = JSON.parse(localStorage.getItem("mesurer-settings") ?? "null");
    return {
      pattern: line?.getAttribute("data-mesurer-line-pattern"),
      width: line?.getAttribute("data-mesurer-line-width"),
      color: line?.getAttribute("data-mesurer-line-color"),
      backgroundImage: style?.backgroundImage ?? "",
      storedStyle: stored?.settings?.selectionSpacingStyle ?? null,
    };
  });
  assert.equal(customStyleEvidence.pattern, "dotted", "Selection spacing pattern should update live");
  assert.equal(customStyleEvidence.width, "3", "Selection spacing weight should update live");
  assert.equal(customStyleEvidence.color?.toLowerCase(), "#ff00aa", "Selection spacing color should update live");
  assert.match(customStyleEvidence.backgroundImage, /radial-gradient/i, "Dotted spacing should use the dotted renderer");
  assert.equal(customStyleEvidence.storedStyle?.pattern, "dotted", "Selection spacing pattern should persist");
  assert.equal(customStyleEvidence.storedStyle?.width, 3, "Selection spacing weight should persist");

  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
  await page.getByRole("button", { name: "Reset settings to defaults" }).click();
  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
  await page.waitForFunction(() => document.querySelector('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]')?.getAttribute("data-mesurer-line-pattern") === "dashed");

  console.log(JSON.stringify({
    result: "PASS",
    sparseSelection: "A + C only",
    sparseSpacing: sparseEvidence.aToC?.verticalGap,
    horizontalSpacing: evidence.distances.aToB?.horizontalGap,
    verticalSpacing: evidence.distances.aToC?.verticalGap,
    spacingLabels: evidence.spacingLabels,
    customStyleEvidence,
    outputDir,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
