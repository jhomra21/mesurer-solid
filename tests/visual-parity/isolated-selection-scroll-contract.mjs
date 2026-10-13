import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

const DOCUMENT_SELECTED_CHROME = "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']";

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

const selectedChromeOwnsTarget = async (expectedTargetId) => page.evaluate(async ({ selector, expectedTargetId }) => {
  const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;

  if (!subject) return false;
  const context = await subject.context({ scope: "selection" });

  if (context.targets.at(-1)?.inspection.id !== expectedTargetId) return false;

  const target = document.getElementById(expectedTargetId);
  const candidates = Array.from(document.querySelectorAll(selector));

  if (!(target instanceof HTMLElement) || candidates.length !== 1) return false;
  const element = candidates[0];

  if (!(element instanceof HTMLElement)) return false;

  const targetRect = target.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const anchor = getComputedStyle(element).getPropertyValue("position-anchor").trim();

  const aligned = ["x", "y", "width", "height"].every((key) =>
    Math.abs(rect[key] - targetRect[key]) <= 1.5);

  return rect.width > 0
    && rect.height > 0
    && element.dataset.mesurerNativeScrollAnchor === "box"
    && Boolean(anchor)
    && anchor !== "none"
    && aligned;
}, { selector: DOCUMENT_SELECTED_CHROME, expectedTargetId });

const waitForStableSelectedChrome = async (expectedTargetId) => {
  await page.waitForFunction(async ({ selector, expectedTargetId }) => {
    const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;

    if (!subject) return false;
    const context = await subject.context({ scope: "selection" });

    if (context.targets.at(-1)?.inspection.id !== expectedTargetId) return false;

    const target = document.getElementById(expectedTargetId);
    const candidates = Array.from(document.querySelectorAll(selector));

    if (!(target instanceof HTMLElement) || candidates.length !== 1) return false;
    const element = candidates[0];

    if (!(element instanceof HTMLElement)) return false;

    const targetRect = target.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const anchor = getComputedStyle(element).getPropertyValue("position-anchor").trim();

    const aligned = ["x", "y", "width", "height"].every((key) =>
      Math.abs(rect[key] - targetRect[key]) <= 1.5);

    return rect.width > 0
      && rect.height > 0
      && element.dataset.mesurerNativeScrollAnchor === "box"
      && Boolean(anchor)
      && anchor !== "none"
      && aligned;
  }, { selector: DOCUMENT_SELECTED_CHROME, expectedTargetId });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await settle();

    if (await selectedChromeOwnsTarget(expectedTargetId)) return;
    await page.waitForTimeout(16);
  }

  throw new Error(`selected chrome did not retain ownership of #${expectedTargetId} after settle`);
};

const assertNativeAnchor = async (locator, mode, stage) => {
  let native = null;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    native = await locator.evaluate((element) => ({
      mode: element.dataset.mesurerNativeScrollAnchor ?? null,
      anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
      transition: getComputedStyle(element).transitionDuration,
      animation: getComputedStyle(element).animationName,
    }));

    if (native.mode === mode && native.anchor && native.anchor !== "none") break;
    await page.waitForTimeout(16);
  }

  assert(native, `${stage}: expected native anchor state`);
  assert.equal(native.mode, mode, `${stage}: native anchor mode`);
  assert(native.anchor && native.anchor !== "none", `${stage}: expected resolved CSS position-anchor`);
  assert.equal(native.transition, "0s", `${stage}: must not transition`);
  assert.equal(native.animation, "none", `${stage}: must not animate`);
};

