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
const strictReadWarnings = [];
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "warning" && message.text().includes("STRICT_READ_UNTRACKED")) {
    strictReadWarnings.push(message.text());
  }
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

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

const openSettings = async () => {
  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
  await page.getByRole("tab", { name: "Select" }).click();
};

const closeSettings = async () => {
  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.settings");
  });
};

const visibleSpacingLabels = () => page.locator(
  '[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-label="true"]',
);

const directLabelRects = async () => page.evaluate(() => [...document.querySelectorAll(
  '[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-label="true"]:not([data-mesurer-distance-label-axis="d"])',
)].map((label) => {
  const rect = label.getBoundingClientRect();
  return {
    text: label.textContent?.trim() ?? "",
    left: Math.round(rect.left * 10) / 10,
    top: Math.round(rect.top * 10) / 10,
  };
}).sort((a, b) => a.text.localeCompare(b.text) || a.left - b.left || a.top - b.top));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_MULTI_SPACING_FIXTURE__?.mesurer));

  await page.evaluate(async () => {
    await window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.select");
  });

  // First prove sparse direct-neighbor spacing remains unchanged.
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
      lineCount: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length,
    };
  });

  assert.equal(sparseEvidence.selectionTargetCount, 2, "A + C should be the only selected elements");
  assert.equal(sparseEvidence.spacingOverlayCount, 1, "A + C selection should keep one spacing pair root");
  assert.deepEqual(sparseEvidence.spacingLabels, ["32"], "A + C direct spacing label");
  assert.equal(sparseEvidence.aToC?.verticalGap, 32, "A→C vertical spacing");
  assert.equal(sparseEvidence.groupChildCount, 1, "Aggregate selection should keep only its size readout");
  assert.equal(sparseEvidence.lineCount, 1, "A + C should render one direct vertical guide");

  await captureGrid("multi-selection-sparse");

  // Expand to the complete grid. All six pair roots/data relationships remain,
  // but only the four direct-facing orthogonal gaps render by default.
  await page.keyboard.down("Shift");
  try {
    await clickCard("b");
    await clickCard("d");
  } finally {
    await page.keyboard.up("Shift");
  }

  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length === 4
    && document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]').length === 6
    && document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length === 4,
  );

  const evidence = await page.evaluate(async () => {
    const instance = window.__MESURER_MULTI_SPACING_FIXTURE__.mesurer;
    await instance.agent.stable();
    const distances = {
      aToB: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='b']"),
      aToC: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='c']"),
      aToD: instance.agent.distance("[data-spacing-card='a']", "[data-spacing-card='d']"),
      bToC: instance.agent.distance("[data-spacing-card='b']", "[data-spacing-card='c']"),
      cToD: instance.agent.distance("[data-spacing-card='c']", "[data-spacing-card='d']"),
      bToD: instance.agent.distance("[data-spacing-card='b']", "[data-spacing-card='d']"),
    };
    const spacingLabels = [...document.querySelectorAll(
      '[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-label="true"]',
    )].map((label) => label.textContent?.trim() ?? "").filter(Boolean).sort((a, b) => Number(a) - Number(b));
    return {
      distances,
      spacingLabels,
      selectionTargetCount: document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length,
      spacingOverlayCount: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]').length,
      lineCount: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length,
      diagonalLineCount: document.querySelectorAll('[data-mesurer-distance-line="diagonal"]').length,
    };
  });

  assert.equal(evidence.distances.aToB?.horizontalGap, 24, "A→B horizontal spacing");
  assert.equal(evidence.distances.cToD?.horizontalGap, 24, "C→D horizontal spacing");
  assert.equal(evidence.distances.aToC?.verticalGap, 32, "A→C vertical spacing");
  assert.equal(evidence.distances.bToD?.verticalGap, 32, "B→D vertical spacing");
  assert.equal(evidence.distances.aToD?.horizontalGap, 24, "A→D horizontal evidence remains available");
  assert.equal(evidence.distances.aToD?.verticalGap, 32, "A→D vertical evidence remains available");
  assert.equal(evidence.distances.bToC?.horizontalGap, 24, "B→C horizontal evidence remains available");
  assert.equal(evidence.distances.bToC?.verticalGap, 32, "B→C vertical evidence remains available");
  assert.equal(evidence.spacingOverlayCount, 6, "Every unordered selected pair should retain a pair root");
  assert.equal(evidence.selectionTargetCount, 4, "Every selected card should retain an individual outline");
  assert.equal(evidence.lineCount, 4, "Default visual spacing should show only four direct orthogonal guides");
  assert.equal(evidence.diagonalLineCount, 0, "Diagonal guides must be off by default");
  assert.deepEqual(evidence.spacingLabels, ["24", "24", "32", "32"], "Default labels should describe only direct gaps");

  const initialDirectRects = await directLabelRects();
  await captureGrid("multi-selection-spacing-direct");

  // Hover one direct pill and verify opacity-only ownership isolation.
  const directLabel = visibleSpacingLabels().filter({ hasText: /^24$/ }).first();
  await directLabel.hover();
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-selection-spacing-target="true"][style*="opacity: 0.32"]').length === 2,
  );
  const directHoverEvidence = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]')];
    const activeRoot = document.querySelector('[data-mesurer-distance-kind="selection-spacing"][data-mesurer-distance-active="true"]');
    return {
      fullTargets: targets.filter((target) => Number.parseFloat(getComputedStyle(target).opacity) > 0.9).length,
      dimTargets: targets.filter((target) => Number.parseFloat(getComputedStyle(target).opacity) < 0.4).length,
      activeLines: activeRoot
        ? [...activeRoot.querySelectorAll('[data-mesurer-distance-line]')].map((line) => getComputedStyle(line).opacity)
        : [],
    };
  });
  assert.equal(directHoverEvidence.fullTargets, 2, "Direct pill hover should leave its two owning elements unchanged");
  assert.equal(directHoverEvidence.dimTargets, 2, "Direct pill hover should fade the two unrelated elements");
  assert(directHoverEvidence.activeLines.every((opacity) => opacity === "1"), "Hovered direct line should remain full opacity");
  await page.mouse.move(10, 10);
  await page.waitForTimeout(350);

  // Diagonals are an explicit opt-in setting.
  await openSettings();
  const spacingSettings = page.locator('[data-mesurer-distance="true"]').filter({ hasText: "Selection spacing" });
  const diagonalSwitch = spacingSettings.getByRole("switch", { name: "Diagonals" });
  assert.equal(await diagonalSwitch.getAttribute("aria-checked"), "false", "Diagonal spacing should default off");
  await diagonalSwitch.click();
  assert.equal(await diagonalSwitch.getAttribute("aria-checked"), "true", "Diagonal spacing switch should turn on");
  await closeSettings();

  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-distance-line="diagonal"]').length === 2
    && document.querySelectorAll('[data-mesurer-distance-label-axis="d"][data-mesurer-distance-label="true"]').length === 2,
  );

  const diagonalEvidence = await page.evaluate(() => ({
    lineCount: document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]').length,
    diagonalLines: [...document.querySelectorAll('[data-mesurer-distance-line="diagonal"]')].map((line) => ({
      pattern: line.getAttribute("data-mesurer-line-pattern"),
      width: line.getAttribute("data-mesurer-line-width"),
      color: line.getAttribute("data-mesurer-line-color"),
    })),
    labels: [...document.querySelectorAll('[data-mesurer-distance-label-axis="d"][data-mesurer-distance-label="true"]')]
      .map((label) => label.textContent?.trim() ?? "")
      .sort(),
  }));
  assert.equal(diagonalEvidence.lineCount, 6, "Enabling diagonals should add two lines without restoring hidden orthogonal projections");
  assert.deepEqual(diagonalEvidence.labels, ["40", "40"], "24×32 diagonal gaps should render as 40px Euclidean distances");
  assert(diagonalEvidence.diagonalLines.every((line) => line.pattern === "dotted"), "Diagonal guides should always use the dotted treatment");

  const diagonalLabel = page.locator('[data-mesurer-distance-label-axis="d"][data-mesurer-distance-label="true"]').first();
  await diagonalLabel.hover();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-distance-kind="selection-spacing"][data-mesurer-distance-active="true"] [data-mesurer-distance-line="diagonal"]') !== null,
  );
  const diagonalHoverEvidence = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]')];
    const activeRoot = document.querySelector('[data-mesurer-distance-kind="selection-spacing"][data-mesurer-distance-active="true"]');
    return {
      fullTargets: targets.filter((target) => Number.parseFloat(getComputedStyle(target).opacity) > 0.9).length,
      dimTargets: targets.filter((target) => Number.parseFloat(getComputedStyle(target).opacity) < 0.4).length,
      activeDiagonalOpacity: activeRoot
        ? getComputedStyle(activeRoot.querySelector('[data-mesurer-distance-line="diagonal"]')).opacity
        : null,
    };
  });
  assert.equal(diagonalHoverEvidence.fullTargets, 2, "Diagonal hover should leave only its owning pair at normal strength");
  assert.equal(diagonalHoverEvidence.dimTargets, 2, "Diagonal hover should fade unrelated selected elements");
  assert.equal(diagonalHoverEvidence.activeDiagonalOpacity, "1", "Hovered diagonal line should remain full opacity");
  await captureGrid("multi-selection-spacing-diagonal");
  await page.mouse.move(10, 10);
  await page.waitForTimeout(350);

  // Turning diagonals back off should restore the exact default label positions.
  await openSettings();
  await spacingSettings.getByRole("switch", { name: "Diagonals" }).click();
  await closeSettings();
  await page.waitForFunction(() => document.querySelectorAll('[data-mesurer-distance-line="diagonal"]').length === 0);
  const restoredDirectRects = await directLabelRects();
  assert.deepEqual(restoredDirectRects, initialDirectRects, "Toggling diagonals must not displace direct spacing labels");

  // Custom orthogonal styling remains configurable while diagonal pattern stays dotted by definition.
  await openSettings();
  await spacingSettings.getByRole("switch", { name: "Diagonals" }).click();
  await spacingSettings.getByRole("radio", { name: "Solid spacing pattern" }).click();
  const weight = spacingSettings.getByRole("slider", { name: "Weight" });
  await weight.focus();
  await weight.press("ArrowRight");
  await weight.press("ArrowRight");
  const colorInput = spacingSettings.getByLabel("Line color hex value");
  await colorInput.fill("FF00AA");
  await page.waitForTimeout(100);
  await closeSettings();

  await page.waitForFunction(() => {
    const direct = document.querySelector('[data-mesurer-distance-line="horizontal"], [data-mesurer-distance-line="vertical"]');
    const diagonal = document.querySelector('[data-mesurer-distance-line="diagonal"]');
    return direct?.getAttribute("data-mesurer-line-pattern") === "solid"
      && direct?.getAttribute("data-mesurer-line-width") === "3"
      && direct?.getAttribute("data-mesurer-line-color")?.toLowerCase() === "#ff00aa"
      && diagonal?.getAttribute("data-mesurer-line-pattern") === "dotted";
  });

  const customStyleEvidence = await page.evaluate(() => {
    const direct = document.querySelector('[data-mesurer-distance-line="horizontal"], [data-mesurer-distance-line="vertical"]');
    const diagonal = document.querySelector('[data-mesurer-distance-line="diagonal"]');
    const stored = JSON.parse(localStorage.getItem("mesurer-settings") ?? "null");
    return {
      directPattern: direct?.getAttribute("data-mesurer-line-pattern"),
      diagonalPattern: diagonal?.getAttribute("data-mesurer-line-pattern"),
      width: direct?.getAttribute("data-mesurer-line-width"),
      color: direct?.getAttribute("data-mesurer-line-color"),
      storedStyle: stored?.settings?.selectionSpacingStyle ?? null,
    };
  });
  assert.equal(customStyleEvidence.directPattern, "solid", "Direct spacing pattern should update live");
  assert.equal(customStyleEvidence.diagonalPattern, "dotted", "Diagonal pattern should remain dotted regardless of direct pattern");
  assert.equal(customStyleEvidence.width, "3", "Selection spacing weight should update live");
  assert.equal(customStyleEvidence.color?.toLowerCase(), "#ff00aa", "Selection spacing color should update live");
  assert.equal(customStyleEvidence.storedStyle?.diagonals, true, "Diagonal preference should persist");
  assert.equal(customStyleEvidence.storedStyle?.pattern, "solid", "Direct spacing pattern should persist");
  assert.equal(customStyleEvidence.storedStyle?.width, 3, "Selection spacing weight should persist");

  await openSettings();
  await page.getByRole("tab", { name: "General" }).click();
  await page.getByRole("button", { name: "Reset settings to defaults" }).click();
  await closeSettings();
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-mesurer-distance-line="diagonal"]').length === 0
    && document.querySelector('[data-mesurer-distance-kind="selection-spacing"] [data-mesurer-distance-line]')?.getAttribute("data-mesurer-line-pattern") === "dashed",
  );

  assert.equal(strictReadWarnings.length, 0, `Spacing interaction should not emit STRICT_READ_UNTRACKED warnings: ${strictReadWarnings.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Spacing interaction should not emit console/page errors: ${consoleErrors.join("\n")}`);

  const report = {
    deviceScaleFactor,
    expected: {
      horizontal: 24,
      vertical: 32,
      diagonal: 40,
      pairRootCount: 6,
      defaultLineCount: 4,
      diagonalLineCount: 2,
      defaultLabelCount: 4,
    },
    sparseEvidence,
    evidence,
    directHoverEvidence,
    diagonalEvidence,
    diagonalHoverEvidence,
    customStyleEvidence,
    strictReadWarnings,
    consoleErrors,
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

  console.log(JSON.stringify({
    result: "PASS",
    sparseSelection: "A + C only",
    horizontalSpacing: evidence.distances.aToB?.horizontalGap,
    verticalSpacing: evidence.distances.aToC?.verticalGap,
    defaultLabels: evidence.spacingLabels,
    diagonalLabels: diagonalEvidence.labels,
    directHoverEvidence,
    diagonalHoverEvidence,
    customStyleEvidence,
    strictReadWarnings,
    consoleErrors,
    outputDir,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
