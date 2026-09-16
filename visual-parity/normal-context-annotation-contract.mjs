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
    await trigger.evaluate((element) => Boolean(
      element.closest("[data-mesurer-context-root='true']")?.closest("[data-mesurer-root='true']"),
    )),
    true,
    "normal Context trigger must be owned by the canonical Mesurer root",
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
    await composer.evaluate((element) => {
      const contextRoot = element.closest("[data-mesurer-context-root='true']");
      const canonicalRoot = contextRoot?.closest("[data-mesurer-root='true']");
      return Boolean(contextRoot && canonicalRoot && canonicalRoot.contains(contextRoot));
    }),
    true,
    "normal Context composer must remain inside the canonical Mesurer root",
  );
  assert.equal(
    await page.evaluate(() => document.querySelectorAll("[data-mesurer-context-document-layer='true'], [data-mesurer-document-inspector-runtime='true']").length),
    0,
    "normal Context composer must not recreate the removed document interaction bridge",
  );
  await composer.locator("textarea").fill("Normal playground annotation acceptance");
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
  await composer.waitFor({ state: "hidden" });

  const marker = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  await marker.waitFor({ state: "visible" });
  assert.equal(await marker.count(), 1, "saved normal-playground annotation marker missing");
  assert.equal(await marker.getAttribute("data-mesurer-annotation-number"), "1", "first saved annotation marker must be numbered 1");

  const panel = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  assert.equal(
    await panel.locator("[data-mesurer-annotation-panel-badge='true']").textContent(),
    "1",
    "open annotation panel must use the same visible number as its marker",
  );
  const markerZIndex = Number(await marker.evaluate((element) => getComputedStyle(element).zIndex));
  const panelZIndex = Number(await panel.evaluate((element) => getComputedStyle(element).zIndex));
  assert(
    markerZIndex > panelZIndex,
    `saved annotation markers must remain physically reachable above an open panel: marker=${markerZIndex}, panel=${panelZIndex}`,
  );
  await panel.getByRole("button", { name: "Close annotation" }).click();
  await panel.waitFor({ state: "hidden" });

  const badge = marker.locator("[data-mesurer-annotation-badge='true']");
  const restingBadge = await box(badge, "resting annotation number badge");
  assert(Math.abs(restingBadge.width - 20) <= 1, `expected compact ~20px annotation badge, got ${restingBadge.width}`);
  assert.equal(
    await badge.evaluate((element) => getComputedStyle(element).transitionDuration.split(",").map((value) => value.trim()).every((value) => value === "0.15s")),
    true,
    "annotation badge growth transition must remain 150ms",
  );

  await marker.hover();
  await page.waitForFunction((restingWidth) => {
    const badgeElement = document.querySelector("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true'] [data-mesurer-annotation-badge='true']");
    return badgeElement instanceof HTMLElement && badgeElement.getBoundingClientRect().width >= restingWidth + 3;
  }, restingBadge.width, { timeout: 1000 });
  assert.equal(await marker.getAttribute("data-mesurer-annotation-highlighted"), "true", "hovered annotation marker must become the active ownership preview");
  const hoveredBadge = await box(badge, "hovered annotation number badge");
  assert(hoveredBadge.width >= restingBadge.width + 3, `annotation badge did not grow on hover: resting=${restingBadge.width}, hovered=${hoveredBadge.width}`);

  const highlight = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']");
  await highlight.waitFor({ state: "visible" });
  const highlightBox = await box(highlight, "annotation target ownership highlight");
  const currentTargetBox = await box(target, "annotation target while marker hovered");
  assert(Math.abs(highlightBox.x - currentTargetBox.x) <= 1.5, "annotation emphasis must reuse the target boundary on x");
  assert(Math.abs(highlightBox.y - currentTargetBox.y) <= 1.5, "annotation emphasis must reuse the target boundary on y");
  assert(Math.abs(highlightBox.width - currentTargetBox.width) <= 2, "annotation emphasis must reuse the target boundary width");
  assert(Math.abs(highlightBox.height - currentTargetBox.height) <= 2, "annotation emphasis must reuse the target boundary height");
  const highlightStyle = await highlight.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderTopWidth: style.borderTopWidth,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      borderRadius: style.borderRadius,
      boxSizing: style.boxSizing,
    };
  });
  assert.equal(highlightStyle.borderTopWidth, "1.5px", "annotation emphasis should add only 0.5px over the normal 1px selection edge");
  assert.equal(highlightStyle.backgroundColor, "rgba(0, 0, 0, 0)", "annotation emphasis must not tint the selected element");
  assert.equal(highlightStyle.boxShadow, "none", "annotation emphasis must not add the old outer glow");
  assert.equal(highlightStyle.borderRadius, "0px", "annotation emphasis must not add a second rounded frame");
  assert.equal(highlightStyle.boxSizing, "border-box", "annotation emphasis must stay on the existing target bounds");

  await page.mouse.move(1120, 470);
  await highlight.waitFor({ state: "hidden" });

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`);
  const browserVersion = await browser.version();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  console.log(`Normal Context annotation E2E (${browserVersion}, DPR ${dpr}): Context stays in the canonical Mesurer root, its viewport-fixed trigger follows real wheel input, saved notes use numbered ownership markers, open panels stay below marker hit targets, hover grows the compact badge with a 150ms transition, and annotation ownership reuses the target boundary as one 1.5px line with no fill or glow: PASS`);
} finally {
  await browser.close();
}
