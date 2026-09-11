import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.MANUAL_ACCEPTANCE_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const errors = [];

const watchDiagnostics = (page) => {
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
};

const box = async (locator, message) => {
  const value = await locator.boundingBox();
  assert(value, message);
  return value;
};

const assertSameBox = (actual, expected, message) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(Math.abs(actual[key] - expected[key]) <= 2, `${message}: ${key} expected ${expected[key]}, got ${actual[key]}`);
  }
};

let page;
let settingsPage;
try {
  page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  watchDiagnostics(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.style.minHeight = "3600px";
    document.body.style.minHeight = "3600px";
  });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  let targetBox = await box(target, "Expected direct Typography target");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const editor = page.locator("[data-mesurer-text-editor='true']");
  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await editor.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });
  await selectedChrome.waitFor({ state: "visible" });

  // Use a real interactive Typography control rather than clicking arbitrary
  // empty card space. Toggle Bold twice so the UI demonstrably receives pointer
  // input but returns the page style to its starting state. The active editor
  // and selected page element must remain the same throughout.
  const editorValue = await editor.inputValue();
  const bold = inspector.locator("[data-mesurer-text-style-button='bold']");
  await bold.waitFor({ state: "visible" });
  const boldBefore = await bold.getAttribute("aria-pressed");
  await bold.click();
  await page.waitForTimeout(40);
  assert.notEqual(await bold.getAttribute("aria-pressed"), boldBefore, "Typography Bold control did not respond to real pointer input");
  await bold.click();
  await page.waitForTimeout(60);
  assert.equal(await bold.getAttribute("aria-pressed"), boldBefore, "Typography Bold control did not restore its starting state");
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Typography control closed or retargeted the page editor");
  assert.equal(await editor.inputValue(), editorValue, "Typography control changed the active page editor");
  assertSameBox(
    await box(selectedChrome, "Expected page selection after Typography control input"),
    await box(target, "Expected original target after Typography control input"),
    "Typography control input changed the selected page element",
  );

  const inspectorBefore = await box(inspector, "Expected Typography inspector before wheel scroll");
  const ringBefore = await box(ring, "Expected edit ring before wheel scroll");
  targetBox = await box(target, "Expected target before wheel scroll");
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(880, 600);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  const actualScroll = scrollAfter - scrollBefore;
  assert(Math.abs(actualScroll) > 40, `Expected a real wheel scroll, got ${actualScroll}`);

  const targetDuring = await box(target, "Expected target after wheel scroll");
  const inspectorDuring = await box(inspector, "Typography inspector disappeared while target remained visible");
  const ringDuring = await box(ring, "Edit ring disappeared while target remained visible");
  const targetDelta = targetDuring.y - targetBox.y;
  assert(Math.abs(targetDelta + actualScroll) <= 2, `Target did not reflect wheel scroll: ${JSON.stringify({ targetBox, targetDuring, actualScroll })}`);
  assert(Math.abs((ringDuring.y - ringBefore.y) - targetDelta) <= 2, `Edit ring detached from target: ${JSON.stringify({ ringBefore, ringDuring, targetDelta })}`);
  assert(Math.abs((inspectorDuring.y - inspectorBefore.y) - targetDelta) <= 2, `Typography inspector detached from its text context: ${JSON.stringify({ inspectorBefore, inspectorDuring, targetDelta })}`);

  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(120);
  const targetAfter = await box(target, "Expected edited target after leaving viewport");
  assert(targetAfter.y + targetAfter.height < 1, `Expected edited target to leave viewport: ${JSON.stringify(targetAfter)}`);
  const inspectorAfter = await inspector.boundingBox();
  if (inspectorAfter) {
    assert(
      inspectorAfter.y + inspectorAfter.height < 1 || inspectorAfter.y >= 620,
      `Typography inspector stayed behind after its target left: ${JSON.stringify(inspectorAfter)}`,
    );
  }

  settingsPage = await browser.newPage({ viewport: { width: 620, height: 700 } });
  watchDiagnostics(settingsPage);
  await settingsPage.goto(url, { waitUntil: "networkidle" });
  const compact = settingsPage.locator("button[data-mesurer-toolbar-compact-toggle='true']");
  await compact.waitFor({ state: "visible" });
  if ((await compact.getAttribute("aria-pressed")) !== "true") await compact.click();
  await settingsPage.waitForTimeout(180);
  await settingsPage.keyboard.press("Control+,");

  const dialog = settingsPage.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  await settingsPage.waitForTimeout(60);
  const settingsBox = await box(dialog, "Expected Settings dialog geometry");
  assert(settingsBox.x >= 8 - 0.5, `Settings clipped on left viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.x + settingsBox.width <= 620 - 8 + 0.5, `Settings clipped on right viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y >= 8 - 0.5, `Settings clipped on top viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y + settingsBox.height <= 700 - 8 + 0.5, `Settings clipped on bottom viewport edge: ${JSON.stringify(settingsBox)}`);

  const general = dialog.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  const pluginsDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  await pluginsDisclosure.waitFor({ state: "visible" });
  if ((await pluginsDisclosure.getAttribute("aria-expanded")) !== "true") await pluginsDisclosure.click();

  const expectedPlugins = [
    ["mesurer.context", "Context", "false"],
    ["mesurer.arrange", "Arrange", "true"],
    ["mesurer.screenshot", "Screenshot", "false"],
  ];
  for (const [id, label, checked] of expectedPlugins) {
    const row = dialog.locator(`[data-mesurer-plugin-settings-section='${id}']`);
    await row.waitFor({ state: "visible" });
    assert.equal((await row.locator(`[data-mesurer-plugin-label='${id}']`).textContent())?.trim(), label, `${label} plugin row label`);
    assert.equal(await row.getByRole("switch", { name: label, exact: true }).getAttribute("aria-checked"), checked, `${label} plugin availability state`);
  }

  const contextToggle = dialog.getByRole("switch", { name: "Context", exact: true });
  await contextToggle.click();
  await settingsPage.waitForFunction(() => document.querySelector("[data-mesurer-plugin-toggle='mesurer.context']")?.getAttribute("aria-checked") === "true");
  await settingsPage.keyboard.press("Control+,");
  await dialog.waitFor({ state: "hidden" });
  if ((await compact.getAttribute("aria-pressed")) === "true") await compact.click();
  await settingsPage.waitForTimeout(180);
  await settingsPage.locator("[data-mesurer-tool-id='context.copy'] button").waitFor({ state: "visible" });

  await settingsPage.keyboard.press("Control+,");
  await dialog.waitFor({ state: "visible" });
  const generalAgain = dialog.getByRole("tab", { name: "General", exact: true });
  if ((await generalAgain.getAttribute("aria-selected")) !== "true") await generalAgain.click();
  const disclosureAgain = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosureAgain.getAttribute("aria-expanded")) !== "true") await disclosureAgain.click();
  const contextToggleAgain = dialog.getByRole("switch", { name: "Context", exact: true });
  await contextToggleAgain.click();
  await settingsPage.waitForFunction(() => document.querySelector("[data-mesurer-plugin-toggle='mesurer.context']")?.getAttribute("aria-checked") === "false");
  await settingsPage.locator("[data-mesurer-tool-id='context.copy'] button").waitFor({ state: "hidden" });

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Reported UI regressions E2E: real Typography controls preserve page ownership while the card follows/leaves with its source; compact Settings stays on-screen; optional first-party plugins are discoverable and loadable by a human: PASS");
} finally {
  await settingsPage?.close();
  await page?.close();
  await browser.close();
}
