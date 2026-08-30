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
  const reference = page.locator(".feature-copy");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  await reference.waitFor({ state: "visible" });
  assert.equal(await arrangeButton.isDisabled(), true, "Arrange should start disabled without a page selection");

  await selectButton.click();
  const before = await target.boundingBox();
  const referenceBox = await reference.boundingBox();
  assert(before, "Arrange contract target must have a bounding box");
  assert(referenceBox, "Arrange reference element must have a bounding box");
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);

  await page.waitForFunction(() => {
    const button = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert.equal(await arrangeButton.isDisabled(), false, "Arrange should enable after selecting a page element");

  await arrangeButton.click();
  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  const verticalSnapLine = page.locator("[data-mesurer-arrange-snap-line='vertical']");
  await arrangeBox.waitFor({ state: "visible" });
  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Arrange drag surface must follow the current selection");

  const rawDesiredLeft = referenceBox.x + 7;
  const dx = rawDesiredLeft - before.x;
  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 4 });

  await page.waitForFunction(() => {
    const line = document.querySelector("[data-mesurer-arrange-snap-line='vertical']");
    return line instanceof HTMLElement && line.style.display === "block";
  });

  const duringDrag = await target.boundingBox();
  assert(duringDrag, "Arrange target must keep a bounding box while dragging");
  assert(
    Math.abs(duringDrag.x - referenceBox.x) <= 1,
    `Arrange should snap the target left edge to the nearby element at ${referenceBox.x}px; got ${duringDrag.x}px`,
  );
  const snapLineBox = await verticalSnapLine.boundingBox();
  assert(snapLineBox, "Arrange should show a vertical alignment ruler while snapped");
  assert(
    Math.abs(snapLineBox.x - referenceBox.x) <= 1,
    `Arrange alignment ruler should be at ${referenceBox.x}px; got ${snapLineBox.x}px`,
  );

  const visibleMeasurementGhosts = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).visibility !== "hidden").length,
  );
  assert.equal(visibleMeasurementGhosts, 0, "Mesurer measurement ghosts should be hidden while Arrange is dragging");

  await page.mouse.up();

  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });

  const afterRelease = await target.boundingBox();
  assert(afterRelease, "Arrange target must keep a bounding box after release");
  assert(Math.abs(afterRelease.x - before.x) <= 1, "Arrange should snap the real page element back to its source X position on release");
  assert(Math.abs(afterRelease.y - before.y) <= 1, "Arrange should snap the real page element back to its source Y position on release");
  assert.equal(await verticalSnapLine.isVisible(), false, "Arrange alignment ruler should hide after release");

  const restoredMeasurements = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.some((element) => getComputedStyle(element).visibility !== "hidden"),
  );
  assert.equal(restoredMeasurements, true, "Mesurer measurement overlays should be restored after Arrange releases");

  assert.equal(pageErrors.length, 0, `Arrange browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Arrange browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange toolbar enablement + alignment snapping + snapback: PASS");
} finally {
  await browser.close();
}
