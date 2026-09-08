import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.NATIVE_SCROLL_ANCHOR_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};
const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} chrome=${actual[key]}`,
    );
  }
};
const relativeOffset = (target, surface) => ({
  x: surface.x - target.x,
  y: surface.y - target.y,
});
const assertSameOffset = (actual, expected, stage) => {
  assert(Math.abs(actual.x - expected.x) <= 1.5, `${stage}: x offset drifted; expected=${expected.x} actual=${actual.x}`);
  assert(Math.abs(actual.y - expected.y) <= 1.5, `${stage}: y offset drifted; expected=${expected.y} actual=${actual.y}`);
};
const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const supported = await page.evaluate(() => Boolean(
    CSS.supports("anchor-name: --mesurer-native-anchor")
    && CSS.supports("position-anchor: --mesurer-native-anchor")
    && CSS.supports("left: anchor(left)")
    && CSS.supports("width: anchor-size(width)"),
  );
  assert.equal(supported, true, "Chromium contract requires CSS Anchor Positioning support");

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();

  let targetBox = await box(target, "target before select");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const selectedRoot = page.locator("[data-mesurer-selected-measurement='true']");
  await selectedRoot.waitFor({ state: "attached" });
  const selectedChrome = selectedRoot.locator(":scope > div").first();
  const selectedLabel = selectedRoot.locator(":scope > div").last();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']"));

  const selectionNative = await selectedChrome.evaluate((element) => ({
    mode: element.dataset.mesurerNativeScrollAnchor,
    positionAnchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
    transition: getComputedStyle(element).transitionDuration,
    animation: getComputedStyle(element).animationName,
  }));
  assert.equal(selectionNative.mode, "box");
  assert.notEqual(selectionNative.positionAnchor, "none");
  assert.notEqual(selectionNative.positionAnchor, "");
  assert.equal(selectionNative.transition, "0s");
  assert.equal(selectionNative.animation, "none");
  assert.equal(await selectedLabel.getAttribute("data-mesurer-native-scroll-anchor"), "label");
  const targetAnchorName = await target.evaluate((element) => getComputedStyle(element).getPropertyValue("anchor-name").trim());
  assert.match(targetAnchorName, /--mesurer-selection-/);
  assertSameBox(await box(selectedChrome, "native selected before scroll"), targetBox, "native selected before scroll");

  await page.evaluate(() => window.scrollBy({ top: 120, behavior: "instant" }));
  // Read immediately after scrollBy. The native relationship must already be
  // valid without waiting for a Mesurer microtask or animation frame.
  targetBox = await box(target, "target after native scroll");
  assertSameBox(await box(selectedChrome, "native selected after scroll"), targetBox, "native selected after scroll");

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  await editRing.waitFor({ state: "attached" });
  await inspectorShell.waitFor({ state: "attached" });
  await page.waitForFunction(() => (
    document.querySelector("[data-mesurer-text-edit-ring='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "box"
    && document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "offset"
  ));

  assertSameBox(await box(editRing, "native edit ring before scroll"), targetBox, "native edit ring before scroll");
  const beforeInspector = await box(inspectorShell, "native inspector before scroll");
  const beforeOffset = relativeOffset(targetBox, beforeInspector);
  const inspectorNative = await inspectorShell.evaluate((element) => ({
    positionAnchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
    transition: getComputedStyle(element).transitionDuration,
    animation: getComputedStyle(element).animationName,
  }));
  assert.notEqual(inspectorNative.positionAnchor, "none");
  assert.notEqual(inspectorNative.positionAnchor, "");
  assert.equal(inspectorNative.transition, "0s");
  assert.equal(inspectorNative.animation, "none");

  await page.evaluate(() => window.scrollBy({ top: 50, behavior: "instant" }));
  targetBox = await box(target, "target after native edit scroll");
  assertSameBox(await box(editRing, "native edit ring after scroll"), targetBox, "native edit ring after scroll");
  const afterInspector = await box(inspectorShell, "native inspector after scroll");
  assertSameOffset(relativeOffset(targetBox, afterInspector), beforeOffset, "native Typography inspector offset");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("CSS Anchor Positioning owns selection/edit/Typography scroll movement without waiting for JS: PASS");
} finally {
  await browser.close();
}
