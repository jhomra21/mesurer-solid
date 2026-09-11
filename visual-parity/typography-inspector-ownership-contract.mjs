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
const centerY = (rect) => rect.y + rect.height / 2;
const overlapRect = (left, right) => {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
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
  const targetBox = await box(target, "Expected Typography ownership target");
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const shell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  await inspector.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });

  assert.equal(await shell.evaluate((element) => getComputedStyle(element).position), "fixed", "Typography inspector shell must remain viewport-fixed");
  assert.equal(await shell.getAttribute("data-mesurer-native-scroll-anchor"), null, "Typography inspector shell must not join the page anchor graph");
  assert.equal(await shell.getAttribute("data-mesurer-native-scroll-owner"), null, "Typography inspector shell must not claim a native scroll owner");

  const inspectorBefore = await box(inspector, "Expected Typography inspector geometry");
  const ringBefore = await box(ring, "Expected text edit ring geometry");
  const scrollBefore = await page.evaluate(() => window.scrollY);

  // Move the page-linked edit ring into the viewport-owned inspector card. The
  // exact scroll direction is derived from current geometry so this exercises
  // both above/below placement lanes without baking in one fixture layout.
  const desiredDelta = centerY(ringBefore) - centerY(inspectorBefore);
  const actualScroll = await page.evaluate((delta) => {
    const before = window.scrollY;
    window.scrollBy({ top: delta, behavior: "instant" });
    return window.scrollY - before;
  }, desiredDelta);
  assert(Math.abs(actualScroll) > 1, `Expected a real scroll, got ${actualScroll}`);
  await page.waitForTimeout(40);

  const inspectorDuring = await box(inspector, "Inspector disappeared while scrolling");
  const ringDuring = await box(ring, "Edit ring disappeared while scrolling");
  assert(Math.abs(inspectorDuring.x - inspectorBefore.x) <= 1.5, `Inspector x moved with page: ${inspectorBefore.x} -> ${inspectorDuring.x}`);
  assert(Math.abs(inspectorDuring.y - inspectorBefore.y) <= 1.5, `Inspector y moved with page: ${inspectorBefore.y} -> ${inspectorDuring.y}`);
  assert(Math.abs((ringDuring.y - ringBefore.y) + actualScroll) <= 2, `Page-linked ring did not follow scroll: ${JSON.stringify({ ringBefore, ringDuring, actualScroll })}`);

  const overlap = overlapRect(inspectorDuring, ringDuring);
  assert(overlap.width > 4 && overlap.height > 4, `Expected ring to pass behind inspector: ${JSON.stringify({ inspectorDuring, ringDuring, actualScroll, scrollBefore })}`);
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName ?? null,
      inspector: Boolean(element?.closest("[data-mesurer-text-inspector-placement-shell='true'], [data-mesurer-text-inspector-info='true']")),
      ring: Boolean(element?.closest("[data-mesurer-text-edit-ring='true']")),
    };
  }, {
    x: overlap.x + overlap.width / 2,
    y: overlap.y + overlap.height / 2,
  });
  assert.equal(hit.inspector, true, `Typography card must occlude page chrome at overlap: ${JSON.stringify(hit)}`);
  assert.equal(hit.ring, false, `Page ring must not paint/hit above Typography card: ${JSON.stringify(hit)}`);

  // Physical input on the real inspector card must stay Mesurer UI. It must not
  // create a second page editor or retarget the active edit to content behind it.
  const valueBefore = await editor.inputValue();
  const cardPoint = {
    x: inspectorDuring.x + Math.min(24, inspectorDuring.width / 2),
    y: inspectorDuring.y + Math.min(18, inspectorDuring.height / 2),
  };
  await page.mouse.dblclick(cardPoint.x, cardPoint.y);
  await page.waitForTimeout(80);
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Double-clicking Typography UI must not create/retarget a page editor");
  assert.equal(await editor.inputValue(), valueBefore, "Typography UI input retargeted the active page text editor");

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Viewport-owned Typography inspector + hard UI occlusion + page-linked ring scrolling: PASS");
} finally {
  await browser.close();
}
