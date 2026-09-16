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

const saveNote = async (composer, text) => {
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill(text);
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
  await composer.waitFor({ state: "hidden" });
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
  await page.locator("[data-mesurer-tool-id='context.copy'] button").waitFor({ state: "visible" });
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
  await select.click();
  const target = page.locator(".hero h1");
  const targetBox = await box(target, "hero target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selected = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selected.waitFor({ state: "visible" });
  const selectedBox = await box(selected, "selected hero chrome");
  assert(Math.abs(selectedBox.x - targetBox.x) <= 2 && Math.abs(selectedBox.y - targetBox.y) <= 2, "selection chrome must match its page target");

  const trigger = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await trigger.count(), 1, "expected one Add Note trigger");
  assert.equal(await trigger.getAttribute("data-mesurer-annotation-scroll-mode"), "native-anchor", "Add Note trigger must use native target anchoring");
  assert.equal(await trigger.evaluate((element) => getComputedStyle(element).position), "fixed", "native Add Note trigger must use a fixed anchor positioning context");
  const triggerAnchor = await trigger.evaluate((element) => getComputedStyle(element).getPropertyValue("position-anchor").trim());
  assert(triggerAnchor.startsWith("--mesurer-annotation-trigger-"), `Add Note trigger lost its source anchor: ${triggerAnchor}`);
  assert.equal(
    await trigger.evaluate((element) => Boolean(element.closest("[data-mesurer-context-root='true']")?.closest("[data-mesurer-root='true']"))),
    true,
    "Context trigger must remain inside the canonical Mesurer root",
  );

  const beforeTriggerScroll = { target: await box(target, "target before trigger scroll"), trigger: await box(trigger, "trigger before scroll") };
  await page.mouse.move(1120, 470);
  await page.mouse.wheel(0, 48);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterTriggerScroll = { target: await box(target, "target after trigger scroll"), trigger: await box(trigger, "trigger after scroll") };
  assert(Math.abs(afterTriggerScroll.target.y - beforeTriggerScroll.target.y) > 10, "wheel did not move page target");
  for (const key of ["x", "y"]) {
    const beforeOffset = beforeTriggerScroll.trigger[key] - beforeTriggerScroll.target[key];
    const afterOffset = afterTriggerScroll.trigger[key] - afterTriggerScroll.target[key];
    assert(Math.abs(afterOffset - beforeOffset) <= 1.5, `Add Note trigger ${key} offset drifted across scroll`);
  }
  assert.equal(await trigger.evaluate((element) => element.style.getPropertyValue("--mesurer-nested-scroll-y")), "", "window scroll must not write JS compensation into native Add Note trigger");

  const triggerBox = afterTriggerScroll.trigger;
  await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  const composer = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  assert.equal(await composer.getAttribute("data-mesurer-annotation-scroll-mode"), "native-anchor", "composer must use native target anchoring");
  assert.equal(await composer.evaluate((element) => getComputedStyle(element).position), "fixed", "native composer must be fixed-position anchored");
  await saveNote(composer, "Normal playground annotation acceptance");

  let markers = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  await markers.first().waitFor({ state: "visible" });
  assert.equal(await markers.count(), 1, "first saved annotation marker missing");
  const marker = markers.first();
  assert.equal(await marker.getAttribute("data-mesurer-annotation-number"), "1", "first marker must be numbered 1");
  assert.equal(await marker.getAttribute("data-mesurer-annotation-scroll-mode"), "native-anchor", "saved marker must use native target anchoring");

  const panel = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  assert.equal(await panel.getAttribute("data-mesurer-annotation-scroll-mode"), "native-anchor", "open panel must use native target anchoring");
  assert.equal(await panel.locator("[data-mesurer-annotation-panel-badge='true']").textContent(), "1", "panel number must match marker");
  await trigger.waitFor({ state: "visible" });
  assert.equal(await trigger.count(), 1, "Add Note must remain available while a panel is open");

  const highlight = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']");
  await highlight.waitFor({ state: "visible" });
  for (const surface of [marker, panel, highlight]) {
    assert.equal(await surface.evaluate((element) => getComputedStyle(element).position), "fixed", "native annotation surface must use fixed anchor positioning");
    const anchor = await surface.evaluate((element) => getComputedStyle(element).getPropertyValue("position-anchor").trim());
    assert(anchor.startsWith("--mesurer-annotation-"), `annotation surface lost native source anchor: ${anchor || "<empty>"}`);
    assert.equal(await surface.evaluate((element) => element.style.getPropertyValue("--mesurer-nested-scroll-y")), "", "window scroll must not use JS delta on native annotation surface");
  }

  const scrollSample = await page.evaluate(() => new Promise((resolve) => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const before = {
      target: read(".hero h1"),
      marker: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']"),
      panel: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']"),
      highlight: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']"),
    };
    window.addEventListener("scroll", () => resolve({
      before,
      after: {
        target: read(".hero h1"),
        marker: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']"),
        panel: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']"),
        highlight: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']"),
      },
    }), { once: true });
    window.scrollBy(0, 80);
  }));
  assert(scrollSample.before.target && scrollSample.after.target, "scroll contract lost target");
  for (const name of ["marker", "panel", "highlight"]) {
    const before = scrollSample.before[name];
    const after = scrollSample.after[name];
    assert(before && after, `scroll contract lost ${name}`);
    const targetBefore = scrollSample.before.target;
    const targetAfter = scrollSample.after.target;
    assert(Math.abs((before.x - targetBefore.x) - (after.x - targetAfter.x)) <= 1.5, `${name} drifted horizontally during scroll event`);
    assert(Math.abs((before.y - targetBefore.y) - (after.y - targetAfter.y)) <= 1.5, `${name} drifted vertically during scroll event`);
    assert(Math.abs((after.y - before.y) - (targetAfter.y - targetBefore.y)) <= 1.5, `${name} behaved like viewport furniture instead of following its page target`);
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const currentTargetBox = await box(target, "target after annotation scroll");
  const panelBoxAfterScroll = await box(panel, "panel after annotation scroll");
  assert(panelBoxAfterScroll.y !== scrollSample.before.panel.y, "open annotation panel stayed pinned to the viewport");

  const markerZIndex = Number(await marker.evaluate((element) => getComputedStyle(element).zIndex));
  const panelZIndex = Number(await panel.evaluate((element) => getComputedStyle(element).zIndex));
  assert(markerZIndex > panelZIndex, "saved markers must remain physically reachable above open panel");

  await panel.getByRole("button", { name: "Close annotation" }).click();
  await panel.waitFor({ state: "hidden" });
  const badge = marker.locator("[data-mesurer-annotation-badge='true']");
  await page.waitForFunction(() => {
    const badgeElement = document.querySelector("[data-mesurer-annotation-marker='true'] [data-mesurer-annotation-badge='true']");
    return badgeElement instanceof HTMLElement && badgeElement.getBoundingClientRect().width <= 21;
  }, undefined, { timeout: 1000 });
  const restingBadge = await box(badge, "resting marker badge");
  assert(Math.abs(restingBadge.width - 20) <= 1, `expected compact ~20px badge, got ${restingBadge.width}`);

  await marker.hover();
  await highlight.waitFor({ state: "visible" });
  const highlightBox = await box(highlight, "annotation ownership highlight");
  const targetWhileHighlighted = await box(target, "highlighted target");
  assert(Math.abs(highlightBox.x - targetWhileHighlighted.x) <= 1.5, "ownership highlight x must match target");
  assert(Math.abs(highlightBox.y - targetWhileHighlighted.y) <= 1.5, "ownership highlight y must match target");
  assert(Math.abs(highlightBox.width - targetWhileHighlighted.width) <= 2, "ownership highlight width must match target");
  assert(Math.abs(highlightBox.height - targetWhileHighlighted.height) <= 2, "ownership highlight height must match target");
  const highlightStyle = await highlight.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: Number.parseFloat(style.borderTopWidth),
      color: style.borderTopColor,
      background: style.backgroundColor,
      shadow: style.boxShadow,
      radius: style.borderRadius,
      sizing: style.boxSizing,
    };
  });
  assert(highlightStyle.width >= 1 && highlightStyle.width <= 1.5, `unexpected ownership edge width ${highlightStyle.width}`);
  assert.equal(highlightStyle.color, "rgb(13, 153, 255)");
  assert.equal(highlightStyle.background, "rgba(0, 0, 0, 0)");
  assert.equal(highlightStyle.shadow, "none");
  assert.equal(highlightStyle.radius, "0px");
  assert.equal(highlightStyle.sizing, "border-box");
  await page.mouse.move(1120, 470);
  await highlight.waitFor({ state: "hidden" });

  // Add note 2 and note 3 after scrolling. This is the reported failure shape:
  // a newly mounted third marker must not inherit stale scroll state or be
  // relaid out into a distant viewport lane.
  await marker.click();
  await panel.waitFor({ state: "visible" });
  await trigger.click();
  await panel.waitFor({ state: "hidden" });
  await saveNote(composer, "Second annotation on the same selected element");
  markers = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  assert.equal(await markers.count(), 2, "second annotation marker missing");

  await trigger.click();
  await saveNote(composer, "Third annotation on the same selected element");
  assert.equal(await markers.count(), 3, "third annotation marker missing");

  const markerState = await page.evaluate(() => {
    const targetElement = document.querySelector(".hero h1");
    if (!(targetElement instanceof HTMLElement)) return null;
    const targetRect = targetElement.getBoundingClientRect();
    return [...document.querySelectorAll("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']")].map((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x < targetRect.left ? targetRect.left - x : x > targetRect.right ? x - targetRect.right : 0;
      const dy = y < targetRect.top ? targetRect.top - y : y > targetRect.bottom ? y - targetRect.bottom : 0;
      return {
        number: element.getAttribute("data-mesurer-annotation-number"),
        distance: Math.hypot(dx, dy),
        anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
      };
    });
  });
  assert(markerState, "could not measure repeated markers");
  for (const state of markerState) {
    assert(state.anchor.startsWith("--mesurer-annotation-"), `marker ${state.number} lost source anchor`);
    assert(state.distance <= 64, `marker ${state.number} drifted ${state.distance}px from target`);
  }

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`);
  const browserVersion = await browser.version();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  console.log(`Normal Context annotation E2E (${browserVersion}, DPR ${dpr}): native source anchoring keeps Add Note, markers, panel, composer, and highlight page-attached without window JS compensation; panel scrolls with its target; three same-target notes remain nearby; Add Note stays available while a note is open; and ownership remains one clean target boundary: PASS`);
} finally {
  await browser.close();
}
