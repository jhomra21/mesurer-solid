import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ARRANGE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  assert.equal(await arrangeButton.isDisabled(), true, "Arrange should start disabled without a page selection");

  await selectButton.click();
  const before = await target.boundingBox();
  assert(before, "Arrange contract target must have a bounding box");
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);

  await page.waitForFunction(() => {
    const button = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert.equal(await arrangeButton.isDisabled(), false, "Arrange should enable after selecting a page element");

  await arrangeButton.click();
  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  await arrangeBox.waitFor({ state: "visible" });
  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Arrange drag surface must follow the current selection");

  const dx = 48;
  const dy = 20;
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    dragBox.x + dragBox.width / 2 + dx,
    dragBox.y + dragBox.height / 2 + dy,
    { steps: 4 },
  );
  await page.mouse.up();

  await page.waitForFunction(({ left, top, dx, dy }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - (left + dx)) <= 1 && Math.abs(rect.top - (top + dy)) <= 1;
  }, { left: before.x, top: before.y, dx, dy });

  const arranged = await target.boundingBox();
  assert(arranged, "Arranged target must keep a bounding box");
  assert(Math.abs(arranged.x - (before.x + dx)) <= 1, `Arrange horizontal drag expected +${dx}px, got ${arranged.x - before.x}px`);
  assert(Math.abs(arranged.y - (before.y + dy)) <= 1, `Arrange vertical drag expected +${dy}px, got ${arranged.y - before.y}px`);

  await page.keyboard.press("Control+z");
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });

  assert.equal(pageErrors.length, 0, `Arrange browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Arrange browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange toolbar enablement + drag + undo: PASS");
} finally {
  await browser.close();
}
