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
  .first()
  .locator(":scope > div")
  .first();

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
  await page.mouse.move(point.x, point.y);
  const hover = hoverSurface();
  await hover.waitFor({ state: "visible", timeout: 3000 });
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
  assert.equal(agentTransparent?.selector, "#transparent-leaf", "agent point inspection should resolve the visible pointer-transparent leaf");
  await selectPoint(transparent.point, transparent.rect, "pointer-transparent leaf");

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
    ({ x, y }) => document.elementFromPoint(x, y)?.id ?? null,
    overlapPoint,
  );
  assert.equal(nativeTop, "top-target", "fixture must expose the large top target as the browser-native point target");
  const agentTop = await page.evaluate(
    ({ x, y }) => window.__MESURER__.at(x, y),
    overlapPoint,
  );
  assert.equal(agentTop?.selector, "#top-target", "agent point inspection should preserve the native top target");
  await selectPoint(overlapPoint, topRect, "native direct target");

  const transformed = page.locator("#transform-target");
  const transformedProbe = await pointFor(transformed, "transformed target");
  await selectPoint(transformedProbe.point, transformedProbe.rect, "transformed target");

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
    agentParity: true,
    nativeTargetPreserved: true,
    transformedGeometry: true,
    canvasSurface: true,
    closedShadowBoundary: true,
    largeDom: true,
  });
} finally {
  await browser.close();
}
