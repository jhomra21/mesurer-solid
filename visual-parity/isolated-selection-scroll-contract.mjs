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

const assertViewportStable = (before, after, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(after[key] - before[key]) <= 1.5,
      `${stage}: ${key} moved; before=${before[key]} after=${after[key]}`,
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

const boxGap = (a, b) => {
  const horizontal = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const vertical = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(horizontal, vertical);
};

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

const assertViewportOwned = async (locator, stage) => {
  const state = await locator.evaluate((element) => ({
    position: getComputedStyle(element).position,
    mode: element.dataset.mesurerNativeScrollAnchor ?? null,
    owner: element.dataset.mesurerNativeScrollOwner ?? null,
    transition: getComputedStyle(element).transitionDuration,
    animation: getComputedStyle(element).animationName,
  }));
  assert.equal(state.position, "fixed", `${stage}: must remain viewport-fixed`);
  assert.equal(state.mode, null, `${stage}: must not join the page anchor graph`);
  assert.equal(state.owner, null, `${stage}: must not claim a page scroll owner`);
  assert.equal(state.transition, "0s", `${stage}: must not transition`);
  assert.equal(state.animation, "none", `${stage}: must not animate`);
};

const sampleScrollEvent = async (
  deltaY,
  { ring = false, inspector = false, highlight = false, annotation = false } = {},
) => page.evaluate(
  ({ deltaY: scrollDelta, includeRing, includeInspector, includeHighlight, includeAnnotation }) => new Promise((resolve, reject) => {
    const target = document.querySelector("#isolated-scroll-target");
    const selected = document.querySelector("[data-mesurer-selected-measurement='true'] > div");
    const editRing = includeRing ? document.querySelector("[data-mesurer-text-edit-ring='true']") : null;
    const inspectorShell = includeInspector
      ? document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")
      : null;
    const textHighlight = includeHighlight
      ? document.querySelector("[data-mesurer-text-selection-highlight='true']")
      : null;
    const annotationTrigger = includeAnnotation
      ? document.querySelector("[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']")
      : null;

    if (!(target instanceof HTMLElement)) return reject(new Error("Expected isolated target before scroll"));
    if (!(selected instanceof HTMLElement)) return reject(new Error("Expected isolated selected chrome before scroll"));
    if (includeRing && !(editRing instanceof HTMLElement)) return reject(new Error("Expected isolated edit ring before scroll"));
    if (includeInspector && !(inspectorShell instanceof HTMLElement)) return reject(new Error("Expected isolated Typography shell before scroll"));
    if (includeHighlight && !(textHighlight instanceof HTMLElement)) return reject(new Error("Expected isolated selected-text highlight before scroll"));
    if (includeAnnotation && !(annotationTrigger instanceof HTMLElement)) return reject(new Error("Expected isolated annotation trigger before scroll"));

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
      annotation: annotationTrigger instanceof HTMLElement ? snapshot(annotationTrigger) : null,
    });

    const before = state();
    window.addEventListener("scroll", () => resolve({ before, after: state() }), { capture: true, once: true });
    window.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  {
    deltaY,
    includeRing: ring,
    includeInspector: inspector,
    includeHighlight: highlight,
    includeAnnotation: annotation,
  },
);

const sampleNestedScrollEvent = async (deltaY) => page.evaluate(
  (scrollDelta) => new Promise((resolve, reject) => {
    const scroller = document.querySelector("#nested-scroll-shell");
    const target = document.querySelector("#isolated-nested-scroll-target");
    const selected = document.querySelector("[data-mesurer-selected-measurement='true'] > div");
    const annotation = document.querySelector("[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']");
    if (!(scroller instanceof HTMLElement)) return reject(new Error("Expected nested scroll container"));
    if (!(target instanceof HTMLElement)) return reject(new Error("Expected nested selection target"));
    if (!(selected instanceof HTMLElement)) return reject(new Error("Expected nested selected chrome"));
    if (!(annotation instanceof HTMLElement)) return reject(new Error("Expected nested annotation trigger"));

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({
      target: snapshot(target),
      selected: snapshot(selected),
      annotation: snapshot(annotation),
    });
    const before = state();
    const timer = window.setTimeout(() => reject(new Error("Nested annotation scroll probe timed out")), 3_000);
    scroller.addEventListener("scroll", () => {
      window.clearTimeout(timer);
      resolve({ before, after: state() });
    }, { once: true });
    scroller.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  deltaY,
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

const measureNestedScrollWork = async (deltaY) => page.evaluate(
  (scrollDelta) => new Promise((resolve, reject) => {
    const scroller = document.querySelector("#nested-scroll-shell");
    const target = document.querySelector("#isolated-nested-scroll-target");
    if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return reject(new Error("Expected nested target for native scroll work probe"));
    }
    const originalRect = target.getBoundingClientRect;
    let targetRectReads = 0;
    target.getBoundingClientRect = function mesurerNestedTargetRectProbe() {
      targetRectReads += 1;
      return originalRect.call(this);
    };
    const finish = () => {
      delete target.getBoundingClientRect;
      resolve({ targetRectReads });
    };
    scroller.scrollBy({ top: scrollDelta, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }),
  deltaY,
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

  const annotationTrigger = page.locator("[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']");
  await annotationTrigger.waitFor({ state: "visible" });
  let annotationBox = await box(annotationTrigger, "isolated annotation trigger before scroll");
  assert.equal(annotationBox.width, 24, "isolated annotation trigger width");
  assert.equal(annotationBox.height, 24, "isolated annotation trigger height");
  assert(
    boxGap(targetBox, annotationBox) >= 5.5 && boxGap(targetBox, annotationBox) <= 6.5,
    `isolated annotation trigger should keep 6px clearance; gap=${boxGap(targetBox, annotationBox).toFixed(2)}px`,
  );
  assert.equal(
    await annotationTrigger.getAttribute("data-mesurer-native-scroll-owner"),
    "annotation",
    "isolated annotation trigger must advertise native scroll ownership",
  );
  await assertNativeAnchor(annotationTrigger, "offset", "isolated annotation trigger");

  const immediateSelection = await sampleScrollEvent(80, { annotation: true });
  assertSameBox(immediateSelection.after.selected, immediateSelection.after.target, "isolated selected chrome in scroll event");
  assertRelativeOffset(
    { target: immediateSelection.before.target, surface: immediateSelection.before.annotation },
    { target: immediateSelection.after.target, surface: immediateSelection.after.annotation },
    "isolated annotation trigger in first scroll event",
  );
  await waitForScrollIdle();
  const selectedScrollWork = await measureNativeScrollWork(20);
  assert.deepEqual(
    selectedScrollWork,
    { targetRectReads: 0, rangeRectReads: 0 },
    `native selected scroll must not chase geometry from JavaScript: ${JSON.stringify(selectedScrollWork)}`,
  );

  // Reproduce the consumer topology that window scrolling does not cover: a
  // page element selected inside an overflow scroller. Selection is physical,
  // and the first scroll sample belongs to the container itself.
  const nestedScroller = page.locator("#nested-scroll-shell");
  const nestedTarget = page.locator("#isolated-nested-scroll-target");
  await nestedScroller.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await nestedScroller.evaluate((element) => { element.scrollTop = 340; });
  await waitForScrollIdle();
  let nestedTargetBox = await box(nestedTarget, "nested target before selection");
  await page.mouse.click(
    nestedTargetBox.x + nestedTargetBox.width / 2,
    nestedTargetBox.y + nestedTargetBox.height / 2,
  );
  await selectedChrome.waitFor({ state: "visible" });
  assertSameBox(
    await box(selectedChrome, "nested selected before scroll"),
    nestedTargetBox,
    "nested selected before scroll",
  );
  await annotationTrigger.waitFor({ state: "visible" });
  annotationBox = await box(annotationTrigger, "nested annotation before scroll");
  const nestedGap = boxGap(nestedTargetBox, annotationBox);
  assert(
    nestedGap >= 5.5 && nestedGap <= 6.5,
    `nested annotation trigger should keep 6px clearance; gap=${nestedGap.toFixed(2)}px`,
  );
  await assertNativeAnchor(annotationTrigger, "offset", "nested annotation trigger");

  const immediateNested = await sampleNestedScrollEvent(48);
  assertSameBox(immediateNested.after.selected, immediateNested.after.target, "nested selected chrome in first container scroll event");
  assertRelativeOffset(
    { target: immediateNested.before.target, surface: immediateNested.before.annotation },
    { target: immediateNested.after.target, surface: immediateNested.after.annotation },
    "nested annotation trigger in first container scroll event",
  );
  await waitForScrollIdle();
  const nestedScrollWork = await measureNestedScrollWork(20);
  assert.deepEqual(
    nestedScrollWork,
    { targetRectReads: 0 },
    `native nested annotation scroll must not chase target geometry from JavaScript: ${JSON.stringify(nestedScrollWork)}`,
  );

  // Restore the original physical Select target for the direct-edit and toolbar
  // portions of this contract.
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await waitForScrollIdle();
  targetBox = await box(target, "isolated target before reselection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  assertSameBox(await box(selectedChrome, "isolated selected after reselection"), targetBox, "isolated selected after reselection");

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const textHighlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
  await editRing.waitFor({ state: "visible" });
  await inspectorShell.waitFor({ state: "visible" });
  await textHighlight.waitFor({ state: "visible" });
  await assertNativeAnchor(editRing, "box", "isolated direct-edit ring");
  await assertViewportOwned(inspectorShell, "isolated contextual Typography shell");
  await assertNativeAnchor(textHighlight, "offset", "isolated selected-text highlight");

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const immediateEdit = await sampleScrollEvent(40, { ring: true, inspector: true, highlight: true });
  assertSameBox(immediateEdit.after.selected, immediateEdit.after.target, "isolated selected chrome in edit scroll event");
  assertSameBox(immediateEdit.after.ring, immediateEdit.after.target, "isolated edit ring in scroll event");
  assertViewportStable(
    immediateEdit.before.inspector,
    immediateEdit.after.inspector,
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
  console.log("Public isolated mount keeps page-linked selection/annotation/edit chrome layout-free while Typography inspector stays viewport-owned across window and nested scrolling: PASS");
} finally {
  await browser.close();
}
