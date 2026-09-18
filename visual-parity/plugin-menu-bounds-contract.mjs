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

  const last = page.locator('[data-mesurer-tool-menu-item="thread-10"]');
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await menu.waitFor({ state: "hidden" });

  assert.equal(pageErrors.length, 0, `Plugin menu bounds page errors:\n${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Plugin menu bounds console errors:\n${consoleErrors.join("\n")}`);
  console.log("Tall plugin destination menu viewport bounds + scrolling: PASS");
} finally {
  await context.close();
  await browser.close();
}
