import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.COMPACT_SETTINGS_URL ?? "http://127.0.0.1:4174/plugin-settings.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 580, height: 760 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, label) => {
  const value = await locator.boundingBox();
  assert(value, `${label}: expected rendered geometry`);
  return value;
};

const intersects = (left, right) => !(
  left.x + left.width <= right.x
  || right.x + right.width <= left.x
  || left.y + left.height <= right.y
  || right.y + right.height <= left.y
);

const gap = (left, right) => {
  const horizontal = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.width, right.x + right.width));
  const vertical = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.height, right.y + right.height));
  return Math.hypot(horizontal, vertical);
};

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

try {
  await page.goto(`${url}?reset=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject));

  const island = page.locator("[data-mesurer-island='true']");
  const toolbar = island.locator("[data-mesurer-toolbar='true']");
  await toolbar.waitFor({ state: "visible" });
  const initialToolbar = await box(toolbar, "initial toolbar");

  // Put a real page target through the toolbar band but leave exposed page area
  // below the toolbar so selection still goes through normal physical input.
  await page.locator("#settings-target").evaluate((element) => {
    Object.assign(element.style, {
      position: "fixed",
      left: "32px",
      top: "18px",
      width: "520px",
      height: "112px",
      zIndex: "0",
    });
  });
  await settle();

  const select = island.locator("button[data-mesurer-builtin='select']");
  await select.click();
  const target = page.locator("#settings-target");
  const targetBox = await box(target, "overlapping page target");
  await page.mouse.click(targetBox.x + targetBox.width - 16, targetBox.y + targetBox.height - 14);
  const selectedChrome = page.locator(
    "body [data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']",
  ).first();
  await selectedChrome.waitFor({ state: "visible" });

  const settingsButton = island.locator("[data-mesurer-builtin='settings'] button").first();
  await settingsButton.click();
  const dialog = island.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  const general = dialog.getByRole("tab", { name: "General" });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  const plugins = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await plugins.getAttribute("aria-expanded")) !== "true") await plugins.click();

  // Reproduce the manual failure: unload toolbar-contributing plugins while the
  // Settings dialog remains open and the settings anchor shifts left.
  for (const label of ["Screenshot", "Context"]) {
    const control = dialog.getByRole("switch", { name: label, exact: true });
    assert.equal(await control.getAttribute("aria-checked"), "true", `${label} should start enabled`);
    await control.click();
    await page.waitForFunction((name) => {
      const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
      const id = `mesurer.${name.toLowerCase()}`;
      return !(harness?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? true);
    }, label);
  }

  await page.waitForFunction(() => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    const context = root?.querySelector("[data-mesurer-tool-id='context.copy'] button");
    const screenshot = root?.querySelector("[data-mesurer-tool-id='screenshot'] button");
    const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0;
    return !visible(context) && !visible(screenshot);
  });
  await page.waitForTimeout(200);
  await settle();

  const shrunkenToolbar = await box(toolbar, "toolbar after plugin unload");
  assert(
    shrunkenToolbar.width < initialToolbar.width - 80,
    `Expected plugin unload to materially shrink toolbar: ${JSON.stringify({ initialToolbar, shrunkenToolbar })}`,
  );

  const dialogBox = await box(dialog, "Settings after toolbar shrink");
  assert(dialogBox.x >= 7, `Settings clipped past left viewport edge: ${JSON.stringify(dialogBox)}`);
  assert(
    dialogBox.x + dialogBox.width <= 573,
    `Settings clipped past right viewport edge: ${JSON.stringify(dialogBox)}`,
  );
  const keepText = dialog.getByText("Keep text changes", { exact: true });
  const keepTextBox = await box(keepText, "Keep text changes label");
  assert(
    keepTextBox.x >= dialogBox.x && keepTextBox.x + keepTextBox.width <= dialogBox.x + dialogBox.width,
    `General label clipped inside Settings after toolbar shrink: ${JSON.stringify({ dialogBox, keepTextBox })}`,
  );

  // Close Settings and verify the normal collision policy first: the toolbar
  // should not occupy the selected page target's rectangle.
  await settingsButton.click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  await settle();
  const liveToolbar = await box(toolbar, "toolbar after closing Settings");
  const liveTarget = await box(target, "selected target after plugin unload");
  assert(
    !intersects(liveToolbar, liveTarget) && gap(liveToolbar, liveTarget) >= 5.5,
    `Toolbar did not keep 6px clearance from selected target after plugin-driven resize: ${JSON.stringify({ liveToolbar, liveTarget, gap: gap(liveToolbar, liveTarget) })}`,
  );

  // Separately prove paint order. Cancel only the runtime avoidance translation
  // in this test so selection and toolbar physically overlap, make the normally
  // passive selection box hit-testable, then ask Chromium which surface wins.
  // This converts the visual stacking contract into deterministic browser data.
  const stack = await page.evaluate(() => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot;
    const toolbarElement = root?.querySelector("[data-mesurer-toolbar='true']");
    const selection = document.querySelector(
      "body [data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']",
    );
    if (!(islandElement instanceof HTMLElement) || !(toolbarElement instanceof HTMLElement) || !(selection instanceof HTMLElement)) {
      return null;
    }
    const previousTranslate = toolbarElement.style.getPropertyValue("translate");
    const previousPriority = toolbarElement.style.getPropertyPriority("translate");
    toolbarElement.style.setProperty("translate", "0px 0px", "important");
    selection.style.setProperty("pointer-events", "auto", "important");
    const toolbarRect = toolbarElement.getBoundingClientRect();
    const selectionRect = selection.getBoundingClientRect();
    const left = Math.max(toolbarRect.left, selectionRect.left);
    const right = Math.min(toolbarRect.right, selectionRect.right);
    const top = Math.max(toolbarRect.top, selectionRect.top);
    const bottom = Math.min(toolbarRect.bottom, selectionRect.bottom);
    const overlap = right > left + 2 && bottom > top + 2;
    const x = (left + right) / 2;
    const y = (top + bottom) / 2;
    const topDocumentElement = overlap ? document.elementFromPoint(x, y) : null;
    const shadowHit = overlap ? root.elementFromPoint(x, y) : null;
    const result = {
      overlap,
      topIsIsland: topDocumentElement === islandElement,
      shadowHitInsideToolbar: shadowHit instanceof Element && toolbarElement.contains(shadowHit),
      toolbarRect: { x: toolbarRect.x, y: toolbarRect.y, width: toolbarRect.width, height: toolbarRect.height },
      selectionRect: { x: selectionRect.x, y: selectionRect.y, width: selectionRect.width, height: selectionRect.height },
      selectionZ: getComputedStyle(selection).zIndex,
      islandZ: getComputedStyle(islandElement).zIndex,
    };
    selection.style.removeProperty("pointer-events");
    if (previousTranslate) toolbarElement.style.setProperty("translate", previousTranslate, previousPriority);
    else toolbarElement.style.removeProperty("translate");
    return result;
  });
  assert(stack, "Could not resolve toolbar/selection stack surfaces");
  assert(stack.overlap, `Paint-order probe failed to create overlap: ${JSON.stringify(stack)}`);
  assert(
    stack.topIsIsland && stack.shadowHitInsideToolbar,
    `Selected page chrome painted above Mesurer toolbar: ${JSON.stringify(stack)}`,
  );

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Compact Settings + toolbar occlusion acceptance: plugin-driven toolbar shrink keeps Settings in viewport, toolbar preserves selected-target clearance, and blue page chrome paints beneath Mesurer UI: PASS");
} finally {
  await browser.close();
}
