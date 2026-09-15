import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.NORMAL_CONTEXT_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1162, height: 494 },
  deviceScaleFactor: 2,
  userAgent: "CodexBrowser Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
});
const pageErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.addInitScript(() => {
  Object.defineProperty(window, "__codexWebMcpModelContext", {
    configurable: true,
    value: {},
  });
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const openSettings = async () => {
  const button = page.locator("button[data-mesurer-builtin='settings']");
  await button.waitFor({ state: "visible" });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  return dialog;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  let settings = await openSettings();
  let general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  let disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  let context = settings.getByRole("switch", { name: "Context", exact: true });
  if ((await context.getAttribute("aria-checked")) !== "true") await context.click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-plugin-toggle='mesurer.context']")?.getAttribute("aria-checked") === "true");
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await settings.waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "networkidle" });
  const contextTool = page.locator("[data-mesurer-tool-id='context.copy'] button");
  await contextTool.waitFor({ state: "visible" });
  settings = await openSettings();
  general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  context = settings.getByRole("switch", { name: "Context", exact: true });
  assert.equal(await context.getAttribute("aria-checked"), "true", "Context did not restore enabled after reload");
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await settings.waitFor({ state: "hidden" });

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator(".hero h1");
  const targetBox = await box(target, "hero target before selection");
  assert(Math.abs(targetBox.width - 900) <= 2, `expected reported 900px hero width, got ${targetBox.width}`);
  assert(Math.abs(targetBox.height - 184) <= 4, `expected reported ~184px hero height, got ${targetBox.height}`);
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selected = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selected.waitFor({ state: "visible" });
  const selectedBox = await box(selected, "selected hero chrome");
  assert(Math.abs(selectedBox.x - targetBox.x) <= 2, "selected hero x mismatch");
  assert(Math.abs(selectedBox.y - targetBox.y) <= 2, "selected hero y mismatch");

  const trigger = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await trigger.count(), 1, "expected exactly one annotation trigger for the selected hero");
  assert.equal(
    await trigger.getAttribute("data-mesurer-annotation-scroll-mode"),
    "cached-delta",
    "Context trigger must use cached-delta scrolling in the canonical root",
  );
  assert.equal(
    await trigger.getAttribute("data-mesurer-context-coordinate-space"),
    "viewport",
    "Context trigger must use canonical viewport coordinates",
  );
  assert.equal(
    await trigger.evaluate((element) => getComputedStyle(element).position),
    "fixed",
    "Context trigger must stay fixed inside the canonical interaction root",
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll("[data-mesurer-context-document-layer='true'], [data-mesurer-document-inspector-runtime='true']").length),
    0,
    "normal Context must not create the removed document-backed interaction plane",
  );

  let triggerBox = await box(trigger, "annotation trigger after persisted Context selection");
  const beforeScroll = {
    target: await box(target, "target before Context wheel"),
    trigger: triggerBox,
    scrollY: await page.evaluate(() => window.scrollY),
    delta: await trigger.evaluate((element) => ({
      x: element.style.getPropertyValue("--mesurer-nested-scroll-x"),
      y: element.style.getPropertyValue("--mesurer-nested-scroll-y"),
    })),
  };

  await page.mouse.move(1120, 470);
  await page.mouse.wheel(0, 48);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterScroll = {
    target: await box(target, "target after Context wheel"),
    trigger: await box(trigger, "trigger after Context wheel"),
    scrollY: await page.evaluate(() => window.scrollY),
    delta: await trigger.evaluate((element) => ({
      x: element.style.getPropertyValue("--mesurer-nested-scroll-x"),
      y: element.style.getPropertyValue("--mesurer-nested-scroll-y"),
    })),
  };
  assert(Math.abs(afterScroll.target.y - beforeScroll.target.y) > 10, "Context acceptance wheel did not move the target");
  for (const key of ["x", "y"]) {
    const beforeOffset = beforeScroll.trigger[key] - beforeScroll.target[key];
    const afterOffset = afterScroll.trigger[key] - afterScroll.target[key];
    assert(Math.abs(afterOffset - beforeOffset) <= 1.5, `canonical cached-delta trigger ${key} offset drifted: before=${beforeOffset}, after=${afterOffset}`);
  }
  const scrollDelta = afterScroll.scrollY - beforeScroll.scrollY;
  const cachedY = Number.parseFloat(afterScroll.delta.y || "0");
  assert(
    Math.abs(cachedY + scrollDelta) <= 1.5,
    `Context cached Y delta must mirror window scroll without geometry catch-up: scroll=${scrollDelta}, cached=${cachedY}`,
  );
  assert.equal(afterScroll.delta.x || "0px", "0px", "vertical window scroll must not introduce a Context X delta");

  triggerBox = afterScroll.trigger;
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return Boolean(node?.closest?.("[data-mesurer-annotation-trigger='true']"));
  }, { x: triggerBox.x + triggerBox.width / 2, y: triggerBox.y + triggerBox.height / 2 });
  assert.equal(hit, true, "annotation trigger is rendered but does not own its visible pointer location");

  await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  const composer = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => document.body.querySelectorAll("[data-mesurer-annotation-composer='true']").length),
    0,
    "normal Context composer must remain in the canonical Mesurer root",
  );
  await composer.locator("textarea").fill("Normal playground annotation acceptance");
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
  await composer.waitFor({ state: "hidden" });

  const marker = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  await marker.waitFor({ state: "visible" });
  assert.equal(await marker.count(), 1, "saved normal-playground annotation marker missing");
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`);
  const browserVersion = await browser.version();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  console.log(`Normal Context annotation E2E (${browserVersion}, DPR ${dpr}): Context stays in the canonical Mesurer root, its viewport-fixed trigger follows real wheel input through cached scalar deltas, saves a note, and retains its marker: PASS`);
} finally {
  await browser.close();
}