const assertDocumentContextTrigger = async (locator, stage) => {
  const value = await locator.evaluate((element) => ({
    mode: element.dataset.mesurerAnnotationScrollMode ?? null,
    coordinateSpace: element.dataset.mesurerContextCoordinateSpace ?? null,
    position: getComputedStyle(element).position,
    anchor: element.style.getPropertyValue("position-anchor"),
  }));

  assert.equal(value.mode, "document", `${stage}: annotation scroll mode`);
  assert.equal(value.coordinateSpace, "document", `${stage}: annotation coordinate space`);
  assert.equal(value.position, "absolute", `${stage}: annotation positioning`);
  assert.equal(value.anchor, "", `${stage}: window scrolling must not depend on CSS anchor positioning`);
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

  const selectedChrome = page.locator(DOCUMENT_SELECTED_CHROME).first();
  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const annotation = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  await waitForStableSelectedChrome("isolated-scroll-target");
  await selectedChrome.waitFor({ state: "visible" });
  await annotation.waitFor({ state: "visible" });
  assertSameBox(await box(selectedChrome, "selected chrome before scroll"), targetBox, "selected chrome before scroll");
  await assertNativeAnchor(selectedChrome, "box", "selected chrome");
  await assertDocumentContextTrigger(annotation, "annotation trigger");

  const contextOwnership = await contextRoot.evaluate((element) => ({
    rootIsDocument: element.getRootNode() === document,
    documentMount: element.dataset.mesurerDocumentInspectorMount ?? null,
    insideCanonicalRoot: Boolean(element.closest("[data-mesurer-root='true']")),
  }));

  assert.deepEqual(contextOwnership, {
    rootIsDocument: true,
    documentMount: "true",
    insideCanonicalRoot: false,
  }, `annotation Context must share the page document scroll tree: ${JSON.stringify(contextOwnership)}`);

  let annotationBox = await box(annotation, "annotation before scroll");
  assert(
    boxGap(targetBox, annotationBox) >= 5.5 && boxGap(targetBox, annotationBox) <= 6.5,
    `annotation trigger should keep 6px clearance; gap=${boxGap(targetBox, annotationBox).toFixed(2)}px`,
  );

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
  assert.equal(
    await annotation.evaluate((element) => element.style.getPropertyValue("--mesurer-nested-scroll-y")),
    "",
    "window scrolling must not write a Context JS compensation delta",
  );

  const editModeButton = page.locator("button[data-mesurer-toolbar-mode='edit']");
  await editModeButton.click();
  await page.locator("[data-mesurer-toolbar='true'][data-mesurer-toolbar-mode='edit']").waitFor({ state: "visible" });

  // A two-target selection was missing from the earlier scroll acceptance
  // tests. Its union readout, individual borders, and spacing lines used to
  // stay viewport-fixed inside the isolated overlay during real wheel input.
  const companion = page.locator("#isolated-edit-parent");
  const companionBox = await box(companion, "multi-selection companion");
  await page.keyboard.down("Shift");

  try {
    await page.mouse.click(companionBox.x + 8, companionBox.y + 8);
  } finally {
    await page.keyboard.up("Shift");
  }

  const multiLayer = page.locator("body > [data-mesurer-multi-selection-document-layer='true']");
  await multiLayer.waitFor({ state: "attached" });
  await page.waitForFunction(() =>
    document.querySelectorAll(
      "body > [data-mesurer-multi-selection-document-layer='true'] [data-mesurer-selection-spacing-target='true']",
    ).length === 2,
  );

  await page.waitForFunction(() => {
    const targets = ["#isolated-scroll-target", "#isolated-edit-parent"]
      .map((selector) => document.querySelector(selector));
    const hitbox = document.querySelector("[data-mesurer-arrange-box='true']");

    return targets.every((element) =>
      element instanceof HTMLElement
      && getComputedStyle(element).outlineWidth === "1px"
      && getComputedStyle(element).outlineStyle === "solid"
      && getComputedStyle(element).outlineColor === "rgb(13, 153, 255)"
      && element.style.getPropertyPriority("outline") === "important")
      && hitbox instanceof HTMLElement
      && getComputedStyle(hitbox).borderColor === "rgba(0, 0, 0, 0)";
  });

  const multiSamplePromise = page.evaluate(() => new Promise((resolve, reject) => {
    const readRect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();

      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const snapshot = () => {
      const layer = document.querySelector("[data-mesurer-multi-selection-document-layer='true']");

      const targets = [
        document.querySelector("#isolated-scroll-target"),
        document.querySelector("#isolated-edit-parent"),
      ].map(readRect);

      const outlines = [...(layer?.querySelectorAll("[data-mesurer-selection-spacing-target='true']") ?? [])].map(readRect);
      const groupLabel = readRect(layer?.querySelector("[data-mesurer-selection-group='true'] [data-mesurer-measurement-label='true']"));
      const spacingLines = [...(layer?.querySelectorAll("[data-mesurer-distance-kind='selection-spacing'] [data-mesurer-distance-line]") ?? [])].map(readRect);

      return { targets, outlines, groupLabel, spacingLines, scrollY: window.scrollY };
    };

    const before = snapshot();

    if (before.targets.some((rect) => !rect) || before.outlines.length !== 2 || !before.groupLabel) {
      return reject(new Error(`multi-selection surfaces missing before wheel: ${JSON.stringify(before)}`));
    }

    const timer = window.setTimeout(() => reject(new Error("multi-selection real wheel did not scroll")), 3000);
    window.addEventListener("scroll", () => {
      window.clearTimeout(timer);
      resolve({ before, after: snapshot() });
    }, { capture: true, once: true });
  }));

  await page.mouse.move(1220, 840);
  await page.mouse.wheel(0, 84);
  const multiSample = await multiSamplePromise;

  const matchOutlines = (state, stage) => {
    for (const [i, targetRect] of state.targets.entries()) {
      const matched = state.outlines.some((outlineRect) => outlineRect
        && ["x", "y", "width", "height"].every((key) => Math.abs(outlineRect[key] - targetRect[key]) < 2));

      assert(matched, `${stage}: selected target ${i} has a detached scroll outline: ${JSON.stringify(state)}`);
    }
  };

  matchOutlines(multiSample.before, "multi-selection before physical wheel");
  matchOutlines(multiSample.after, "multi-selection inside physical wheel event");
  assert(
    Math.abs(multiSample.after.targets[0].y - multiSample.before.targets[0].y) > 15,
    "multi-selection scroll must move the host page target",
  );
  assert(
    Math.abs(
      (multiSample.after.groupLabel.y - multiSample.before.groupLabel.y)
      - (multiSample.after.targets[0].y - multiSample.before.targets[0].y),
    ) < 2,
    "union readout must scroll with the selected elements instead of following the viewport",
  );

  for (const [index, line] of multiSample.before.spacingLines.entries()) {
    const after = multiSample.after.spacingLines[index];

    assert(after, `spacing line ${index} disappeared during scroll`);
    assert(
      Math.abs((after.y - line.y) - (multiSample.after.targets[0].y - multiSample.before.targets[0].y)) < 2,
      `spacing line ${index} must stay in the document scroll layer`,
    );
  }

  await page.waitForTimeout(140);
  await settle();

  const settledMulti = await multiLayer.evaluate((layer) => {
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();

      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };

    return {
      targets: ["#isolated-scroll-target", "#isolated-edit-parent"].map((selector) => rect(document.querySelector(selector))),
      outlines: [...layer.querySelectorAll("[data-mesurer-selection-spacing-target='true']")].map(rect),
    };
  });

  matchOutlines(settledMulti, "multi-selection after wheel settles");

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await box(target, "single-selection restore");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => !document.querySelector("[data-mesurer-multi-selection-document-layer='true']"));
  await page.locator("button[data-mesurer-toolbar-mode='select']").click();
  await page.locator("[data-mesurer-toolbar='true'][data-mesurer-toolbar-mode='select']").waitFor({ state: "visible" });

  const nestedScroller = page.locator("#nested-scroll-shell");
  const nestedTarget = page.locator("#isolated-nested-scroll-target");
  await nestedScroller.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await nestedScroller.evaluate((element) => { element.scrollTop = 340; });
  await settle();
  const nestedTargetBox = await box(nestedTarget, "nested target before selection");
  await page.mouse.click(nestedTargetBox.x + nestedTargetBox.width / 2, nestedTargetBox.y + nestedTargetBox.height / 2);
  await waitForStableSelectedChrome("isolated-nested-scroll-target");
  await selectedChrome.waitFor({ state: "visible" });
  await annotation.waitFor({ state: "visible" });
  await assertDocumentContextTrigger(annotation, "nested annotation trigger");

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

  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await box(target, "target before direct edit");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await waitForStableSelectedChrome("isolated-scroll-target");

  const editMode = page.locator("button[data-mesurer-toolbar-mode='edit']");
  await editMode.click();
  await page.locator("[data-mesurer-toolbar='true'][data-mesurer-toolbar-mode='edit']").waitFor({ state: "visible" });
  await page.waitForTimeout(180);
  await settle();

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

  const editorValue = await editor.inputValue();
  const lineBefore = await target.evaluate((element) => getComputedStyle(element).lineHeight);
  const desiredLine = lineBefore === "36px" ? "42px" : "36px";
  const lineInput = inspector.locator("[data-mesurer-text-style-input='line']");
  await lineInput.waitFor({ state: "visible" });
  const lineBox = await box(lineInput, "isolated Typography Line control");
  await page.mouse.click(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(desiredLine);
  await page.keyboard.press("Enter");
  await settle();
  assert.equal(
    await target.evaluate((element) => getComputedStyle(element).lineHeight),
    desiredLine,
    "Physical input in isolated Typography Line control did not change rendered source style",
  );
  assert.notEqual(desiredLine, lineBefore, "isolated ownership probe must visibly change line-height");
  assert.equal(await page.locator("[data-mesurer-text-editor='true']").count(), 1, "Typography control closed or retargeted the page editor");
  assert.equal(await editor.inputValue(), editorValue, "Typography control changed the active page editor");
  assertSameBox(
    await box(selectedChrome, "selected chrome after Typography control input"),
    await box(target, "source target after Typography control input"),
    "Typography control input changed page selection",
  );

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

  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(120);
  const offscreenTarget = await box(target, "isolated edit source after offscreen wheel");
  assert(offscreenTarget.y + offscreenTarget.height < 1, `isolated edit source did not leave viewport: ${JSON.stringify(offscreenTarget)}`);
  const offscreenInspector = await inspector.boundingBox();

  if (offscreenInspector) {
    assert(
      offscreenInspector.y + offscreenInspector.height < 1 || offscreenInspector.y >= 900,
      `isolated Typography card stayed behind after its source left: ${JSON.stringify({ offscreenTarget, offscreenInspector })}`,
    );
  }

  // Consumer regression: select a parent in Edit, scroll, then double-click
  // a nested child. The fixed Edit hit region must not paint a second border
  // that chases scrolling, and must not cover the Typography card afterward.
  await editor.focus();
  await editor.press("Escape");
  await editor.waitFor({ state: "detached" });

  const parent = page.locator("#isolated-edit-parent");
  const child = page.locator("#isolated-edit-child");
  await parent.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();

  const parentBefore = await box(parent, "nested parent before Edit click");
  await page.mouse.click(parentBefore.x + 9, parentBefore.y + 9);
  console.log("Nested Edit: selecting parent");
  await waitForStableSelectedChrome("isolated-edit-parent");
  console.log("Nested Edit: native parent anchor ready");

  const editBox = page.locator("[data-mesurer-arrange-box='true']");
  await editBox.waitFor({ state: "visible" });
  console.log("Nested Edit: waiting for source-painted outline with invisible portal stroke");
  await page.waitForFunction(() => {
    const hitBox = document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-arrange-box='true']")
      ?? document.querySelector("[data-mesurer-arrange-box='true']");

    const stroke = document.querySelector("body > [data-mesurer-arrange-native-stroke='true']");
    const selected = document.querySelector("body > [data-mesurer-selected-measurement='true']");

    return hitBox instanceof HTMLElement
      && stroke instanceof HTMLElement
      && selected instanceof HTMLElement
      && getComputedStyle(hitBox).borderTopColor === "rgba(0, 0, 0, 0)"
      && getComputedStyle(stroke).display !== "none"
      && getComputedStyle(stroke).opacity === "0"
      && getComputedStyle(document.querySelector("#isolated-edit-parent")).outlineStyle === "solid"
      && getComputedStyle(selected).visibility === "hidden";
  }, undefined, { timeout: 6000 }).catch(async (cause) => {
    const state = await page.evaluate(() => ({
      parent: document.querySelector("#isolated-edit-parent")?.getBoundingClientRect().toJSON(),
      editBox: [...document.querySelectorAll("[data-mesurer-arrange-box='true']")].map((node) => ({
        display: getComputedStyle(node).display,
        border: getComputedStyle(node).borderTopColor,
      })),
      roots: [...document.querySelectorAll("body > [data-mesurer-selected-measurement='true']")].map((root) => ({
        visibility: getComputedStyle(root).visibility,
        anchor: root.querySelector("[data-mesurer-measurement-chrome]")?.getAttribute("style"),
      })),
      strokes: [...document.querySelectorAll("body > [data-mesurer-arrange-native-stroke='true']")].map((node) => ({
        display: getComputedStyle(node).display,
        anchor: node.getAttribute("style"),
      })),
    }));

    throw new Error(`Native Edit stroke did not take paint ownership: ${JSON.stringify(state)}`, { cause });
  });

  const nativeStroke = page.locator("body > [data-mesurer-arrange-native-stroke='true']");

  const parentEditBefore = {
    target: await box(parent, "nested parent before wheel"),
    selected: await box(nativeStroke, "native Edit stroke before wheel"),
  };

  assertSameBox(parentEditBefore.selected, parentEditBefore.target, "native Edit stroke before wheel");
  assert.equal(
    await parent.evaluate((element) => getComputedStyle(element).outlineStyle),
    "solid",
    "the parent itself must paint the visible Edit selection outline",
  );
  await page.mouse.move(1240, 830);

  // Sample at the first real wheel scroll event, before the app's rAF-based
  // Edit refresh can run. A fixed border that merely chases the parent later
  // will fail here even if it settles into place.
  const insideWheel = page.evaluate(() => new Promise((resolve) => {
    const sample = () => {
      const target = document.querySelector("#isolated-edit-parent");
      const stroke = document.querySelector("body > [data-mesurer-arrange-native-stroke='true']");

      if (!(target instanceof HTMLElement) || !(stroke instanceof HTMLElement)) return null;

      return { target: target.getBoundingClientRect().toJSON(), selected: stroke.getBoundingClientRect().toJSON() };
    };

    window.addEventListener("scroll", () => resolve(sample()), { once: true, capture: true });
  }));

  await page.mouse.wheel(0, 72);
  const wheelFrame = await insideWheel;

  assert(wheelFrame, "Edit source-owned stroke was missing in the real scroll event");
  assertSameBox(wheelFrame.selected, wheelFrame.target, "native Edit stroke inside scroll event");
  assert.equal(
    await parent.evaluate((element) => getComputedStyle(element).outlineStyle),
    "solid",
    "source-native outline must survive wheel without an rAF catch-up",
  );
  await settle();

  const parentEditAfter = {
    target: await box(parent, "nested parent after wheel"),
    selected: await box(nativeStroke, "native Edit stroke after wheel"),
  };

  assert(Math.abs(parentEditAfter.target.y - parentEditBefore.target.y) > 20, "nested parent did not scroll");
  assertSameBox(parentEditAfter.selected, parentEditAfter.target, "native selection follows nested parent under real wheel");

  const childRect = await box(child, "nested child before direct text edit");
  await page.mouse.dblclick(childRect.x + childRect.width / 2, childRect.y + childRect.height / 2);
  await editor.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });

  await page.waitForFunction(() => {
    const box = document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-arrange-box='true']")
      ?? document.querySelector("[data-mesurer-arrange-box='true']");

    const strokes = [...document.querySelectorAll("body > [data-mesurer-arrange-native-stroke='true']")];
    const selected = [...document.querySelectorAll("body > [data-mesurer-selected-measurement='true']")];
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");

    return box instanceof HTMLElement
      && getComputedStyle(box).display === "none"
      && getComputedStyle(document.querySelector("#isolated-edit-parent")).outlineStyle === "none"
      && strokes.every((stroke) => getComputedStyle(stroke).display === "none")
      && selected.every((root) => {
        const style = getComputedStyle(root);

        return style.visibility === "hidden" || style.opacity === "0";
      })
      && card instanceof HTMLElement
      && getComputedStyle(card).visibility === "visible";
  });


  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Public isolated E2E: real window/nested scrolling keeps document-owned annotation and native selection attached; physical Typography control input changes rendered source without retargeting page ownership; Context window scroll needs no JS catch-up; Typography leaves with its source while toolbar stays viewport-owned: PASS");
} finally {
  await browser.close();
}
