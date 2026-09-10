import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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

const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const assertRelativeOffset = (before, after, stage) => {
  for (const key of ["x", "y"]) {
    const beforeOffset = before.surface[key] - before.target[key];
    const afterOffset = after.surface[key] - after.target[key];
    assert(
      Math.abs(afterOffset - beforeOffset) <= 1.5,
      `${stage}: ${key} offset changed; before=${beforeOffset} after=${afterOffset}`,
    );
  }
};

const intersects = (left, right, gap = 0) => !(
  left.x + left.width + gap <= right.x
  || right.x + right.width + gap <= left.x
  || left.y + left.height + gap <= right.y
  || right.y + right.height + gap <= left.y
);

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const waitForScrollIdle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await settle();
};

const assertNativeAnchor = async (locator, mode, stage) => {
  const native = await locator.evaluate((element) => ({
    mode: element.dataset.mesurerNativeScrollAnchor ?? null,
    anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
    transition: getComputedStyle(element).transitionDuration,
    animation: getComputedStyle(element).animationName,
  }));
  assert.equal(native.mode, mode, `${stage}: native anchor mode`);
  assert(native.anchor && native.anchor !== "none", `${stage}: expected resolved CSS position-anchor`);
  assert.equal(native.transition, "0s", `${stage}: must not transition`);
  assert.equal(native.animation, "none", `${stage}: must not animate`);
};

