import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/";
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
const settleScroll = async () => {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();

  let targetBox = await box(target, "target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 1);

  const selected = page.locator("[data-mesurer-selected-measurement='true']");
  const selectedChrome = selected.locator(":scope > div").first();
  const selectedLabel = selected.locator(":scope > div").last();
  assert.equal(
    await selectedChrome.evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
    "selected measurement chrome must not ease between scroll-synced rectangles",
  );
  assert.equal(
    await selectedLabel.evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
    "selected measurement label must not ease behind the selected element",
  );
  assertSameBox(await box(selectedChrome, "selected before scroll"), targetBox, "selected before scroll");

  await page.evaluate(() => window.scrollBy({ top: 180, behavior: "instant" }));
  await settleScroll();
  targetBox = await box(target, "target after selection scroll");
  assertSameBox(await box(selectedChrome, "selected after scroll"), targetBox, "selected after scroll");

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-edit-ring='true']").length === 1);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  assertSameBox(await box(editRing, "edit ring before scroll"), targetBox, "edit ring before scroll");

  await page.evaluate(() => window.scrollBy({ top: 120, behavior: "instant" }));
  await settleScroll();
  targetBox = await box(target, "target after edit scroll");
  assertSameBox(await box(editRing, "edit ring after scroll"), targetBox, "edit ring after scroll");
  assertSameBox(await box(selectedChrome, "selected chrome during edit scroll"), targetBox, "selected chrome during edit scroll");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selected measurement chrome + direct-edit ring remain frame-locked to host geometry during scroll: PASS");
} finally {
  await browser.close();
}
