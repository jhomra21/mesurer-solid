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

const compactItemVisible = (locator) => locator.evaluate((button) => {
  const item = button.closest('[data-mesurer-toolbar-compact-item="true"]');

  if (!(item instanceof HTMLElement)) return false;
  const rect = item.getBoundingClientRect();

  return item.getAttribute("aria-hidden") !== "true"
    && item.dataset.visible === "true"
    && rect.width > 0.5
    && rect.height > 0.5;
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const toolbar = page.locator('[data-mesurer-toolbar="true"]');
  const compactToggle = page.locator('[data-mesurer-toolbar-compact-toggle="true"]');
  const modeSwitch = page.locator('[data-mesurer-toolbar-mode-switch="true"]');
  const selectMode = page.locator('button[data-mesurer-toolbar-mode="select"]');
  const editMode = page.locator('button[data-mesurer-toolbar-mode="edit"]');
  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const xrayButton = page.locator("[data-mesurer-builtin='xray'] button");
  const rulersButton = page.locator("[data-mesurer-builtin='rulers'] button");
  const typographyButton = page.locator("button[data-mesurer-builtin='text-inspector']");
  const contextButton = page.locator("button[data-mesurer-tool-id='context.copy']");
  const codexButton = page.locator("button[data-mesurer-tool-id='codex.send']");
  const editTool = page.locator("button[data-mesurer-tool-id='edit-action']");
  const editOptions = page.locator("button[data-mesurer-tool-menu-trigger='arrange']");

  await toolbar.waitFor({ state: "visible" });
  await compactToggle.waitFor({ state: "visible" });
  await modeSwitch.waitFor({ state: "visible" });
  await editMode.waitFor({ state: "visible" });
  await contextButton.waitFor({ state: "visible" });
  await codexButton.waitFor({ state: "visible" });
  await page.locator("button[data-mesurer-builtin='color-picker']").waitFor({ state: "visible" });
  assert.equal(await modeSwitch.count(), 1, "Toolbar must expose exactly one Select/Edit mode switch");
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-mode"), "select");
  assert.equal(await selectMode.getAttribute("aria-pressed"), "true");
  assert.equal(await editMode.getAttribute("aria-pressed"), "false");
  assert(await contextButton.isVisible(), "Context must remain visible in Select mode");
  assert(await codexButton.isVisible(), "Codex must remain visible in Select mode");

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
    modeStage: getComputedStyle(document.querySelector(".mesurer-toolbar-mode-stage")).transitionDuration,
    modePill: getComputedStyle(document.querySelector(".mesurer-toolbar-mode-switch-pill")).transitionDuration,
  }));

  assert(transitionDurations.item.includes("0.15s"), `Compact items must use 150ms transitions, got ${transitionDurations.item}`);
  assert(transitionDurations.divider.includes("0.15s"), `Toolbar dividers must use 150ms transitions, got ${transitionDurations.divider}`);
  assert(transitionDurations.modePill.includes("0.15s"), `Mode pill must use 150ms transitions, got ${transitionDurations.modePill}`);

  await compactToggle.click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  const initialCompactBox = await toolbar.boundingBox();
  const modeSwitchBox = await modeSwitch.boundingBox();

  assert(initialCompactBox && modeSwitchBox, "Compact toolbar must keep the mode switch visible");
  assert(initialCompactBox.width < expandedBox.width, `Compact toolbar should shrink: ${expandedBox.width}px -> ${initialCompactBox.width}px`);
  assert.equal(await compactItemVisible(contextButton), true, "Context must remain visible while compact");
  assert.equal(await compactItemVisible(codexButton), true, "Codex must remain visible while compact");

  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await waitForSettledMotion();
  const expandedAgainBox = await toolbar.boundingBox();
  assert(expandedAgainBox && Math.abs(expandedAgainBox.width - expandedBox.width) <= 1, "Expanding must restore the original width");

  // Edit's internal Select dependency must not leak into Select mode. If Select
  // began off, leaving Edit restores it to off.
  if ((await selectButton.getAttribute("aria-pressed")) === "true") await selectButton.click();
  assert.equal(await selectButton.getAttribute("aria-pressed"), "false");

  await editMode.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "edit"
  );
  assert.equal(await selectButton.getAttribute("aria-pressed"), "true", "Edit should enable Select only as an internal targeting dependency");

  await editTool.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "select"
  );
  assert.equal(await selectButton.getAttribute("aria-pressed"), "false", "Leaving Edit must restore a previously inactive Select tool");

  // Edit replaces the Select-owned tool lane; it does not create a second toolbar
  // or change the always-visible Context/Codex lane.
  await selectButton.click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Select (S)"]')?.getAttribute("aria-pressed") === "true");
  await xrayButton.click();
  await rulersButton.click();
  assert.equal(await xrayButton.getAttribute("aria-pressed"), "true", "X-ray should be active in Select before the mode switch");
  assert.equal(await rulersButton.getAttribute("aria-pressed"), "true", "Rulers should be active in Select before the mode switch");

  await editMode.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "edit"
  );
  await editTool.waitFor({ state: "visible" });
  await editOptions.waitFor({ state: "visible" });
  assert.equal(await selectMode.getAttribute("aria-pressed"), "false");
  assert.equal(await editMode.getAttribute("aria-pressed"), "true");
  assert.equal(await editTool.getAttribute("aria-pressed"), "true", "Edit action must be highlighted with Edit mode");
  assert.equal(await xrayButton.getAttribute("aria-pressed"), "false", "Select X-ray state must not leak into Edit");
  assert.equal(await rulersButton.getAttribute("aria-pressed"), "false", "Select Rulers state must not leak into Edit");
  assert(await contextButton.isVisible(), "Context must remain visible in Edit mode");
  assert(await codexButton.isVisible(), "Codex must remain visible in Edit mode");

  await editTool.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "select"
  );
  assert.equal(await editMode.getAttribute("aria-pressed"), "false", "Edit action must invoke the real Edit command");
  assert.equal(await xrayButton.getAttribute("aria-pressed"), "true", "Select X-ray state must restore when returning from Edit");
  assert.equal(await rulersButton.getAttribute("aria-pressed"), "true", "Select Rulers state must restore when returning from Edit");

  await editMode.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "edit"
  );
  await editTool.waitFor({ state: "visible" });
  assert.equal(await editTool.getAttribute("aria-pressed"), "true");

  const editExpandedBox = await toolbar.boundingBox();
  assert(editExpandedBox, "Edit toolbar must have a bounding box");

  await compactToggle.click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  assert(await editMode.isVisible(), "Edit mode switch must remain visible while compact");
  assert(await editOptions.isVisible(), "Edit options must remain visible while Edit is active and compact");
  assert.equal(await compactItemVisible(contextButton), true, "Context must stay pinned in compact Edit");
  assert.equal(await compactItemVisible(codexButton), true, "Codex must stay pinned in compact Edit");

  const editCompactBox = await toolbar.boundingBox();
  assert(editCompactBox && editCompactBox.width < editExpandedBox.width, "Compact Edit toolbar should shrink");

  // A Select-owned shortcut exits Edit, activates its tool, and keeps compact
  // presentation intact.
  await page.keyboard.press("x");
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "select"
    && document.querySelector('button[aria-label="X-ray (X)"]')?.getAttribute("aria-pressed") === "true"
  );
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");
  assert.equal(await compactItemVisible(xrayButton), true, "Activated Select-owned tool must be visible while compact");
  assert.equal(await editMode.getAttribute("aria-pressed"), "false");

  // Edit can be re-entered while compact and its plugin-owned options remain usable.
  await editMode.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-mesurer-toolbar="true"]')?.getAttribute("data-mesurer-toolbar-mode") === "edit"
  );
  await editOptions.click();
  const editMenu = page.getByRole("menu", { name: "Edit options", exact: true });
  await editMenu.waitFor({ state: "visible" });
  const menuBox = await editMenu.boundingBox();
  assert(menuBox && menuBox.width > 100 && menuBox.height > 20, "Edit options must not be clipped by compact presentation");
  await page.keyboard.press("Escape");
  await editMenu.waitFor({ state: "hidden" });

  // Both compact motion and mode motion remain interruptible at 150ms.
  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await page.waitForTimeout(40);
  await page.getByRole("button", { name: "Compact toolbar", exact: true }).click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true", "Rapid expand -> compact must settle compact");

  await selectMode.click();
  await page.waitForTimeout(40);
  await editMode.click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-mode"), "edit", "Rapid Select -> Edit must settle in Edit");
  assert.equal(await editMode.getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Expand toolbar", exact: true }).click();
  await waitForSettledMotion();
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "false");
  assert.equal(await editMode.getAttribute("aria-pressed"), "true");

  // Reduced motion reaches the same final state without an effective transition.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Compact toolbar", exact: true }).click();
  await page.waitForTimeout(20);
  assert.equal(await toolbar.getAttribute("data-mesurer-toolbar-compact"), "true");

  const inactiveItemTransition = await typographyButton.evaluate((button) => {
    const item = button.closest('[data-mesurer-toolbar-compact-item="true"]');

    if (!item) return null;
    const style = getComputedStyle(item);

    return { property: style.transitionProperty, duration: style.transitionDuration };
  });

  assert(inactiveItemTransition, "Reduced-motion compact item must remain mounted");

  const zeroDuration = inactiveItemTransition.duration
    .split(",")
    .every((duration) => Number.parseFloat(duration) === 0);

  assert(
    inactiveItemTransition.property === "none" || zeroDuration,
    `Reduced motion must disable effective compact transitions, got property=${inactiveItemTransition.property} duration=${inactiveItemTransition.duration}`,
  );

  assert.equal(pageErrors.length, 0, `Compact toolbar page errors:\n${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Compact toolbar console errors:\n${consoleErrors.join("\n")}`);
  console.log("Single-toolbar Select/Edit modes + compact presentation + flush dividers + 150ms interruptible/reduced motion: PASS");
} finally {
  await context.close();
  await browser.close();
}
