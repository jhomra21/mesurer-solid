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
let narrowPage;
try {
  page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  watchDiagnostics(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.style.minHeight = "3600px";
    document.body.style.minHeight = "3600px";
  });

  // Manual regression 1: reproduce the real selected-text path. The interactive
  // Typography card belongs to that text context. It may be viewport-clamped
  // while the target is visible, but it must move with that target as the page
  // scrolls and leave the viewport when the edited target leaves. It must not
  // become persistent viewport furniture.
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
  const scrollDelta = 120;
  const actualScroll = await page.evaluate((delta) => {
    const before = window.scrollY;
    window.scrollBy({ top: delta, behavior: "instant" });
    return window.scrollY - before;
  }, scrollDelta);
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
      `Typography inspector stayed behind as viewport furniture after its target left: ${JSON.stringify(inspectorAfter)}`,
    );
  }

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });

  // Manual regression 2: open the normal playground from the start in a narrow
  // viewport. This matches the reported edge case without inheriting a toolbar
  // position from a different viewport width.
  narrowPage = await browser.newPage({ viewport: { width: 320, height: 700 } });
  watchDiagnostics(narrowPage);
  await narrowPage.goto(url, { waitUntil: "networkidle" });
  const compact = narrowPage.locator("button[data-mesurer-toolbar-compact-toggle='true']");
  await compact.waitFor({ state: "visible" });
  if ((await compact.getAttribute("aria-pressed")) !== "true") await compact.click();
  const settings = narrowPage.locator("button[data-mesurer-builtin='settings']").first();
  await settings.waitFor({ state: "visible" });
  await settings.click();
  const dialog = narrowPage.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  await narrowPage.waitForTimeout(180);
  const settingsBox = await box(dialog, "Expected Settings dialog geometry");
  assert(settingsBox.x >= 8 - 0.5, `Settings clipped on left viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.x + settingsBox.width <= 320 - 8 + 0.5, `Settings clipped on right viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y >= 8 - 0.5, `Settings clipped on top viewport edge: ${JSON.stringify(settingsBox)}`);
  assert(settingsBox.y + settingsBox.height <= 700 - 8 + 0.5, `Settings clipped on bottom viewport edge: ${JSON.stringify(settingsBox)}`);

  // Manual regression 3: the normal playground must advertise every first-party
  // optional plugin. Disabled plugins stay unloaded, but their rows remain
  // visible so a human can discover and enable them without an agent.
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
  await narrowPage?.close();
  await page?.close();
  await browser.close();
}