const sampleScrollEvent = async (deltaY, { ring = false, inspector = false, highlight = false } = {}) => page.evaluate(
  ({ deltaY: scrollDelta, includeRing, includeInspector, includeHighlight }) => new Promise((resolve, reject) => {
    const target = document.querySelector("#isolated-scroll-target");
    const selected = document.querySelector("[data-mesurer-selected-measurement='true'] > div");
    const editRing = includeRing ? document.querySelector("[data-mesurer-text-edit-ring='true']") : null;
    const inspectorShell = includeInspector
      ? document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")
      : null;
    const textHighlight = includeHighlight
      ? document.querySelector("[data-mesurer-text-selection-highlight='true']")
      : null;

    if (!(target instanceof HTMLElement)) return reject(new Error("Expected isolated target before scroll"));
    if (!(selected instanceof HTMLElement)) return reject(new Error("Expected isolated selected chrome before scroll"));
    if (includeRing && !(editRing instanceof HTMLElement)) return reject(new Error("Expected isolated edit ring before scroll"));
    if (includeInspector && !(inspectorShell instanceof HTMLElement)) return reject(new Error("Expected isolated Typography shell before scroll"));
    if (includeHighlight && !(textHighlight instanceof HTMLElement)) return reject(new Error("Expected isolated selected-text highlight before scroll"));

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({
      target: snapshot(target),
      selected: snapshot(selected),
      ring: editRing instanceof HTMLElement ? snapshot(editRing) : null,
      inspector: inspectorShell instanceof HTMLElement ? snapshot(inspectorShell) : null,
      highlight: textHighlight instanceof HTMLElement ? snapshot(textHighlight) : null,
    });

    const before = state();
    window.addEventListener("scroll", () => resolve({ before, after: state() }), { capture: true, once: true });
    window.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  { deltaY, includeRing: ring, includeInspector: inspector, includeHighlight: highlight },
);

const measureNativeScrollWork = async (deltaY, { ranges = false } = {}) => page.evaluate(
  ({ deltaY: scrollDelta, includeRanges }) => new Promise((resolve, reject) => {
    const target = document.querySelector("#isolated-scroll-target");
    if (!(target instanceof HTMLElement)) return reject(new Error("Expected target for native scroll work probe"));

    const originalRect = target.getBoundingClientRect;
    const originalRangeRects = Range.prototype.getClientRects;
    let targetRectReads = 0;
    let rangeRectReads = 0;
    target.getBoundingClientRect = function mesurerTargetRectProbe() {
      targetRectReads += 1;
      return originalRect.call(this);
    };
    if (includeRanges) {
      Range.prototype.getClientRects = function mesurerRangeRectProbe() {
        rangeRectReads += 1;
        return originalRangeRects.call(this);
      };
    }

    const finish = () => {
      delete target.getBoundingClientRect;
      if (includeRanges) Range.prototype.getClientRects = originalRangeRects;
      resolve({ targetRectReads, rangeRectReads });
    };

    window.scrollBy({ top: scrollDelta, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }),
  { deltaY, includeRanges: ranges },
);

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const mountState = await page.evaluate(() => ({
    isolated: window.__MESURER_ISOLATED_SCROLL_TEST__?.subject.root instanceof ShadowRoot,
    hostLayer: window.__MESURER_ISOLATED_SCROLL_TEST__?.subject.hostLayer ?? null,
    globalAgent: Boolean(window.__MESURER__),
  }));
  assert.equal(mountState.isolated, true, "contract must exercise the public isolated ShadowRoot mount");
  assert.equal(mountState.globalAgent, true, "contract must exercise the public window.__MESURER__ agent bridge");
  assert.deepEqual(
    await page.evaluate(() => window.__MESURER__.textEdits()),
    [],
    "public window.__MESURER__.textEdits() must not recurse",
  );

  const nativeAnchorSupported = await page.evaluate(() => Boolean(
    CSS.supports("anchor-name: --mesurer-native-anchor")
    && CSS.supports("position-anchor: --mesurer-native-anchor")
    && CSS.supports("left: anchor(left)")
    && CSS.supports("width: anchor-size(width)"),
  ));
  assert.equal(nativeAnchorSupported, true, "isolated scroll contract requires CSS Anchor Positioning");

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetBox = await box(target, "isolated target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selectedChrome.waitFor({ state: "visible" });
  await assertNativeAnchor(selectedChrome, "box", "isolated selected chrome");
  assertSameBox(await box(selectedChrome, "isolated selected before scroll"), targetBox, "isolated selected before scroll");

  const immediateSelection = await sampleScrollEvent(80);
  assertSameBox(immediateSelection.after.selected, immediateSelection.after.target, "isolated selected chrome in scroll event");
  // The previous scroll's 80ms settle pass is allowed to remeasure after the
  // hot event. Let it finish before instrumenting a second, independent scroll
  // so this probe counts work caused by that scroll only.
  await waitForScrollIdle();
  const selectedScrollWork = await measureNativeScrollWork(20);
  assert.deepEqual(
    selectedScrollWork,
    { targetRectReads: 0, rangeRectReads: 0 },
    `native selected scroll must not chase geometry from JavaScript: ${JSON.stringify(selectedScrollWork)}`,
  );
  targetBox = await box(target, "isolated target after native work probe");

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const textHighlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
  await editRing.waitFor({ state: "visible" });
  await inspectorShell.waitFor({ state: "visible" });
  await textHighlight.waitFor({ state: "visible" });
  await assertNativeAnchor(editRing, "box", "isolated direct-edit ring");
  await assertNativeAnchor(inspectorShell, "offset", "isolated contextual Typography shell");
  await assertNativeAnchor(textHighlight, "offset", "isolated selected-text highlight");

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const immediateEdit = await sampleScrollEvent(40, { ring: true, inspector: true, highlight: true });
  assertSameBox(immediateEdit.after.selected, immediateEdit.after.target, "isolated selected chrome in edit scroll event");
  assertSameBox(immediateEdit.after.ring, immediateEdit.after.target, "isolated edit ring in scroll event");
  assertRelativeOffset(
    { target: immediateEdit.before.target, surface: immediateEdit.before.inspector },
    { target: immediateEdit.after.target, surface: immediateEdit.after.inspector },
    "isolated Typography shell in scroll event",
  );
  assertRelativeOffset(
    { target: immediateEdit.before.target, surface: immediateEdit.before.highlight },
    { target: immediateEdit.after.target, surface: immediateEdit.after.highlight },
    "isolated selected-text highlight in scroll event",
  );
  await waitForScrollIdle();
  const editScrollWork = await measureNativeScrollWork(20, { ranges: true });
  assert.deepEqual(
    editScrollWork,
    { targetRectReads: 0, rangeRectReads: 0 },
    `native direct-edit scroll must not remeasure host text from JavaScript: ${JSON.stringify(editScrollWork)}`,
  );

  // The toolbar is persistent viewport UI. Scroll the active edit target into
  // its viewport band and prove the toolbar itself does not move to another
  // edge. Local selection/context chrome owns collision behavior instead.
  const toolbar = page.locator("[data-mesurer-toolbar='true']");
  const toolbarBefore = await box(toolbar, "toolbar before active target overlap");
  await page.evaluate(() => {
    const targetElement = document.querySelector("#isolated-scroll-target");
    if (!(targetElement instanceof HTMLElement)) throw new Error("Expected target for toolbar stability check");
    const top = targetElement.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 18), behavior: "instant" });
  });
  await new Promise((resolve) => setTimeout(resolve, 24));
  const toolbarDuring = await box(toolbar, "toolbar during active target overlap");
  await waitForScrollIdle();
  const toolbarAfter = await box(toolbar, "toolbar after active target overlap");
  targetBox = await box(target, "target near stationary toolbar");
  assertSameBox(toolbarDuring, toolbarBefore, "toolbar during selected/edit target scroll");
  assertSameBox(toolbarAfter, toolbarBefore, "toolbar after selected/edit target scroll");
  assert.equal(
    await toolbar.getAttribute("data-mesurer-toolbar-avoiding-target"),
    null,
    "viewport toolbar must not enable target-avoidance translation",
  );
  assert.equal(
    intersects(toolbarAfter, targetBox, 0),
    true,
    `stability probe must actually bring the target into the toolbar band; toolbar=${JSON.stringify(toolbarAfter)} target=${JSON.stringify(targetBox)}`,
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Public isolated mount keeps native scroll layout-free, public agent callable, and viewport toolbar stationary: PASS");
} finally {
  await browser.close();
}
