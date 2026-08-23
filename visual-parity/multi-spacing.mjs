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

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_MULTI_SPACING_FIXTURE__?.mesurer));

  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.select");
  });

  await clickCard("a");
  await page.keyboard.down("Shift");
  try {
    await clickCard("b");
    await clickCard("c");
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

  const report = {
    deviceScaleFactor,
    expected: {
      horizontal: 24,
      vertical: 32,
      overlayCount: 4,
    },
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

  const gridRect = await page.locator(".spacing-grid").boundingBox();
  assert(gridRect, "Spacing grid must have a bounding box");
  const paddingX = 28;
  const paddingY = 60;
  const clipX = Math.max(0, gridRect.x - paddingX);
  const clipY = Math.max(0, gridRect.y - paddingY);
  await page.screenshot({
    path: path.join(outputDir, `multi-selection-spacing-detail-${deviceScaleFactor}x.png`),
    clip: {
      x: clipX,
      y: clipY,
      width: Math.min(1280 - clipX, gridRect.width + paddingX * 2),
      height: Math.min(720 - clipY, gridRect.height + paddingY * 2),
    },
  });

  console.log(JSON.stringify({
    result: "PASS",
    horizontalSpacing: evidence.distances.aToB?.horizontalGap,
    verticalSpacing: evidence.distances.aToC?.verticalGap,
    spacingLabels: evidence.spacingLabels,
    outputDir,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
