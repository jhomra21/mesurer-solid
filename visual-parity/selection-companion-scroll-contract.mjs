import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

const TARGET = "#isolated-scroll-target";
const COMPANION = "body > [data-mesurer-selection-companion='true']";
const COMPANION_CHROME = `${COMPANION} > [data-mesurer-measurement-chrome='true']`;
const SELECTED_CHROME = "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']";

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const assertSameBox = (actual, expected, stage, tolerance = 1.5) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickDocumentUi = async (locator, stage) => {
  await locator.waitFor({ state: "visible" });
  const rect = await box(locator, stage);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
};

const monitorWindowWheel = async (deltaY, durationMs = 180) => {
  const monitor = page.evaluate(({ targetSelector, companionSelector, selectedSelector, duration }) => new Promise((resolve, reject) => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({
      target: read(targetSelector),
      companion: read(companionSelector),
      selected: read(selectedSelector),
    });
    const before = state();
    if (!before.target || !before.companion || !before.selected) {
      reject(new Error("selection companion wheel probe expected all three surfaces before scrolling"));
      return;
    }

    const frames = [];
    let startedAt = 0;
    const timeout = window.setTimeout(() => reject(new Error("selection companion wheel probe did not receive window scroll")), 3000);
    const tick = (now) => {
      frames.push({ at: now - startedAt, state: state() });
      if (now - startedAt >= duration) {
        window.clearTimeout(timeout);
        resolve({ before, frames, after: state() });
        return;
      }
      requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", () => {
      startedAt = performance.now();
      requestAnimationFrame(tick);
    }, { capture: true, once: true });
  }), {
    targetSelector: TARGET,
    companionSelector: COMPANION_CHROME,
    selectedSelector: SELECTED_CHROME,
    duration: durationMs,
  });

  await page.mouse.move(1220, 840);
  await page.mouse.wheel(0, deltaY);
  return monitor;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator(TARGET);
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const targetBefore = await box(target, "target before companion selection");
  await page.mouse.click(
    targetBefore.x + targetBefore.width / 2,
    targetBefore.y + targetBefore.height / 2,
  );

  const companionRoot = page.locator(COMPANION);
  const companion = page.locator(COMPANION_CHROME);
  const selected = page.locator(SELECTED_CHROME);
  await companionRoot.waitFor({ state: "attached" });
  await companion.waitFor({ state: "visible" });
  await selected.waitFor({ state: "visible" });

  const ownership = await companionRoot.evaluate((element) => ({
    rootIsDocument: element.getRootNode() === document,
    parentIsBody: element.parentElement === document.body,
    selected: element.dataset.mesurerSelectedMeasurement ?? null,
    companion: element.dataset.mesurerSelectionCompanion ?? null,
    inspectorUi: element.dataset.mesurerInspectorUi ?? null,
  }));
  assert.deepEqual(ownership, {
    rootIsDocument: true,
    parentIsBody: true,
    selected: null,
    companion: "true",
    inspectorUi: "true",
  }, `transient selection paint must share the document source plane without impersonating the durable selection: ${JSON.stringify(ownership)}`);

  assertSameBox(await box(companion, "companion before wheel"), targetBefore, "companion before wheel");
  assertSameBox(await box(selected, "selected chrome before companion wheel"), targetBefore, "selected chrome before companion wheel");
  const companionStyle = await companion.evaluate((element) => {
    const style = getComputedStyle(element);
    return { transition: style.transitionDuration, animation: style.animationName, zIndex: style.zIndex };
  });
  assert.equal(companionStyle.transition, "0s", "selection companion must not ease behind its source");
  assert.equal(companionStyle.animation, "none", "selection companion must not animate independently");
  assert.equal(companionStyle.zIndex, "2147482800", "selection companion must stay in the page-selection paint tier");

  const continuity = await monitorWindowWheel(96);
  assert(continuity.frames.length >= 4, `expected several painted scroll frames, got ${continuity.frames.length}`);
  let materiallyMoved = false;
  for (const [index, frame] of continuity.frames.entries()) {
    const state = frame.state;
    assert(state.target && state.companion && state.selected, `painted scroll frame ${index} lost selection geometry`);
    if (Math.abs(state.target.y - continuity.before.target.y) > 15) materiallyMoved = true;
    assertSameBox(state.companion, state.target, `selection companion painted frame ${index}`);
    assertSameBox(state.selected, state.target, `durable selection painted frame ${index}`);
  }
  assert(materiallyMoved, "selection companion wheel probe did not materially move the page target");

  await settle();
  const settledTarget = await box(target, "target after companion wheel settle");
  assertSameBox(await box(companion, "companion after wheel settle"), settledTarget, "companion after wheel settle");
  assertSameBox(await box(selected, "selected after companion wheel settle"), settledTarget, "selected after companion wheel settle");

  const nestedScroller = page.locator("#nested-scroll-shell");
  const nestedTarget = page.locator("#isolated-nested-scroll-target");
  await nestedScroller.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await nestedScroller.evaluate((element) => { element.scrollTop = 340; });
  await settle();
  const nestedTargetBefore = await box(nestedTarget, "nested target before companion selection");
  await page.mouse.click(
    nestedTargetBefore.x + nestedTargetBefore.width / 2,
    nestedTargetBefore.y + nestedTargetBefore.height / 2,
  );
  await companion.waitFor({ state: "visible" });
  await selected.waitFor({ state: "visible" });
  assertSameBox(await box(companion, "nested companion before scroll"), nestedTargetBefore, "nested companion before scroll");

  const nestedScrollerBox = await box(nestedScroller, "nested scroller for companion scroll");
  await page.mouse.move(
    nestedScrollerBox.x + nestedScrollerBox.width / 2,
    nestedScrollerBox.y + nestedScrollerBox.height / 2,
  );
  await page.mouse.wheel(0, 48);
  await settle();
  const nestedTargetAfter = await box(nestedTarget, "nested target after companion scroll");
  assert(Math.abs(nestedTargetAfter.y - nestedTargetBefore.y) > 10, "nested companion probe did not move its target");
  assertSameBox(await box(companion, "nested companion after scroll"), nestedTargetAfter, "nested companion after scroll");
  assertSameBox(await box(selected, "nested selected after companion scroll"), nestedTargetAfter, "nested selected after companion scroll");

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const restoredTarget = await box(target, "target before annotation stacking probe");
  await page.mouse.click(
    restoredTarget.x + restoredTarget.width / 2,
    restoredTarget.y + restoredTarget.height / 2,
  );
  await companion.waitFor({ state: "visible" });

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  await clickDocumentUi(trigger, "Add Note trigger for selection stacking probe");
  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Selection companion stacking regression");
  await clickDocumentUi(composer.getByRole("button", { name: "Add note", exact: true }), "Add note submit for selection stacking probe");

  const panel = contextRoot.locator("[data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  const stack = await page.evaluate(({ companionSelector }) => {
    const companionChrome = document.querySelector(companionSelector);
    const panel = document.querySelector("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']");
    if (!(companionChrome instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;

    const previous = {
      left: panel.style.left,
      top: panel.style.top,
    };
    const companionRect = companionChrome.getBoundingClientRect();
    panel.style.left = `${window.scrollX + companionRect.left}px`;
    panel.style.top = `${window.scrollY + companionRect.top}px`;
    const panelRect = panel.getBoundingClientRect();
    const x = Math.max(companionRect.left, panelRect.left) + Math.min(companionRect.width, panelRect.width) / 2;
    const y = Math.max(companionRect.top, panelRect.top) + Math.min(companionRect.height, panelRect.height) / 2;
    const hit = document.elementFromPoint(x, y);
    const value = {
      companionRootIsDocument: companionChrome.getRootNode() === document,
      panelRootIsDocument: panel.getRootNode() === document,
      companionZ: Number(getComputedStyle(companionChrome).zIndex),
      panelZ: Number(getComputedStyle(panel).zIndex),
      panelOwnsOverlap: Boolean(hit && (hit === panel || panel.contains(hit))),
    };
    panel.style.left = previous.left;
    panel.style.top = previous.top;
    return value;
  }, { companionSelector: COMPANION_CHROME });
  assert(stack, "selection stacking probe could not resolve companion and annotation panel");
  assert.equal(stack.companionRootIsDocument, true, "selection companion must not return to the fixed renderer plane");
  assert.equal(stack.panelRootIsDocument, true, "annotation panel must remain document-backed");
  assert(stack.panelZ > stack.companionZ, `annotation panel must paint above selection companion: ${JSON.stringify(stack)}`);
  assert.equal(stack.panelOwnsOverlap, true, `annotation panel must occlude selection paint at a real overlap point: ${JSON.stringify(stack)}`);

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selection companion E2E: React-parity transient selection paint shares the document source plane, stays frame-locked through real window and nested scrolling, and remains below an overlapping annotation card: PASS");
} finally {
  await browser.close();
}
