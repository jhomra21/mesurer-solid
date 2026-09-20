import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_SELECT_SCROLL_URL ?? "http://127.0.0.1:4174/";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 900, height: 300 } });

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

const offset = (trigger, popup) => ({
  x: popup.x - trigger.x,
  y: popup.y - trigger.y,
});

const assertSameOffset = (before, after, stage) => {
  assert(Math.abs(after.x - before.x) <= 1.5, `${stage}: x offset moved from ${before.x} to ${after.x}`);
  assert(Math.abs(after.y - before.y) <= 1.5, `${stage}: y offset moved from ${before.y} to ${after.y}`);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const host = page.locator(".primary-action");
  await arrange.click();
  await host.scrollIntoViewIfNeeded();
  await settle();

  const hostBox = await box(host, "Typography host");
  await page.mouse.click(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2);
  await page.mouse.dblclick(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height / 2);

  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await inspector.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-mesurer-text-inspector-info='true']")?.getAttribute("data-mesurer-text-inspector-unified") === "true");
  await settle();

  const scrollState = await inspector.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));

  const maximumScrollTop = scrollState.scrollHeight - scrollState.clientHeight;
  assert(
    maximumScrollTop > 24,
    `fixture must exercise a genuinely scrollable Typography card; client=${scrollState.clientHeight} scroll=${scrollState.scrollHeight}`,
  );

  // Reproduce the real-consumer state from the screen recording: the inspector
  // has already scrolled internally before a custom select opens. Leave a
  // guaranteed second scroll step available instead of assuming every font /
  // viewport combination has more than 76px of total scroll range.
  const initialScrollTop = Math.min(24, maximumScrollTop / 3);
  await inspector.evaluate((element, value) => {
    element.scrollTop = value;
  }, initialScrollTop);
  await page.waitForFunction(
    (expected) => Math.abs((document.querySelector("[data-mesurer-text-inspector-info='true']")?.scrollTop ?? -1) - expected) < 0.5,
    initialScrollTop,
  );
  await settle();

  const trigger = inspector.locator("[data-mesurer-unified-select-trigger='weight']");
  await trigger.waitFor({ state: "visible" });
  await trigger.click();

  const popup = inspector.locator("[data-mesurer-unified-select-popup='true']");
  await popup.waitFor({ state: "visible" });
  await settle();

  assert.equal(
    await popup.evaluate((element) => element.parentElement?.getAttribute("data-mesurer-text-inspector-info")),
    "true",
    "Typography popup must remain inside the inspector card for pointer ownership",
  );

  const before = offset(
    await box(trigger, "weight trigger before inspector scroll"),
    await box(popup, "weight popup before inspector scroll"),
  );

  const beforeScrollTop = await inspector.evaluate((element) => element.scrollTop);
  const remainingScroll = maximumScrollTop - beforeScrollTop;
  const internalScrollDelta = Math.min(28, Math.max(8, remainingScroll / 2));
  assert(
    beforeScrollTop + internalScrollDelta <= maximumScrollTop + 0.5,
    `fixture must leave room for a second Typography-card scroll; before=${beforeScrollTop} delta=${internalScrollDelta} max=${maximumScrollTop}`,
  );
  await inspector.evaluate((element, delta) => {
    element.scrollTop += delta;
  }, internalScrollDelta);
  await page.waitForFunction(
    (beforeValue) => Math.abs((document.querySelector("[data-mesurer-text-inspector-info='true']")?.scrollTop ?? beforeValue) - beforeValue) >= 1,
    beforeScrollTop,
  );
  await settle();

  const after = offset(
    await box(trigger, "weight trigger after inspector scroll"),
    await box(popup, "weight popup after inspector scroll"),
  );

  assertSameOffset(before, after, "open Typography popup must scroll with its trigger");

  // Window scrolling remains compositor-owned. The popup/card correction must
  // not introduce a page-scroll listener or change the popup's source-relative
  // relationship while the whole Typography surface follows its page target.
  const popupBeforeWindow = await box(popup, "popup before window scroll");
  const triggerBeforeWindow = await box(trigger, "trigger before window scroll");
  const windowBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(16, 280);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction((beforeValue) => window.scrollY !== beforeValue, windowBefore);
  await settle();
  const popupAfterWindow = await box(popup, "popup after window scroll");
  const triggerAfterWindow = await box(trigger, "trigger after window scroll");
  assertSameOffset(
    offset(triggerBeforeWindow, popupBeforeWindow),
    offset(triggerAfterWindow, popupAfterWindow),
    "window scroll must preserve Typography popup/trigger geometry",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Typography select scroll contract passed: open popups remain attached through inspector and window scrolling.");
} finally {
  await browser.close();
}
