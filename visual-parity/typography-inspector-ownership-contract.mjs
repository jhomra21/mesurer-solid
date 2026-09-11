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

  // The card is Mesurer-owned interaction UI. Exercise it with a real pointer
  // while a page edit is active, then prove neither the selected page element
  // nor the editor identity changed. This catches both selecting the card and
  // clicks leaking through it to page content underneath.
  targetBox = await box(target, "Expected edited page target before inspector input");
  assertSameBox(
    await box(selectedChrome, "Expected selected page chrome before inspector input"),
    targetBox,
    "Selected page identity before inspector input",
  );
  const valueBefore = await editor.inputValue();
  const inspectorBeforeInput = await box(inspector, "Expected Typography card before inspector input");
  await page.mouse.dblclick(
    inspectorBeforeInput.x + Math.min(110, inspectorBeforeInput.width / 2),
    inspectorBeforeInput.y + Math.min(18, inspectorBeforeInput.height / 2),
  );
  await page.waitForTimeout(80);
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Typography UI input created a second page editor");
  assert.equal(await editor.inputValue(), valueBefore, "Typography UI input retargeted the active page editor");
  assertSameBox(
    await box(selectedChrome, "Expected selected page chrome after inspector input"),
    await box(target, "Expected original page target after inspector input"),
    "Typography UI input changed the selected page element",
  );

  // Geometry ownership is separate from interaction ownership. Scroll with a
  // real wheel event while the source remains visible. The card, edit ring,
  // selected chrome and source text must all move by the same rendered delta.
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

  // Continue the real wheel gesture until the edited source is outside the
  // viewport. The Typography card must leave with it rather than remaining as
  // persistent UI unrelated to anything visible on the page.
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
  console.log("Typography ownership E2E: inspector blocks page retargeting, follows its source under real wheel scroll, and leaves with the source: PASS");
} finally {
  await browser.close();
}
