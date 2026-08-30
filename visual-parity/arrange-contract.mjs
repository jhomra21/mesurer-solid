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
  const textInspectorButton = page.locator("[data-mesurer-builtin='text-inspector'] button");
  const xrayButton = page.locator("[data-mesurer-builtin='xray'] button");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  const reference = page.locator(".feature-copy");

  await selectButton.waitFor({ state: "visible" });
  await textInspectorButton.waitFor({ state: "visible" });
  await xrayButton.waitFor({ state: "visible" });
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

  // Switch to a different mode without discarding the selected element. Activating Arrange
  // must return the toolbar to Select so selection remains available while arranging.
  await textInspectorButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const textInspector = document.querySelector("[data-mesurer-builtin='text-inspector'] button");
    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "false"
      && textInspector instanceof HTMLButtonElement
      && textInspector.getAttribute("aria-pressed") === "true";
  });
  assert.equal(await arrangeButton.isDisabled(), false, "Switching tools should preserve the existing Arrange selection");

  await xrayButton.click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mesurer-builtin='xray'] button");
    return button instanceof HTMLButtonElement && button.getAttribute("aria-pressed") === "true";
  });
  const referenceOutline = await reference.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) || 0 };
  });
  assert.equal(referenceOutline.style, "solid", "X-ray should render a solid outline on page elements");
  assert(referenceOutline.width > 0, "X-ray outline should have visible width");

  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });

  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  const verticalSnapLine = page.locator("[data-mesurer-arrange-snap-line='vertical']");
  await arrangeBox.waitFor({ state: "visible" });
  const dragBox = await arrangeBox.boundingBox();
  assert(dragBox, "Arrange drag surface must follow the current selection");

  // Aim within the 10px snap radius of a visible X-ray edge. With X-ray edge preference on,
  // invisible element centers are not valid element snap targets.
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
  const snapLineBox = await verticalSnapLine.boundingBox();
  assert(duringDrag, "Arrange target must keep a bounding box while dragging");
  assert(snapLineBox, "Arrange should show a vertical alignment ruler while snapped");

  const movingEdges = [duringDrag.x, duringDrag.x + duringDrag.width];
  assert(
    movingEdges.some((edge) => Math.abs(edge - snapLineBox.x) <= 1),
    `Arrange target edge should land on the active X-ray edge ruler at ${snapLineBox.x}px; edges were ${movingEdges.join(", ")}`,
  );

  const snapMatchesXrayEdge = await page.evaluate(({ snapX, movingTop, movingBottom }) => {
    const moving = document.querySelector(".primary-action");
    if (!(moving instanceof HTMLElement)) return false;
    const rangeGap = (aStart, aEnd, bStart, bEnd) =>
      Math.max(0, Math.max(aStart, bStart) - Math.min(aEnd, bEnd));

    for (const candidate of document.querySelectorAll("*")) {
      if (!(candidate instanceof HTMLElement)) continue;
      if (candidate === moving || moving.contains(candidate)) continue;
      if (candidate.closest("[data-mesurer-island='true'], [data-mesurer-inspector-ui='true'], [data-mesurer-root='true']")) continue;
      const style = getComputedStyle(candidate);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") continue;
      if (style.outlineStyle !== "solid" || (Number.parseFloat(style.outlineWidth) || 0) <= 0) continue;
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rangeGap(movingTop, movingBottom, rect.top, rect.bottom) > 160) continue;
      if ([rect.left, rect.right].some((edge) => Math.abs(edge - snapX) <= 1)) return true;
    }
    return false;
  }, {
    snapX: snapLineBox.x,
    movingTop: duringDrag.y,
    movingBottom: duringDrag.y + duringDrag.height,
  });
  assert.equal(
    snapMatchesXrayEdge,
    true,
    `Arrange ruler at ${snapLineBox.x}px should correspond to a visible X-ray box edge`,
  );

  const visibleMeasurementGhosts = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).visibility !== "hidden").length,
  );
  assert.equal(visibleMeasurementGhosts, 0, "Mesurer measurement ghosts should be hidden while Arrange is active");

  await page.mouse.up();

  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: duringDrag.x, top: duringDrag.y });

  const afterRelease = await target.boundingBox();
  assert(afterRelease, "Arrange target must keep a bounding box after release");
  assert(Math.abs(afterRelease.x - duringDrag.x) <= 1, "Arrange should keep the snapped Desired X position after release");
  assert(Math.abs(afterRelease.y - duringDrag.y) <= 1, "Arrange should keep the snapped Desired Y position after release");
  assert.equal(await verticalSnapLine.isVisible(), false, "Arrange alignment ruler should hide after release");

  const hiddenAfterRelease = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.every((element) => getComputedStyle(element).visibility === "hidden"),
  );
  assert.equal(hiddenAfterRelease, true, "Stale Mesurer measurement overlays should stay hidden while Arrange remains active");

  await arrangeButton.click();
  await page.waitForFunction(({ left, top }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - left) <= 1 && Math.abs(rect.top - top) <= 1;
  }, { left: before.x, top: before.y });

  const afterDeactivate = await target.boundingBox();
  assert(afterDeactivate, "Arrange target must keep a bounding box after deactivation");
  assert(Math.abs(afterDeactivate.x - before.x) <= 1, "Deactivating Arrange should return the page to its Live X position");
  assert(Math.abs(afterDeactivate.y - before.y) <= 1, "Deactivating Arrange should return the page to its Live Y position");

  const restoredMeasurements = await page.locator("[data-mesurer-measurement='true']").evaluateAll((elements) =>
    elements.some((element) => getComputedStyle(element).visibility !== "hidden"),
  );
  assert.equal(restoredMeasurements, true, "Mesurer measurement overlays should be restored after Arrange deactivates");

  assert.equal(pageErrors.length, 0, `Arrange browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Arrange browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange auto-Select + X-ray edge snapping + persistent Desired placement: PASS");
} finally {
  await browser.close();
}