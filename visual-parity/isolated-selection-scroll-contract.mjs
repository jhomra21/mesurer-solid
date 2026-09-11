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

const assertSameBox = (actual, expected, stage, tolerance = 1.5) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const assertRelativeOffset = (before, after, stage, tolerance = 1.5) => {
  for (const key of ["x", "y"]) {
    const beforeOffset = before.surface[key] - before.target[key];
    const afterOffset = after.surface[key] - after.target[key];
    assert(
      Math.abs(afterOffset - beforeOffset) <= tolerance,
      `${stage}: ${key} offset changed; before=${beforeOffset} after=${afterOffset}`,
    );
  }
};

const boxGap = (a, b) => {
  const horizontal = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const vertical = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(horizontal, vertical);
};

const settle = async () => {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
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

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const mountState = await page.evaluate(() => ({
    isolated: window.__MESURER_ISOLATED_SCROLL_TEST__?.subject.root instanceof ShadowRoot,
    globalAgent: Boolean(window.__MESURER__),
  }));
  assert.equal(mountState.isolated, true, "contract must exercise the public isolated ShadowRoot mount");
  assert.equal(mountState.globalAgent, true, "contract must exercise the public agent bridge");
  assert.deepEqual(await page.evaluate(() => window.__MESURER__.textEdits()), [], "public textEdits() must not recurse");

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetBox = await box(target, "isolated target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  const annotation = page.locator("[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']");
  await selectedChrome.waitFor({ state: "visible" });
  await annotation.waitFor({ state: "visible" });
  assertSameBox(await box(selectedChrome, "selected chrome before scroll"), targetBox, "selected chrome before scroll");
  await assertNativeAnchor(selectedChrome, "box", "selected chrome");
  await assertNativeAnchor(annotation, "offset", "annotation trigger");
  let annotationBox = await box(annotation, "annotation before scroll");
  assert(
    boxGap(targetBox, annotationBox) >= 5.5 && boxGap(targetBox, annotationBox) <= 6.5,
    `annotation trigger should keep 6px clearance; gap=${boxGap(targetBox, annotationBox).toFixed(2)}px`,
  );

  // Exercise the actual compositor path with a wheel event. Selection and the
  // annotation trigger must move in the same frame as their page target.
  const beforeWindow = {
    target: targetBox,
    selected: await box(selectedChrome, "selected before wheel"),
    annotation: annotationBox,
  };
  await page.mouse.move(1220, 840);
  await page.mouse.wheel(0, 80);
  await settle();
  const afterWindow = {
    target: await box(target, "target after wheel"),
    selected: await box(selectedChrome, "selected after wheel"),
    annotation: await box(annotation, "annotation after wheel"),
  };
  assert(Math.abs(afterWindow.target.y - beforeWindow.target.y) > 20, "real wheel event did not move the inspected page target");
  assertSameBox(afterWindow.selected, afterWindow.target, "selection after real wheel scroll");
  assertRelativeOffset(
    { target: beforeWindow.target, surface: beforeWindow.annotation },
    { target: afterWindow.target, surface: afterWindow.annotation },
    "annotation after real wheel scroll",
  );

  // Nested overflow is a separate topology. Select the nested target physically,
  // put the pointer over its real scroller, wheel it, and verify the same visible
  // relationship rather than inferring success from internal state.
  const nestedScroller = page.locator("#nested-scroll-shell");
  const nestedTarget = page.locator("#isolated-nested-scroll-target");
  await nestedScroller.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await nestedScroller.evaluate((element) => { element.scrollTop = 340; });
  await settle();
  let nestedTargetBox = await box(nestedTarget, "nested target before selection");
  await page.mouse.click(nestedTargetBox.x + nestedTargetBox.width / 2, nestedTargetBox.y + nestedTargetBox.height / 2);
  await selectedChrome.waitFor({ state: "visible" });
  await annotation.waitFor({ state: "visible" });
  const nestedBefore = {
    target: nestedTargetBox,
    selected: await box(selectedChrome, "nested selected before wheel"),
    annotation: await box(annotation, "nested annotation before wheel"),
  };
  assertSameBox(nestedBefore.selected, nestedBefore.target, "nested selection before wheel");
  const nestedScrollerBox = await box(nestedScroller, "nested scroller");
  await page.mouse.move(nestedScrollerBox.x + nestedScrollerBox.width / 2, nestedScrollerBox.y + nestedScrollerBox.height / 2);
  await page.mouse.wheel(0, 48);
  await settle();
  const nestedAfter = {
    target: await box(nestedTarget, "nested target after wheel"),
    selected: await box(selectedChrome, "nested selected after wheel"),
    annotation: await box(annotation, "nested annotation after wheel"),
  };
  assert(Math.abs(nestedAfter.target.y - nestedBefore.target.y) > 10, "real nested wheel event did not move the nested target");
  assertSameBox(nestedAfter.selected, nestedAfter.target, "nested selection after wheel");
  assertRelativeOffset(
    { target: nestedBefore.target, surface: nestedBefore.annotation },
    { target: nestedAfter.target, surface: nestedAfter.annotation },
    "nested annotation after real wheel scroll",
  );

  // Return to the main target and enter direct editing through the real UI.
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await box(target, "target before direct edit");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const textHighlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
  await editor.waitFor({ state: "visible" });
  await editRing.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await inspectorShell.waitFor({ state: "visible" });
  await textHighlight.waitFor({ state: "visible" });
  await assertNativeAnchor(editRing, "box", "direct-edit ring");
  await assertNativeAnchor(inspectorShell, "offset", "Typography source anchor");
  await assertNativeAnchor(textHighlight, "offset", "selected-text highlight");

  // Mesurer interaction ownership: a real double click on the Typography card
  // must not create a second editor, retarget the page selection, or change the
  // active text. This specifically covers clicking UI over inspected content.
  const editorValue = await editor.inputValue();
  const inspectorInputBox = await box(inspector, "Typography card before input boundary check");
  await page.mouse.dblclick(
    inspectorInputBox.x + Math.min(110, inspectorInputBox.width / 2),
    inspectorInputBox.y + Math.min(18, inspectorInputBox.height / 2),
  );
  await page.waitForTimeout(60);
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Typography card created or retargeted a page editor");
  assert.equal(await editor.inputValue(), editorValue, "Typography card input changed the active page editor");
  assertSameBox(
    await box(selectedChrome, "selected chrome after Typography input"),
    await box(target, "source target after Typography input"),
    "Typography card input changed page selection",
  );

  // Geometry ownership: the toolbar remains viewport UI, but Typography follows
  // its source text. One wheel event must visibly separate those ownership models.
  const toolbar = page.locator("[data-mesurer-toolbar='true']");
  const editBefore = {
    target: await box(target, "edit source before wheel"),
    selected: await box(selectedChrome, "edit selection before wheel"),
    ring: await box(editRing, "edit ring before wheel"),
    inspector: await box(inspector, "Typography card before wheel"),
    highlight: await box(textHighlight, "text highlight before wheel"),
    toolbar: await box(toolbar, "toolbar before wheel"),
  };
  await page.mouse.move(1220, 840);
  await page.mouse.wheel(0, 80);
  await settle();
  const editAfter = {
    target: await box(target, "edit source after wheel"),
    selected: await box(selectedChrome, "edit selection after wheel"),
    ring: await box(editRing, "edit ring after wheel"),
    inspector: await box(inspector, "Typography card after wheel"),
    highlight: await box(textHighlight, "text highlight after wheel"),
    toolbar: await box(toolbar, "toolbar after wheel"),
  };
  assert(Math.abs(editAfter.target.y - editBefore.target.y) > 20, "direct-edit source did not move under real wheel scroll");
  assertSameBox(editAfter.selected, editAfter.target, "selection during direct-edit wheel scroll");
  assertSameBox(editAfter.ring, editAfter.target, "edit ring during real wheel scroll");
  assertRelativeOffset(
    { target: editBefore.target, surface: editBefore.inspector },
    { target: editAfter.target, surface: editAfter.inspector },
    "Typography card during real wheel scroll",
  );
  assertRelativeOffset(
    { target: editBefore.target, surface: editBefore.highlight },
    { target: editAfter.target, surface: editAfter.highlight },
    "selected-text highlight during real wheel scroll",
  );
  assertSameBox(editAfter.toolbar, editBefore.toolbar, "toolbar must remain viewport-owned during page scroll");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Public isolated E2E: real window/nested scrolling keeps annotation and selection attached; Typography blocks page retargeting yet follows its source; toolbar stays viewport-owned: PASS");
} finally {
  await browser.close();
}
