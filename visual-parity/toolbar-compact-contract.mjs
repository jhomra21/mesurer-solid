import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TOOLBAR_COMPACT_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

const waitForSettledMotion = () => page.waitForTimeout(210);
const visible = async (locator) => {
  const box = await locator.boundingBox();
  return Boolean(box && box.width > 0.5 && box.height > 0.5 && await locator.isVisible());
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const toolbar = page.locator('[data-mesurer-toolbar="true"]');
  const compactToggle = page.locator('[data-mesurer-toolbar-compact-toggle="true"]');
  const compactDivider = page.locator('[data-mesurer-toolbar-divider="compact"]');
  // Use stable DOM ids here because this contract intentionally measures tools
  // after their compact wrapper becomes aria-hidden/inert and leaves the a11y tree.
  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const xrayButton = page.locator("[data-mesurer-builtin='xray'] button");
  const typographyButton = page.locator("button[data-mesurer-builtin='text-inspector']");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const arrangeOptions = page.getByRole("button", { name: "Arrange options", exact: true });

  await toolbar.waitFor({ state: "visible" });
  await compactToggle.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  assert.equal(await page.locator('[data-mesurer-toolbar-mode-switch="true"]').count(), 0, "Compact toolbar must not introduce a toolbar mode switch");

  const expandedBox = await toolbar.boundingBox();
  assert(expandedBox, "Expanded toolbar must have a bounding box");
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "false");

  const expandedDividers = page.locator('[data-mesurer-toolbar-divider]:visible');
  const expandedDividerMetrics = await expandedDividers.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const toolbarRect = node.closest('[data-mesurer-toolbar="true"]')?.getBoundingClientRect();
    return toolbarRect ? {
      topDelta: Math.abs(rect.top - toolbarRect.top),
      bottomDelta: Math.abs(rect.bottom - toolbarRect.bottom),
      height: rect.height,
      toolbarHeight: toolbarRect.height,
    } : null;
  }).filter(Boolean));
  assert(expandedDividerMetrics.length > 0, "Expanded toolbar should render at least one divider");
  assert(
    expandedDividerMetrics.every((metric) => metric.topDelta <= 0.5 && metric.bottomDelta <= 0.5 && Math.abs(metric.height - metric.toolbarHeight) <= 0.5),
    `Toolbar dividers must extend flush from top to bottom: ${JSON.stringify(expandedDividerMetrics)}`,
  );

  const transitionDurations = await page.locator('[data-mesurer-toolbar-compact-item="true"]').first().evaluate((item) => ({
    item: getComputedStyle(item).transitionDuration,
    divider: getComputedStyle(document.querySelector('[data-mesurer-toolbar-divider]')).transitionDuration,
  }));
  assert(transitionDurations.item.includes("0.15s"), `Compact items must use 150ms transitions, got ${transitionDurations.item}`);
  assert(transitionDurations.divider.includes("0.15s"), `Toolbar dividers must use 150ms transitions, got ${transitionDurations.divider}`);

  // No active tools: compact presentation should collapse all empty group wrappers,
  // leaving the chevron evenly padded instead of carrying invisible group spacing.
  await compactToggle.click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  const emptyCompactBox = await toolbar.boundingBox();
  const emptyToggleBox = await compactToggle.boundingBox();
  assert(emptyCompactBox && emptyToggleBox, "Empty compact toolbar and chevron must have bounding boxes");
  const emptyLeftInset = emptyToggleBox.x - emptyCompactBox.x;
  const emptyRightInset = (emptyCompactBox.x + emptyCompactBox.width) - (emptyToggleBox.x + emptyToggleBox.width);
  assert(emptyLeftInset <= 5 && emptyRightInset <= 5, `Empty compact toolbar must not retain phantom group padding: left=${emptyLeftInset}px right=${emptyRightInset}px`);
  assert(Math.abs(emptyLeftInset - emptyRightInset) <= 1, `Empty compact chevron should be centered by even outer padding: left=${emptyLeftInset}px right=${emptyRightInset}px`);
  assert(emptyCompactBox.width <= emptyToggleBox.width + 10, `Empty compact toolbar should wrap the chevron tightly: toolbar=${emptyCompactBox.width}px toggle=${emptyToggleBox.width}px`);

  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await waitForSettledMotion();
  const expandedAgainBox = await toolbar.boundingBox();
  assert(expandedAgainBox && Math.abs(expandedAgainBox.width - expandedBox.width) <= 1, "Expanding from the empty compact state must restore the original width");

  // This contract owns compact presentation only. Select/Arrange dependency
  // semantics are covered by the dedicated dependency/unit/browser Arrange tests.
  await selectButton.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Select (S)"]')?.getAttribute("aria-pressed") === "true");
  await arrangeButton.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Arrange (Shift+A)"]')?.getAttribute("aria-pressed") === "true");

  const beforeCompactState = {
    select: await selectButton.getAttribute("aria-pressed"),
    arrange: await arrangeButton.getAttribute("aria-pressed"),
    xray: await xrayButton.getAttribute("aria-pressed"),
    typography: await typographyButton.getAttribute("aria-pressed"),
  };

  await compactToggle.click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  const compactBox = await toolbar.boundingBox();
  assert(compactBox, "Compact toolbar must have a bounding box");
  assert(compactBox.width < expandedBox.width - 40, `Compact toolbar should materially shrink: ${expandedBox.width}px -> ${compactBox.width}px`);

  assert.equal(await visible(selectButton), true, "Active Select must remain visible in compact mode");
  assert.equal(await visible(arrangeButton), true, "Active Arrange plugin must remain visible in compact mode");
  assert.equal(await visible(xrayButton), false, "Inactive X-ray must collapse in compact mode");
  assert.equal(await visible(typographyButton), false, "Inactive Typography must collapse in compact mode");
  assert.equal(await selectButton.getAttribute("aria-pressed"), beforeCompactState.select, "Compacting must not change Select state");
  assert.equal(await arrangeButton.getAttribute("aria-pressed"), beforeCompactState.arrange, "Compacting must not change Arrange state");
  assert.equal(await xrayButton.getAttribute("aria-pressed"), beforeCompactState.xray, "Compacting must not change X-ray state");
  assert.equal(await typographyButton.getAttribute("aria-pressed"), beforeCompactState.typography, "Compacting must not change Typography state");

  const compactDividerBox = await compactDivider.boundingBox();
  const arrangeOptionsBox = await arrangeOptions.boundingBox();
  assert(compactDividerBox && arrangeOptionsBox, "Active compact tools and divider must have bounding boxes");
  const activeGap = compactDividerBox.x - (arrangeOptionsBox.x + arrangeOptionsBox.width);
  assert(activeGap >= -0.5 && activeGap <= 5, `Collapsed inactive groups must not leave a gap before the compact chevron divider: ${activeGap}px`);

  // A hidden inactive tool can still be activated through its shortcut and then becomes visible.
  await page.keyboard.press("x");
  await page.waitForFunction(() => document.querySelector('button[aria-label="X-ray (X)"]')?.getAttribute("aria-pressed") === "true");
  await waitForSettledMotion();
  assert.equal(await visible(xrayButton), true, "A tool activated while compact must become visible");
  const compactWithXrayBox = await toolbar.boundingBox();
  assert(compactWithXrayBox && compactWithXrayBox.width > compactBox.width, "Compact toolbar should expand enough to include a newly active tool");

  // Arrange's normal plugin-owned quick menu remains usable while compact.
  await arrangeOptions.click();
  const arrangeMenu = page.getByRole("menu", { name: "Arrange options", exact: true });
  await arrangeMenu.waitFor({ state: "visible" });
  const menuBox = await arrangeMenu.boundingBox();
  assert(menuBox && menuBox.width > 100 && menuBox.height > 20, "Arrange options must not be clipped by compact presentation");
  await page.keyboard.press("Escape");
  await arrangeMenu.waitFor({ state: "hidden" });

  // Transitions are interruptible: reverse before 150ms finishes and settle in the requested state.
  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await page.waitForTimeout(40);
  await page.getByRole("button", { name: "Compact toolbar", exact: true }).click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true", "Rapid expand -> compact must settle compact");
  assert.equal(await visible(selectButton), true);
  assert.equal(await visible(arrangeButton), true);
  assert.equal(await visible(xrayButton), true);

  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await waitForSettledMotion();
  const restoredBox = await toolbar.boundingBox();
  assert(restoredBox, "Restored toolbar must have a bounding box");
  assert(Math.abs(restoredBox.width - expandedBox.width) <= 1, `Expanding should restore the original width: ${expandedBox.width}px vs ${restoredBox.width}px`);
  assert.equal(await visible(typographyButton), true, "Expanding must restore inactive tools");
  assert.equal(await selectButton.getAttribute("aria-pressed"), "true");
  assert.equal(await arrangeButton.getAttribute("aria-pressed"), "true");
  assert.equal(await xrayButton.getAttribute("aria-pressed"), "true");

  // Reduced motion reaches the same states without a transition duration.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Compact toolbar", exact: true }).click();
  await page.waitForTimeout(20);
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  const inactiveItemTransition = await typographyButton.evaluate((button) => {
    const item = button.closest('[data-mesurer-toolbar-compact-item="true"]');
    return item ? getComputedStyle(item).transitionDuration : null;
  });
  assert(inactiveItemTransition === "0s" || inactiveItemTransition === "0s, 0s", `Reduced motion must disable compact transitions, got ${inactiveItemTransition}`);

  assert.equal(pageErrors.length, 0, `Compact toolbar page errors:\n${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Compact toolbar console errors:\n${consoleErrors.join("\n")}`);
  console.log("Single-toolbar compact presentation + zero phantom group gaps + active-tool retention + flush dividers + 150ms interruptible/reduced motion: PASS");
} finally {
  await context.close();
  await browser.close();
}
