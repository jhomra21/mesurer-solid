import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.PLUGIN_MENU_BOUNDS_URL
  ?? "http://127.0.0.1:4174/plugin-menu-contract.html";

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({ viewport: { width: 320, height: 180 } });

const page = await context.newPage();

const pageErrors = [];

const consoleErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const trigger = page.getByRole("button", {
    name: "Queue to Codex options",
    exact: true,
  });

  await trigger.waitFor({ state: "visible" });
  await trigger.click();

  const menu = page.getByRole("menu", {
    name: "Codex destination",
    exact: true,
  });

  await menu.waitFor({ state: "visible" });

  const bounds = await menu.boundingBox();
  assert(bounds, "Tall plugin menu must have a bounding box");
  const padding = 8;
  assert(
    bounds.x >= padding - 0.5,
    `Plugin menu must stay inside the left viewport edge: x=${bounds.x}`,
  );
  assert(
    bounds.x + bounds.width <= 320 - padding + 0.5,
    `Plugin menu must stay inside the right viewport edge: right=${bounds.x + bounds.width}`,
  );
  assert(
    bounds.y >= padding - 0.5,
    `Plugin menu must stay inside the top viewport edge: y=${bounds.y}`,
  );
  assert(
    bounds.y + bounds.height <= 180 - padding + 0.5,
    `Plugin menu must stay inside the bottom viewport edge: bottom=${bounds.y + bounds.height}`,
  );

  const overflow = await menu.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
    overflowY: getComputedStyle(element).overflowY,
  }));

  assert(
    overflow.scrollHeight > overflow.clientHeight,
    `Ten-item destination menu should scroll in the constrained fixture: ${JSON.stringify(overflow)}`,
  );
  assert(
    overflow.overflowY === "auto" || overflow.overflowY === "scroll",
    `Tall destination menu must be vertically scrollable: ${overflow.overflowY}`,
  );
  assert.equal(
    overflow.overflowX,
    "hidden",
    `Destination menu must not expose horizontal scrolling: ${overflow.overflowX}`,
  );
  assert(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `Destination rows must stay inside the menu width: ${JSON.stringify(overflow)}`,
  );

  const current = page.locator('[data-mesurer-tool-menu-item="thread-1"]');
  const currentBounds = await current.boundingBox();
  assert(currentBounds, "Current thread row must have rendered geometry");
  assert(
    Math.abs(currentBounds.width - (bounds.width - 10)) <= 1.5,
    `Selected row should fill the menu content width instead of leaving horizontal blank space: menu=${bounds.width}px row=${currentBounds.width}px`,
  );

  const last = page.locator('[data-mesurer-tool-menu-item="thread-10"]');
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await menu.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 1236, height: 600 });
  await trigger.click();
  await menu.waitFor({ state: "visible" });
  const wideBounds = await menu.boundingBox();
  assert(wideBounds, "Wide destination menu must have rendered geometry");
  assert(
    wideBounds.width > 224 && wideBounds.width <= 360,
    `Long thread labels should widen the dropdown without exceeding its cap: ${wideBounds.width}px`,
  );
  const currentLabel = current.locator("span").nth(1);

  const wideLabel = await currentLabel.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  assert(
    wideLabel.scrollWidth <= wideLabel.clientWidth + 1,
    `Current thread name should fit at a normal desktop viewport: ${JSON.stringify(wideLabel)}`,
  );

  assert.equal(pageErrors.length, 0, `Plugin menu bounds page errors:\n${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Plugin menu bounds console errors:\n${consoleErrors.join("\n")}`);
  console.log("Plugin destination menu viewport bounds + vertical-only scrolling + desktop label fit: PASS");
} finally {
  await context.close();
  await browser.close();
}
