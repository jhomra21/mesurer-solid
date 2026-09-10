import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const value = await locator.boundingBox();
    if (value) return value;
    // Solid can replace a portaled selection node during the native-anchor
    // handoff after the locator has already matched it. Retry only the brief
    // no-geometry window; a surface that stays unrendered still fails below.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }
  assert.fail(`${stage}: expected rendered geometry`);
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

const settleScroll = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const assertMotionFree = async (locator, stage) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const motion = await locator.evaluate((element) => {
      if (!element.isConnected) return null;
      const style = getComputedStyle(element);
      const sample = {
        transitionDuration: style.transitionDuration,
        animationName: style.animationName,
      };
      // A portal node can detach between locator resolution and style sampling.
      // Chromium returns empty computed values for that transient node; retry
      // only that case so a connected surface with real motion still fails.
      if (!element.isConnected || !sample.transitionDuration || !sample.animationName) return null;
      return sample;
    });

    if (motion) {
      assert.equal(motion.transitionDuration, "0s", `${stage}: geometry surface must not transition`);
      assert.equal(motion.animationName, "none", `${stage}: geometry surface must not animate`);
      return;
    }

    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }

  assert.fail(`${stage}: expected a connected geometry surface with computed motion styles`);
};

const assertNativeAnchor = async (locator, mode, stage) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const native = await locator.evaluate((element) => {
      if (!element.isConnected) return null;
      const sample = {
        mode: element.dataset.mesurerNativeScrollAnchor ?? null,
        anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
      };
      // The same portal handoff can remove the old node's anchor metadata after
      // locator resolution. Retry only missing/disconnected samples; a stable
      // non-null but incorrect mode is returned and fails below immediately.
      if (!element.isConnected || sample.mode === null || !sample.anchor || sample.anchor === "none") return null;
      return sample;
    });

    if (native) {
      assert.equal(native.mode, mode, `${stage}: native anchor mode`);
      assert(native.anchor && native.anchor !== "none", `${stage}: expected a resolved CSS position-anchor`);
      return;
    }

    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  }

  assert.fail(`${stage}: expected a connected geometry surface with resolved native anchor`);
};

