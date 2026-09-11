import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_OWNERSHIP_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, message) => {
  const value = await locator.boundingBox();
  assert(value, message);
  return value;
};

const assertSameBox = (actual, expected, message) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 2,
      `${message}: ${key} expected ${expected[key]}, got ${actual[key]}`,
    );
  }
};

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.style.minHeight = "3200px";
    document.body.style.minHeight = "3200px";
  });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(60);
  let targetBox = await box(target, "Expected Typography ownership target");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await editor.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });
  await selectedChrome.waitFor({ state: "visible" });

  targetBox = await box(target, "Expected edited page target before inspector input");
  assertSameBox(
    await box(selectedChrome, "Expected selected page chrome before inspector input"),
    targetBox,
    "Selected page identity before inspector input",
  );
  const valueBefore = await editor.inputValue();
  const lineBefore = await target.evaluate((element) => getComputedStyle(element).lineHeight);
  const desiredLine = lineBefore === "36px" ? "42px" : "36px";
  const lineInput = inspector.locator("[data-mesurer-text-style-input='line']");
  await lineInput.waitFor({ state: "visible" });
  const lineBox = await box(lineInput, "Expected live Line control in Typography card");
  await page.mouse.click(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(desiredLine);
  await page.keyboard.press("Enter");
  await settle();
  assert.equal(
    await target.evaluate((element) => getComputedStyle(element).lineHeight),
    desiredLine,
    "Physical input in Typography Line control did not change the rendered page target",
  );
  assert.notEqual(desiredLine, lineBefore, "Typography ownership probe must change rendered line-height");
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Typography control interaction closed or retargeted the page editor");
  assert.equal(await editor.inputValue(), valueBefore, "Typography control interaction retargeted the active page editor");
  assertSameBox(
    await box(selectedChrome, "Expected selected page chrome after inspector input"),
    await box(target, "Expected original page target after inspector input"),
    "Typography control interaction changed the selected page element",
  );

  const inspectorBefore = await box(inspector, "Expected Typography card before wheel scroll");
  const ringBefore = await box(ring, "Expected edit ring before wheel scroll");
  targetBox = await box(target, "Expected page target before wheel scroll");
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(880, 600);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const actualScroll = scrollAfter - scrollBefore;
  assert(Math.abs(actualScroll) > 40, `Expected a real wheel scroll, got ${actualScroll}px`);

  const targetDuring = await box(target, "Expected page target after wheel scroll");
  const inspectorDuring = await box(inspector, "Typography card disappeared while source remained visible");
  const ringDuring = await box(ring, "Edit ring disappeared while source remained visible");
  const selectedDuring = await box(selectedChrome, "Selected chrome disappeared while source remained visible");
  const targetDelta = targetDuring.y - targetBox.y;
  assert(Math.abs(targetDelta + actualScroll) <= 2, `Page target did not reflect wheel scroll: ${JSON.stringify({ targetBox, targetDuring, actualScroll })}`);
  assert(Math.abs((ringDuring.y - ringBefore.y) - targetDelta) <= 2, `Edit ring detached from source text: ${JSON.stringify({ ringBefore, ringDuring, targetDelta })}`);
  assert(Math.abs((inspectorDuring.y - inspectorBefore.y) - targetDelta) <= 2, `Typography card became viewport furniture: ${JSON.stringify({ inspectorBefore, inspectorDuring, targetDelta })}`);
  assertSameBox(selectedDuring, targetDuring, "Selected chrome detached from source text after wheel scroll");

  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(120);
  const targetAfter = await box(target, "Expected source geometry after leaving viewport");
  assert(targetAfter.y + targetAfter.height < 1, `Expected edited source to leave viewport: ${JSON.stringify(targetAfter)}`);
  const inspectorAfter = await inspector.boundingBox();
  if (inspectorAfter) {
    assert(
      inspectorAfter.y + inspectorAfter.height < 1 || inspectorAfter.y >= 620,
      `Typography card stayed behind after its source left the viewport: ${JSON.stringify({ targetAfter, inspectorAfter })}`,
    );
  }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Typography ownership E2E: physical input in a live Typography control changes the rendered source without retargeting page ownership; card follows real wheel scroll and leaves with its source: PASS");
} finally {
  await browser.close();
}
