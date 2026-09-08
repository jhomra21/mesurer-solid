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
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};
const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} chrome=${actual[key]}`,
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
const settleScroll = async () => {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
};
const assertMotionFree = async (locator, stage) => {
  const motion = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
    };
  });
  assert.equal(motion.transitionDuration, "0s", `${stage}: geometry surface must not transition`);
  assert.equal(motion.animationName, "none", `${stage}: geometry surface must not animate`);
};

// Intentionally sample inside the scroll event itself. The contract listener is
// registered after Mesurer's listeners, so this sees the geometry Mesurer made
// available during the event, before any queued microtask or animation frame.
const sampleScrollEvent = async (
  deltaY,
  { includeRing = false, includeInspector = false, includeTextInspector = false } = {},
) => page.evaluate(
  ({ deltaY: scrollDelta, includeRing: shouldIncludeRing, includeInspector: shouldIncludeInspector, includeTextInspector: shouldIncludeTextInspector }) => new Promise((resolve, reject) => {
    const target = document.querySelector(".feature-copy .kicker");
    const selectedRoot = document.querySelector("[data-mesurer-selected-measurement='true']");
    const selectedChrome = selectedRoot?.children.item(0);
    const editRing = shouldIncludeRing
      ? document.querySelector("[data-mesurer-text-edit-ring='true']")
      : null;
    const inspectorShell = shouldIncludeInspector
      ? document.querySelector("[data-mesurer-text-inspector-placement-shell='true']")
      : null;
    const inspectorCard = shouldIncludeInspector
      ? document.querySelector("[data-mesurer-text-inspector-info='true']")
      : null;
    const typographyBox = shouldIncludeTextInspector
      ? document.querySelector(".mesurer-ti-box[data-state='visible']")
      : null;
    const typographyCard = shouldIncludeTextInspector
      ? document.querySelector(".mesurer-ti-card[data-state='visible']")
      : null;

    if (!(target instanceof HTMLElement)) {
      reject(new Error("Expected target before scroll"));
      return;
    }
    if (!shouldIncludeTextInspector && !(selectedChrome instanceof HTMLElement)) {
      reject(new Error("Expected selected chrome before scroll"));
      return;
    }
    if (shouldIncludeRing && !(editRing instanceof HTMLElement)) {
      reject(new Error("Expected direct-edit ring before scroll"));
      return;
    }
    if (shouldIncludeInspector && (!(inspectorShell instanceof HTMLElement) || !(inspectorCard instanceof HTMLElement))) {
      reject(new Error("Expected unified Typography inspector before scroll"));
      return;
    }
    if (shouldIncludeTextInspector && (!(typographyBox instanceof HTMLElement) || !(typographyCard instanceof HTMLElement))) {
      reject(new Error("Expected Typography inspection chrome before scroll"));
      return;
    }

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({
      target: snapshot(target),
      selected: selectedChrome instanceof HTMLElement ? snapshot(selectedChrome) : null,
      ring: editRing instanceof HTMLElement ? snapshot(editRing) : null,
      inspector: inspectorShell instanceof HTMLElement ? snapshot(inspectorShell) : null,
      inspectorPlacement: inspectorCard instanceof HTMLElement
        ? inspectorCard.dataset.mesurerTextInspectorPlacement ?? null
        : null,
      typographyBox: typographyBox instanceof HTMLElement ? snapshot(typographyBox) : null,
      typographyCard: typographyCard instanceof HTMLElement ? snapshot(typographyCard) : null,
    });
    const before = state();
    const onScroll = () => resolve({ before, after: state() });
    window.addEventListener("scroll", onScroll, { capture: true, once: true });
    window.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  { deltaY, includeRing, includeInspector, includeTextInspector },
);

try {
  await page.goto(url, { waitUntil: "networkidle" });

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

  const selected = page.locator("[data-mesurer-selected-measurement='true']");
  const selectedChrome = selected.locator(":scope > div").first();
  const selectedLabel = selected.locator(":scope > div").last();
  await assertMotionFree(selectedChrome, "selected measurement chrome");
  await assertMotionFree(selectedLabel, "selected measurement label");
  assertSameBox(await box(selectedChrome, "selected before scroll"), targetBox, "selected before scroll");

  const immediateSelection = await sampleScrollEvent(80);
  assert(immediateSelection.after.selected, "selected scroll event: expected selected chrome geometry");
  assertSameBox(immediateSelection.after.selected, immediateSelection.after.target, "selected in scroll event");
  targetBox = immediateSelection.after.target;

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-edit-ring='true']").length === 1);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-inspector-placement-shell='true']").length === 1);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const inspectorCard = page.locator("[data-mesurer-text-inspector-info='true']");
  await assertMotionFree(editRing, "direct-edit ring");
  await assertMotionFree(inspectorShell, "unified Typography placement shell");
  await assertMotionFree(inspectorCard, "unified Typography card");
  assertSameBox(await box(editRing, "edit ring before scroll"), targetBox, "edit ring before scroll");

  // Re-center while the editor is open, then sample a small scroll that keeps
  // the same placement lane. The ring must already be on the host before the
  // inspector reads it during this same event.
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();
  targetBox = await box(target, "target before direct-edit scroll event");
  const immediateEdit = await sampleScrollEvent(40, { includeRing: true, includeInspector: true });
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

  // Let the canonical reactive state converge too; it must not move any of the
  // already-synchronized geometry to a different position afterward.
  await settleScroll();
  targetBox = await box(target, "target after settled edit scroll");
  assertSameBox(await box(selectedChrome, "selected after settled edit scroll"), targetBox, "selected after settled edit scroll");
  assertSameBox(await box(editRing, "edit ring after settled edit scroll"), targetBox, "edit ring after settled edit scroll");

  // Exercise the standalone Typography inspection surface as well. It used to
  // defer scroll geometry through requestAnimationFrame independently of the
  // direct-editing inspector.
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

  const immediateTypography = await sampleScrollEvent(32, { includeTextInspector: true });
  assert(immediateTypography.before.typographyBox && immediateTypography.after.typographyBox, "Typography scroll event: expected box geometry");
  assert(immediateTypography.before.typographyCard && immediateTypography.after.typographyCard, "Typography scroll event: expected card geometry");
  assertSameBox(immediateTypography.after.typographyBox, immediateTypography.after.target, "Typography box in scroll event");
  assertRelativeOffset(
    { target: immediateTypography.before.target, surface: immediateTypography.before.typographyCard },
    { target: immediateTypography.after.target, surface: immediateTypography.after.typographyCard },
    "Typography card in scroll event",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selection, direct-edit, and Typography geometry stay animation-free and host-locked inside the scroll event: PASS");
} finally {
  await browser.close();
}