// Sample inside the scroll event itself. This catches compositor-visible drift
// before any queued microtask or animation frame can repair it.
const sampleScrollEvent = async (
  deltaY,
  { ring = false, inspector = false, typography = false } = {},
) => page.evaluate(
  ({ deltaY: scrollDelta, ring: includeRing, inspector: includeInspector, typography: includeTypography }) => new Promise((resolve, reject) => {
    const target = document.querySelector(".feature-copy .kicker");
    const selectedRoot = document.querySelector("[data-mesurer-selected-measurement='true']");
    const selected = selectedRoot?.querySelector("[data-mesurer-native-scroll-anchor='box']");
    const editRing = includeRing ? document.querySelector("[data-mesurer-text-edit-ring='true']") : null;
    const inspectorShell = includeInspector
      ? document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")
      : null;
    const inspectorCard = includeInspector
      ? document.querySelector("[data-mesurer-text-inspector-info='true']")
      : null;
    const typographyBox = includeTypography
      ? document.querySelector(".mesurer-ti-box[data-state='visible']")
      : null;
    const typographyCard = includeTypography
      ? document.querySelector(".mesurer-ti-card[data-state='visible']")
      : null;

    if (!(target instanceof HTMLElement)) return reject(new Error("Expected target before scroll"));
    if (!includeTypography && !(selected instanceof HTMLElement)) return reject(new Error("Expected selected chrome before scroll"));
    if (includeRing && !(editRing instanceof HTMLElement)) return reject(new Error("Expected direct-edit ring before scroll"));
    if (includeInspector && (!(inspectorShell instanceof HTMLElement) || !(inspectorCard instanceof HTMLElement))) {
      return reject(new Error("Expected unified Typography inspector before scroll"));
    }
    if (includeTypography && (!(typographyBox instanceof HTMLElement) || !(typographyCard instanceof HTMLElement))) {
      return reject(new Error("Expected standalone Typography surfaces before scroll"));
    }

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({
      target: snapshot(target),
      selected: selected instanceof HTMLElement ? snapshot(selected) : null,
      ring: editRing instanceof HTMLElement ? snapshot(editRing) : null,
      inspector: inspectorShell instanceof HTMLElement ? snapshot(inspectorShell) : null,
      inspectorPlacement: inspectorCard instanceof HTMLElement
        ? inspectorCard.dataset.mesurerTextInspectorPlacement ?? null
        : null,
      typographyBox: typographyBox instanceof HTMLElement ? snapshot(typographyBox) : null,
      typographyCard: typographyCard instanceof HTMLElement ? snapshot(typographyCard) : null,
    });

    const before = state();
    window.addEventListener("scroll", () => resolve({ before, after: state() }), { capture: true, once: true });
    window.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  { deltaY, ring, inspector, typography },
);

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const nativeAnchorSupported = await page.evaluate(() => Boolean(
    CSS.supports("anchor-name: --mesurer-native-anchor")
    && CSS.supports("position-anchor: --mesurer-native-anchor")
    && CSS.supports("left: anchor(left)")
    && CSS.supports("width: anchor-size(width)"),
  ));
  assert.equal(nativeAnchorSupported, true, "Chromium scroll contract requires CSS Anchor Positioning");

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();

  let targetBox = await box(target, "target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 1);
  // Selection chrome and its measurement label are portaled/re-anchored in the
  // same stabilization pass but are separate DOM nodes. Wait for both sides of
  // that handoff before inspecting computed motion state; otherwise Chromium
  // can expose the transient pre-anchor label node with an empty style value.
  await page.waitForFunction(() => (
    document.querySelector("[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']")
    && document.querySelector("[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='label']")
  ));

  // Bind directly to the nodes whose native-anchor handoff was just proven.
  // Deriving first/last children from the portal root can retain a detached
  // transient node while Solid reconciles the selected measurement subtree.
  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']").first();
  const selectedLabel = page.locator("[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='label']").first();
  await assertMotionFree(selectedChrome, "selected measurement chrome");
  await assertMotionFree(selectedLabel, "selected measurement label");
  await assertNativeAnchor(selectedChrome, "box", "selected measurement chrome");
  await assertNativeAnchor(selectedLabel, "label", "selected measurement label");
  assertSameBox(await box(selectedChrome, "selected before scroll"), targetBox, "selected before scroll");

  // Exercise the actual production selected chrome inside the scroll event.
  // A hand-created duplicate does not share the production placement lifecycle
  // and can lose its synthetic anchor independently of Mesurer's own surface.
  const immediateSelection = await sampleScrollEvent(80);
  assert(immediateSelection.after.selected, "selected scroll event: expected selected chrome geometry");
  assertSameBox(immediateSelection.after.selected, immediateSelection.after.target, "selected in scroll event");
  targetBox = immediateSelection.after.target;

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-edit-ring='true']").length === 1);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-inspector-placement-shell='true']").length === 1);
  await page.waitForFunction(() => (
    document.querySelector("[data-mesurer-text-edit-ring='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "box"
    && document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "offset"
  ));

  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const inspectorCard = page.locator("[data-mesurer-text-inspector-info='true']");
  await assertMotionFree(editRing, "direct-edit ring");
  await assertMotionFree(inspectorShell, "unified Typography placement shell");
  await assertMotionFree(inspectorCard, "unified Typography card");
  await assertNativeAnchor(editRing, "box", "direct-edit ring");
  await assertNativeAnchor(inspectorShell, "offset", "unified Typography placement shell");
  assertSameBox(await box(editRing, "edit ring before scroll"), targetBox, "edit ring before scroll");

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();
  const immediateEdit = await sampleScrollEvent(40, { ring: true, inspector: true });
  assert(immediateEdit.after.selected, "edit scroll event: expected selected chrome geometry");
  assert(immediateEdit.after.ring, "edit scroll event: expected ring geometry");
  assert(immediateEdit.before.inspector && immediateEdit.after.inspector, "edit scroll event: expected inspector geometry");
  assertSameBox(immediateEdit.after.selected, immediateEdit.after.target, "selected chrome in edit scroll event");
  assertSameBox(immediateEdit.after.ring, immediateEdit.after.target, "edit ring in scroll event");
  assert.equal(
    immediateEdit.after.inspectorPlacement,
    immediateEdit.before.inspectorPlacement,
    "edit scroll event: small scroll should keep the Typography placement lane",
  );
  assertRelativeOffset(
    { target: immediateEdit.before.target, surface: immediateEdit.before.inspector },
    { target: immediateEdit.after.target, surface: immediateEdit.after.inspector },
    "unified Typography inspector in scroll event",
  );

  await settleScroll();
  targetBox = await box(target, "target after settled edit scroll");
  assertSameBox(await box(selectedChrome, "selected after settled edit scroll"), targetBox, "selected after settled edit scroll");
  assertSameBox(await box(editRing, "edit ring after settled edit scroll"), targetBox, "edit ring after settled edit scroll");

  const editor = page.locator("[data-mesurer-text-editor='true']");
  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "false");

  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  await typography.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();
  targetBox = await box(target, "target before standalone Typography scroll");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const typographyBox = page.locator(".mesurer-ti-box[data-state='visible']");
  const typographyCard = page.locator(".mesurer-ti-card[data-state='visible']");
  await typographyBox.waitFor({ state: "visible" });
  await typographyCard.waitFor({ state: "visible" });
  await assertMotionFree(typographyBox, "standalone Typography box");
  await assertMotionFree(typographyCard, "standalone Typography card");
  assertSameBox(await box(typographyBox, "Typography box before scroll"), targetBox, "Typography box before scroll");

  const immediateTypography = await sampleScrollEvent(32, { typography: true });
  assert(immediateTypography.before.typographyBox && immediateTypography.after.typographyBox, "Typography scroll event: expected box geometry");
  assert(immediateTypography.before.typographyCard && immediateTypography.after.typographyCard, "Typography scroll event: expected card geometry");
  assertSameBox(immediateTypography.after.typographyBox, immediateTypography.after.target, "Typography box in scroll event");
  assertRelativeOffset(
    { target: immediateTypography.before.target, surface: immediateTypography.before.typographyCard },
    { target: immediateTypography.after.target, surface: immediateTypography.after.typographyCard },
    "Typography card in scroll event",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Native anchors keep selection/direct-edit/Typography geometry compositor-owned and motion-free during scroll: PASS");
} finally {
  await browser.close();
}
