import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.NORMAL_CONTEXT_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1019, height: 432 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  await page.keyboard.press("Control+,");
  let settings = page.getByRole("dialog", { name: "Settings" });
  await settings.waitFor({ state: "visible" });
  let general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  let disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  let context = settings.getByRole("switch", { name: "Context", exact: true });
  if ((await context.getAttribute("aria-checked")) !== "true") await context.click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-plugin-toggle='mesurer.context']")?.getAttribute("aria-checked") === "true");
  await page.keyboard.press("Control+,");
  await settings.waitFor({ state: "hidden" });

  // Match the manual session: Context is already enabled when the page starts.
  // This specifically exercises persisted available-plugin restoration rather
  // than only the dynamic enable path that had already been passing.
  await page.reload({ waitUntil: "networkidle" });
  const contextTool = page.locator("[data-mesurer-tool-id='context.copy'] button");
  await contextTool.waitFor({ state: "visible" });
  await page.keyboard.press("Control+,");
  settings = page.getByRole("dialog", { name: "Settings" });
  await settings.waitFor({ state: "visible" });
  general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  context = settings.getByRole("switch", { name: "Context", exact: true });
  assert.equal(await context.getAttribute("aria-checked"), "true", "Context did not restore enabled after reload");
  await page.keyboard.press("Control+,");
  await settings.waitFor({ state: "hidden" });

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator(".hero h1");
  const targetBox = await box(target, "hero target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selected = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selected.waitFor({ state: "visible" });
  const selectedBox = await box(selected, "selected hero chrome");
  assert(Math.abs(selectedBox.x - targetBox.x) <= 2, "selected hero x mismatch");
  assert(Math.abs(selectedBox.y - targetBox.y) <= 2, "selected hero y mismatch");

  const trigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await trigger.count(), 1, "expected exactly one annotation trigger for the selected hero");
  const triggerBox = await box(trigger, "annotation trigger after persisted Context selection");
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return Boolean(node?.closest?.("[data-mesurer-annotation-trigger='true']"));
  }, { x: triggerBox.x + triggerBox.width / 2, y: triggerBox.y + triggerBox.height / 2 });
  assert.equal(hit, true, "annotation trigger is rendered but does not own its visible pointer location");

  await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  const composer = page.locator("[data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  const textarea = composer.locator("textarea");
  await textarea.fill("Normal playground annotation acceptance");
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
  await composer.waitFor({ state: "hidden" });

  const marker = page.locator("[data-mesurer-annotation-marker='true']");
  await marker.waitFor({ state: "visible" });
  assert.equal(await marker.count(), 1, "saved normal-playground annotation marker missing");
  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Normal Context annotation E2E: persisted Context reload at reported viewport geometry, physical hero selection, rendered/clickable trigger, saved note, and retained marker: PASS");
} finally {
  await browser.close();
}
