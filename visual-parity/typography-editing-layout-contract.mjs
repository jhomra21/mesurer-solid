import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_EDITING_URL ?? "http://127.0.0.1:4174/";
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

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} differs; host=${expected[key]} ring=${actual[key]}`,
    );
  }
};

const hostState = (locator) => locator.evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    text: element.textContent,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    fontWeight: style.fontWeight,
    scrollY: window.scrollY,
  };
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  // Use the same public interaction path a user does: activate Arrange, select
  // a real page element, then double-click the page element to enter Typography.
  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const host = page.locator(".primary-action");
  await arrange.click();
  await host.scrollIntoViewIfNeeded();
  await settle();

  const baseline = await hostState(host);
  const beforeOpenBox = await box(host, "host before Typography");
  await page.mouse.click(
    beforeOpenBox.x + beforeOpenBox.width / 2,
    beforeOpenBox.y + beforeOpenBox.height / 2,
  );
  await page.mouse.dblclick(
    beforeOpenBox.x + beforeOpenBox.width / 2,
    beforeOpenBox.y + beforeOpenBox.height / 2,
  );

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await settle();

  // Opening the editor must not move the inspected page. Compare live geometry
  // after the interaction rather than a stale pre-interaction rectangle.
  const afterOpen = await hostState(host);
  assert(
    Math.abs(afterOpen.scrollY - baseline.scrollY) <= 1,
    `opening Typography moved the page from scrollY=${baseline.scrollY} to ${afterOpen.scrollY}`,
  );
  assertSameBox(
    await box(ring, "ring after Typography opened"),
    await box(host, "live host after Typography opened"),
    "Typography ring follows the live page element",
  );

  // Exercise the rendered inspector controls and verify their visible effect on
  // the actual page element. Presence or data attributes alone are not evidence.
  const line = inspector.locator("[data-mesurer-text-style-input='line']");
  await line.fill("30px");
  await line.press("Enter");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".primary-action")).lineHeight === "30px");

  const tracking = inspector.locator("[data-mesurer-text-style-input='tracking']");
  await tracking.fill("1px");
  await tracking.press("Enter");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".primary-action")).letterSpacing === "1px");

  const bold = inspector.locator("[data-mesurer-text-style-button='bold']");
  const beforeBold = await host.evaluate((element) => getComputedStyle(element).fontWeight);
  await bold.click();
  await page.waitForFunction(
    (weight) => getComputedStyle(document.querySelector(".primary-action")).fontWeight !== weight,
    beforeBold,
  );

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Typography acceptance copy");
  await page.waitForFunction(
    () => document.querySelector(".primary-action")?.textContent?.includes("Typography acceptance copy"),
  );

  // Scroll with real wheel input while editing. The page element may move in
  // the viewport, but the visible ring must remain on that live element on the
  // settled frame instead of retaining stale coordinates.
  const beforeWheelY = await page.evaluate(() => window.scrollY);
  await page.mouse.move(16, 700);
  await page.mouse.wheel(0, 160);
  await page.waitForFunction((before) => Math.abs(window.scrollY - before) > 1, beforeWheelY);
  await settle();
  assertSameBox(
    await box(ring, "ring after wheel scroll"),
    await box(host, "live host after wheel scroll"),
    "Typography ring follows the page element after wheel scrolling",
  );

  const inspectorBox = await box(inspector, "Typography inspector after scroll");
  const viewport = page.viewportSize();
  assert(viewport, "expected fixed browser viewport");
  assert(
    inspectorBox.x >= 0
      && inspectorBox.y >= 0
      && inspectorBox.x + inspectorBox.width <= viewport.width
      && inspectorBox.y + inspectorBox.height <= viewport.height,
    `Typography inspector left the viewport after page scrolling: ${JSON.stringify(inspectorBox)}`,
  );

  // Escape is the real cancel path. It must close the editor and restore the
  // page content/styles that existed before the edit session.
  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });
  await settle();

  const restored = await hostState(host);
  assert.equal(restored.text, baseline.text, "Escape did not restore the page text");
  assert.equal(restored.lineHeight, baseline.lineHeight, "Escape did not restore line-height");
  assert.equal(restored.letterSpacing, baseline.letterSpacing, "Escape did not restore letter-spacing");
  assert.equal(restored.fontWeight, baseline.fontWeight, "Escape did not restore font-weight");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Typography end-to-end acceptance passed: real edit controls affect the page, wheel scrolling keeps the live ring attached, and Escape restores the original page state.");
} finally {
  await browser.close();
}
