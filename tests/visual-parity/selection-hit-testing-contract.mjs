import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SELECTION_HIT_TESTING_URL ?? "http://127.0.0.1:4174/selection-hit-testing.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const box = async (locator, label) => {
  const value = await locator.boundingBox();

  assert(value, `${label}: expected rendered geometry`);

  return value;
};

const assertSameBox = (actual, expected, label, tolerance = 2) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${label}: ${key} mismatch target=${expected[key]} actual=${actual[key]}`,
    );
  }
};

const selectedSurface = () => page
  .locator("[data-mesurer-selected-measurement='true']")
  .first()
  .locator(":scope > div")
  .first();

const hoverSurface = () => page
  .locator("[data-mesurer-hover-measurement='true']")
  .first();

const assertNoPublicSelection = async (label) => {
  const result = await page.evaluate(async () => {
    try {
      const context = await window.__MESURER__.context({ scope: "selection" });

      return { ok: true, targetCount: context.targets.length, message: "" };
    } catch (error) {
      return {
        ok: false,
        targetCount: -1,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  assert.equal(result.ok, false, `${label}: public selection context should be unavailable`);
  assert.match(result.message, /no current selection/i, `${label}: expected the canonical empty-selection error`);
};

const pointFor = async (locator, label) => {
  await locator.scrollIntoViewIfNeeded();
  await settle();

  const rect = await box(locator, label);

  return {
    rect,
    point: {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    },
  };
};

const selectPoint = async (point, expected, label) => {
  await page.mouse.move(8, 8);
  await page.mouse.move(point.x, point.y, { steps: 3 });

  const hover = hoverSurface();

  try {
    await hover.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    const state = await page.evaluate(() => ({
      toolMode: window.__MESURER_SELECTION_HIT_TESTING__?.subject.model?.current?.toolMode ?? null,
      hoverCount: document.querySelectorAll("[data-mesurer-hover-measurement='true']").length,
    }));

    throw new Error(`${label}: expected visible Select hover; state=${JSON.stringify(state)}`);
  }

  assertSameBox(await box(hover, `${label} hover`), expected, `${label} hover`);

  await page.mouse.click(point.x, point.y);

  const selected = selectedSurface();

  await selected.waitFor({ state: "visible", timeout: 3000 });
  assertSameBox(await box(selected, `${label} selection`), expected, `${label} selection`);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELECTION_HIT_TESTING__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());

  const selectButton = page.locator("button[data-mesurer-builtin='select']").first();

  await selectButton.waitFor({ state: "visible" });

  if ((await selectButton.getAttribute("aria-pressed")) !== "true") await selectButton.click();

  const transparentLeaf = page.locator("#transparent-leaf");

  const transparent = await pointFor(transparentLeaf, "transparent leaf");

  const agentTransparent = await page.evaluate(
    ({ x, y }) => window.__MESURER__.at(x, y),
    transparent.point,
  );

  assert.equal(
    agentTransparent?.selector,
    "#transparent-leaf",
    "agent point inspection should resolve the visible pointer-transparent leaf",
  );

  await selectPoint(transparent.point, transparent.rect, "pointer-transparent leaf");

  await selectButton.click();
  assert.equal(await selectButton.getAttribute("aria-pressed"), "false", "Select button should toggle off");

  await assertNoPublicSelection("Select off");
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    0,
    "Turning Select off should remove visible selection chrome",
  );

  await page.waitForTimeout(320);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELECTION_HIT_TESTING__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());

  const selectButtonAfterReload = page.locator("button[data-mesurer-builtin='select']").first();
  await selectButtonAfterReload.waitFor({ state: "visible" });
  assert.equal(
    await selectButtonAfterReload.getAttribute("aria-pressed"),
    "false",
    "Select-off state should survive reload",
  );

  await assertNoPublicSelection("Select off after reload");

  await selectButtonAfterReload.click();
  assert.equal(await selectButtonAfterReload.getAttribute("aria-pressed"), "true", "Select should turn back on");

  await assertNoPublicSelection("Select re-enabled");

  const transparentAfterReload = await pointFor(page.locator("#transparent-leaf"), "transparent leaf after reload");
  await selectPoint(transparentAfterReload.point, transparentAfterReload.rect, "pointer-transparent leaf after reload");

  const topTarget = page.locator("#top-target");

  const underTarget = page.locator("#under-target");

  await topTarget.scrollIntoViewIfNeeded();
  await settle();

  const topRect = await box(topTarget, "top target");

  const underRect = await box(underTarget, "under target");

  const overlapPoint = {
    x: underRect.x + underRect.width / 2,
    y: underRect.y + underRect.height / 2,
  };

  const nativeTop = await page.evaluate(
    ({ x, y }) => document.elementsFromPoint(x, y).find((element) => (
      !element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']")
    ))?.id ?? null,
    overlapPoint,
  );

  assert.equal(
    nativeTop,
    "top-target",
    "fixture must expose the large top target as the first page-owned browser hit",
  );

  await page.keyboard.down("Shift");
  await page.mouse.click(overlapPoint.x, overlapPoint.y);
  await page.keyboard.up("Shift");
  await settle();

  const physicalMultiSelection = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));
  assert.deepEqual(
    new Set(physicalMultiSelection.targets.map((target) => target.inspection.selector)),
    new Set(["#transparent-leaf", "#top-target"]),
    "Physical Shift-click should add the second rendered target to the current selection",
  );

  const transparentCurrent = await box(page.locator("#transparent-leaf"), "transparent leaf after Shift-click");
  const topCurrent = await box(topTarget, "top target after Shift-click");
  const targetOutlines = page.locator("[data-mesurer-selection-spacing-target='true']");

  assert.equal(await targetOutlines.count(), 2, "Physical Shift-click should render one visible outline per selected target");
  assert.equal(
    await page.locator("[data-mesurer-selection-group='true']").count(),
    1,
    "Physical Shift-click should render the grouped selection size surface",
  );

  const outlineBoxes = await targetOutlines.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();

    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));

  const matchesTarget = (expected) => outlineBoxes.some((actual) =>
    ["x", "y", "width", "height"].every((key) => Math.abs(actual[key] - expected[key]) <= 2)
  );

  assert(matchesTarget(transparentCurrent), "Multi-selection should visibly outline the transparent leaf");
  assert(matchesTarget(topCurrent), "Multi-selection should visibly outline the Shift-clicked top target");

  const agentTop = await page.evaluate(
    ({ x, y }) => window.__MESURER__.at(x, y),
    overlapPoint,
  );

  assert.equal(agentTop?.selector, "#top-target", "agent point inspection should preserve the native top target");

  await selectPoint(overlapPoint, topRect, "native direct target");

  const transformed = page.locator("#transform-target");

  const transformedProbe = await pointFor(transformed, "transformed target");

  await selectPoint(transformedProbe.point, transformedProbe.rect, "transformed target");

  const svgCircle = page.locator("#svg-circle-target");

  const svgProbe = await pointFor(svgCircle, "SVG circle");

  const agentSvg = await page.evaluate(
    ({ x, y }) => window.__MESURER__.at(x, y),
    svgProbe.point,
  );

  assert.equal(agentSvg?.selector, "#svg-circle-target", "agent point inspection should resolve the SVG circle");

  await selectPoint(svgProbe.point, svgProbe.rect, "SVG circle");

  const svgContext = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));

  assert.equal(svgContext.targets.length, 1, "SVG selection should produce one Context target");
  assert.equal(svgContext.targets[0]?.inspection.selector, "#svg-circle-target", "Context should preserve the SVG selector");
  assert.equal(svgContext.targets[0]?.inspection.tag, "circle", "Context should inspect the SVG element itself");

  await page.evaluate(() => window.__MESURER__.select(["#svg-rect-target"]));
  const programmaticSvgContext = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));

  assert.equal(
    programmaticSvgContext.targets[0]?.inspection.selector,
    "#svg-rect-target",
    "programmatic selection should accept SVG elements",
  );

  const canvas = page.locator("#canvas-target");

  const canvasProbe = await pointFor(canvas, "canvas target");

  await selectPoint(canvasProbe.point, canvasProbe.rect, "canvas target");

  const closedShadowHost = page.locator("#closed-shadow-host");

  const closedProbe = await pointFor(closedShadowHost, "closed shadow host");

  const agentClosed = await page.evaluate(
    ({ x, y }) => window.__MESURER__.at(x, y),
    closedProbe.point,
  );

  assert.equal(agentClosed?.selector, "#closed-shadow-host", "closed shadow inspection should stop at the host");

  await selectPoint(closedProbe.point, closedProbe.rect, "closed shadow host");

  const largeDomTarget = page.locator("[data-large-dom-target='1000']");

  const largeProbe = await pointFor(largeDomTarget, "large DOM target");

  await selectPoint(largeProbe.point, largeProbe.rect, "large DOM target");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);

  console.log("Inspect hit-testing contract: PASS", {
    transparentDescendant: true,
    selectOffClearsSelection: true,
    selectOffPersistsWithoutLatentSelection: true,
    physicalShiftClickMultiSelection: true,
    visibleMultiSelectionTargetOutlines: true,
    agentParity: true,
    nativeTargetPreserved: true,
    transformedGeometry: true,
    svgElement: true,
    svgContext: true,
    canvasSurface: true,
    closedShadowBoundary: true,
    largeDom: true,
  });
} finally {
  await browser.close();
}
