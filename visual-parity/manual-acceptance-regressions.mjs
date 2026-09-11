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

  // Manual regression 1: reproduce the real selected-text path. Typography is
  // contextual page UI: it follows the text target while scrolling and leaves
  // the viewport with that target instead of becoming persistent viewport UI.
  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const targetBox = await box(target, "Expected direct Typography target");
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await page.mouse.click(targetPoint.x, targetPoint.y);
  await page.mouse.dblclick(targetPoint.x, targetPoint.y);

  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const editor = page.locator("[data-mesurer-text-editor='true']");
  await editor.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });

  const inspectorBefore = await box(inspector, "Expected Typography inspector before scroll");
  const ringBefore = await box(ring, "Expected edit ring before scroll");
  const actualScroll = await page.evaluate(() => {
    const before = window.scrollY;
    window.scrollBy({ top: 120, behavior: "instant" });
    return window.scrollY - before;
  });
  assert(Math.abs(actualScroll) > 1, `Expected a real scroll, got ${actualScroll}`);
  await page.waitForTimeout(40);

  const inspectorDuring = await box(inspector, "Typography inspector unexpectedly disappeared while target remained visible");
  const ringDuring = await box(ring, "Edit ring unexpectedly disappeared while target remained visible");
  const inspectorDelta = inspectorDuring.y - inspectorBefore.y;
  const ringDelta = ringDuring.y - ringBefore.y;
  assert(Math.abs(ringDelta + actualScroll) <= 2, `Edit ring did not follow page scroll: ${JSON.stringify({ ringBefore, ringDuring, actualScroll })}`);
  assert(Math.abs(inspectorDelta - ringDelta) <= 2, `Typography inspector detached from its text context: ${JSON.stringify({ inspectorBefore, inspectorDuring, ringBefore, ringDuring, actualScroll })}`);

  await page.evaluate(() => window.scrollBy({ top: 900, behavior: "instant" }));
  await page.waitForTimeout(60);
  const targetAfter = await target.boundingBox();
  assert(targetAfter && targetAfter.y + targetAfter.height < 0, `Expected edited target to leave viewport: ${JSON.stringify(targetAfter)}`);
  const inspectorAfter = await inspector.boundingBox();
  if (inspectorAfter) {
    assert(
      inspectorAfter.y + inspectorAfter.height < 1 || inspectorAfter.y > 619,
      `Typography inspector stayed behind after its target left: ${JSON.stringify(inspectorAfter)}`,
    );
  }

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });

  // Manual regression 2: reproduce the screenshot topology directly. Compact
  // the normal toolbar near its default left edge, open Settings, and require
  // the whole surface to remain inside the viewport rather than extending left.
  settingsPage = await browser.newPage({ viewport: { width: 620, height: 700 } });
  watchDiagnostics(settingsPage);
  await settingsPage.goto(url, { waitUntil: "networkidle" });
  const compact = settingsPage.locator("button[data-mesurer-toolbar-compact-toggle='true']");
  await compact.waitFor({ state: "visible" });
  if ((await compact.getAttribute("aria-pressed")) !== "true") await compact.click();
  await settingsPage.waitForTimeout(180);

  const settings = settingsPage.locator("button[data-mesurer-builtin='settings']").first();
  await settings.waitFor({ state: "visible" });
  await settings.click();
  const dialog = settingsPage.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  await settingsPage.waitForTimeout(60);
  const settingsBox = await box(dialog, "Expected Settings dialog geometry");
  assert(settingsBox.x >= 8 - 0.5, `Settings clipped on left viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.x + settingsBox.width <= 620 - 8 + 0.5, `Settings clipped on right viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y >= 8 - 0.5, `Settings clipped on top viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y + settingsBox.height <= 700 - 8 + 0.5, `Settings clipped on bottom viewport edge: ${JSON.stringify(settingsBox)}`);

  // Manual regression 3: every first-party optional plugin must remain visible
  // as a Settings row even when unloaded. Humans should discover and enable the
  // capability themselves instead of needing an agent to know it exists.
  const general = dialog.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  const pluginsDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  await pluginsDisclosure.waitFor({ state: "visible" });
  if ((await pluginsDisclosure.getAttribute("aria-expanded")) !== "true") await pluginsDisclosure.click();
  const pluginList = dialog.locator("[data-mesurer-plugin-settings-list='true']");
  for (const id of ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"]) {
    await pluginList.locator(`[data-mesurer-plugin-settings-section='${id}']`).waitFor({ state: "visible" });
  }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Manual acceptance regressions: Typography follows text, Settings stays in viewport, first-party plugins stay discoverable: PASS");
} finally {
  await settingsPage?.close();
  await page?.close();
  await browser.close();
}
