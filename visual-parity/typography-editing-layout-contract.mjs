import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_EDITING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const editor = () => page.locator("[data-mesurer-text-editor='true']");
const ring = () => page.locator("[data-mesurer-text-edit-ring='true']");
const selection = () => page.locator("[data-mesurer-text-selection-highlight='true']");
const caret = () => page.locator("[data-mesurer-text-caret='true']");
const inspector = () => page.locator("[data-mesurer-text-inspector-info='true']");
const waitForEditor = async (stage) => {
  await page.waitForTimeout(100);
  assert.equal(await editor().count(), 1, `${stage}: expected one direct text editor`);
  assert.equal(await ring().count(), 1, `${stage}: expected one host-anchored edit ring`);
};
const closeEditor = async () => {
  await editor().focus();
  await page.keyboard.press("Escape");
  await editor().waitFor({ state: "detached" });
};
const box = async (locator) => {
  const value = await locator.boundingBox();
  assert(value, "Expected rendered geometry");
  return value;
};
const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(Math.abs(actual[key] - expected[key]) <= 1.5, `${stage}: ${key} differs; host=${expected[key]} ring=${actual[key]}`);
  }
};
const overlapArea = (left, right) => {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
};
const assertNoOverlap = (left, right, stage) => {
  assert.equal(overlapArea(left, right), 0, `${stage}: surfaces overlap`);
};
const assertInspectorDoesNotBlock = async (hostBox, stage) => {
  await page.waitForTimeout(50);
  const visibility = await inspector().evaluate((element) => getComputedStyle(element).visibility);
  assert.notEqual(visibility, "hidden", `${stage}: unified inspector should stay visible`);
  assertNoOverlap(await box(inspector()), hostBox, stage);
};
const assertInspectorStableAfterPointerMoves = async (stage) => {
  await page.waitForTimeout(60);
  const initial = await box(inspector());
  const initialPlacement = await inspector().getAttribute("data-mesurer-text-inspector-placement");
  const viewport = page.viewportSize();
  assert(viewport, `${stage}: expected fixed viewport`);
  const points = [
    [12, 12],
    [Math.max(12, viewport.width - 12), 12],
    [Math.max(12, viewport.width - 12), Math.max(12, viewport.height - 12)],
    [12, Math.max(12, viewport.height - 12)],
  ];
  for (const [x, y] of points) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(40);
    const current = await box(inspector());
    assert(Math.abs(current.x - initial.x) <= 1.5, `${stage}: pointer movement changed inspector x from ${initial.x} to ${current.x}`);
    assert(Math.abs(current.y - initial.y) <= 1.5, `${stage}: pointer movement changed inspector y from ${initial.y} to ${current.y}`);
    assert.equal(
      await inspector().getAttribute("data-mesurer-text-inspector-placement"),
      initialPlacement,
      `${stage}: pointer movement changed inspector placement lane`,
    );
  }
};
const assertUnifiedInspector = async (stage) => {
  assert.equal(await inspector().getAttribute("data-mesurer-text-inspector-unified"), "true", `${stage}: expected unified typography editor`);
  const sourceToolbar = page.locator("[data-mesurer-text-style-toolbar='true']");
  assert.equal(await sourceToolbar.evaluate((element) => getComputedStyle(element).display), "none", `${stage}: legacy text toolbar should not render`);
  for (const selector of [
    "[data-mesurer-text-style-select='font']",
    "[data-mesurer-text-style-select='size']",
    "[data-mesurer-text-style-select='weight']",
    "[data-mesurer-text-style-input='line']",
    "[data-mesurer-text-style-input='tracking']",
    "[data-mesurer-text-style-button='bold']",
    "[data-mesurer-text-style-button='italic']",
    "[data-mesurer-text-style-button='underline']",
    "[data-mesurer-text-color-swatches='true']",
    "[data-mesurer-text-style-menu-button='true']",
  ]) {
    assert.equal(await inspector().locator(selector).count(), 1, `${stage}: missing unified control ${selector}`);
  }
  const family = inspector().locator("[data-mesurer-text-style-select='font']");
  assert.equal(await family.evaluate((element) => getComputedStyle(element).appearance), "none", `${stage}: Family source control should keep native chrome disabled`);
  assert.equal(await family.evaluate((element) => getComputedStyle(element).opacity), "0", `${stage}: native Family select should be an invisible state bridge`);
  assert.equal(
    await family.locator("..").getAttribute("data-mesurer-unified-select-shell"),
    "true",
    `${stage}: Family should be wrapped by the Mesurer select shell`,
  );
  assert.equal(
    await family.locator("..").locator("[data-mesurer-unified-select-chevron='true']").count(),
    1,
    `${stage}: custom select shell should render one Mesurer chevron`,
  );
  for (const kind of ["font", "size", "weight", "style"]) {
    const trigger = inspector().locator(`[data-mesurer-unified-select-trigger='${kind}']`);
    assert.equal(await trigger.count(), 1, `${stage}: missing full-width Mesurer ${kind} dropdown trigger`);
    assert.equal(await trigger.getAttribute("aria-haspopup"), "listbox", `${stage}: ${kind} dropdown should expose listbox semantics`);
  }
};
const openDropdownFromChevronEdge = async (kind, stage) => {
  const trigger = inspector().locator(`[data-mesurer-unified-select-trigger='${kind}']`);
  const triggerBox = await box(trigger);
  await page.mouse.click(triggerBox.x + triggerBox.width - 4, triggerBox.y + triggerBox.height / 2);
  const popup = page.locator(`[data-mesurer-unified-select-popup='true'][data-mesurer-unified-select-kind='${kind}']`);
  await popup.waitFor({ state: "visible" });
  assert(await popup.locator("[data-mesurer-unified-select-option]").count() > 0, `${stage}: expected custom ${kind} options`);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true", `${stage}: ${kind} trigger should expose open state`);
  return popup;
};
const assertInitialSelection = async (stage) => {
  assert(await selection().count() > 0, `${stage}: expected selected-text highlight on entry`);
  assert.equal(await caret().count(), 0, `${stage}: caret should not render while text is selected`);
};
const assertSelectionCleared = async (stage) => {
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-selection-highlight='true']").length === 0);
  assert.equal(await selection().count(), 0, `${stage}: selection highlight should clear after replacement input`);
};
const assertCaretVisible = async (stage) => {
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-caret='true']").length === 1);
  const caretBox = await box(caret());
  assert(caretBox.width > 0 && caretBox.height > 0, `${stage}: expected visible caret geometry`);
  assert(await caret().evaluate((element) => element.getAnimations().length > 0), `${stage}: expected blinking caret animation`);
};
const replaceSelection = async (value) => {
  await editor().evaluate((element, nextValue) => {
    element.value = nextValue;
    element.setSelectionRange(nextValue.length, nextValue.length);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const primary = page.locator(".primary-action");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const primaryBox = await box(primary);
  await page.mouse.click(primaryBox.x + primaryBox.width / 2, primaryBox.y + primaryBox.height / 2);
  await page.mouse.dblclick(primaryBox.x + primaryBox.width / 2, primaryBox.y + primaryBox.height / 2);
  await waitForEditor("primary");
  assert.equal(await editor().evaluate((element) => getComputedStyle(element).opacity), "0", "primary: textarea should be visually transparent");
  assertSameBox(await box(ring()), primaryBox, "primary");
  await assertInitialSelection("primary");
  await closeEditor();

  const slim = page.locator(".feature-copy .kicker");
  const slimBox = await box(slim);
  const slimBaseline = await slim.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
    };
  });
  await page.mouse.dblclick(slimBox.x + slimBox.width / 2, slimBox.y + slimBox.height / 2);
  await waitForEditor("slim");
  assert.equal(await slim.evaluate((element) => getComputedStyle(element).backgroundColor), slimBaseline.background, "slim: host background changed on edit");
  assertSameBox(await box(ring()), slimBox, "slim");
  await assertInitialSelection("slim");
  await assertUnifiedInspector("slim");
  await assertInspectorStableAfterPointerMoves("slim");
  for (const kind of ["font", "size", "weight"]) {
    const popup = await openDropdownFromChevronEdge(kind, `slim ${kind}`);
    const popupChrome = await popup.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, background: style.backgroundColor, role: element.getAttribute("role") };
    });
    assert.equal(popupChrome.radius, "8px", `slim ${kind}: custom menu should use Mesurer rounding`);
    assert.equal(popupChrome.role, "listbox", `slim ${kind}: custom menu should use listbox semantics`);
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "detached" });
  }

  const stylePopup = await openDropdownFromChevronEdge("style", "slim style");
  assert.equal(await inspector().locator("[data-mesurer-unified-text-presets='true']").count(), 0, "slim style: old expanding preset panel should be gone");
  const heading2 = stylePopup.locator("[data-mesurer-unified-select-option='heading-2']");
  if (await heading2.count()) await heading2.click();
  else {
    await page.keyboard.press("Escape");
    await stylePopup.waitFor({ state: "detached" });
  }

  const lineInput = inspector().locator("[data-mesurer-text-style-input='line']");
  await lineInput.fill("30px");
  await lineInput.press("Enter");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".feature-copy .kicker")).lineHeight === "30px");
  const trackingInput = inspector().locator("[data-mesurer-text-style-input='tracking']");
  await trackingInput.fill("1px");
  await trackingInput.press("Enter");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".feature-copy .kicker")).letterSpacing === "1px");
  await replaceSelection("Selection target updated");
  await assertSelectionCleared("slim");
  await assertCaretVisible("slim");
  await closeEditor();
  assert.equal(await slim.evaluate((element) => getComputedStyle(element).lineHeight), slimBaseline.lineHeight, "slim: Escape should restore the pre-edit line height");
  assert.equal(await slim.evaluate((element) => getComputedStyle(element).letterSpacing), slimBaseline.letterSpacing, "slim: Escape should restore the pre-edit tracking");

  await page.setViewportSize({ width: 1280, height: 520 });
  const mixed = page.locator(".feature-copy > p:not(.kicker)").first();
  await mixed.evaluate((element) => {
    const targetTop = 140;
    window.scrollTo({
      top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - targetTop),
      behavior: "instant",
    });
  });
  await page.waitForTimeout(50);

  const mixedState = await mixed.evaluate((element) => {
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node instanceof Text && Boolean(node.nodeValue?.trim()));
    if (directTextNodes.length !== 2) throw new Error("Expected two direct text runs around the shortcut badge");

    const pointFor = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      if (!rect) throw new Error("Expected direct text geometry");
      return {
        x: rect.left + Math.min(24, rect.width / 2),
        y: rect.top + rect.height / 2,
      };
    };

    const host = element.getBoundingClientRect();
    return {
      html: element.innerHTML,
      leadingPoint: pointFor(directTextNodes[0]),
      trailingPoint: pointFor(directTextNodes[1]),
      box: { x: host.x, y: host.y, width: host.width, height: host.height },
    };
  });

  await page.mouse.dblclick(mixedState.leadingPoint.x, mixedState.leadingPoint.y);
  await waitForEditor("mixed-leading");
  assert.equal(await editor().inputValue(), "Select one or more elements, then use Arrange or", "mixed-leading: wrong direct text run selected");
  assertSameBox(await box(ring()), mixedState.box, "mixed-leading");
  await assertInitialSelection("mixed-leading");
  await assertInspectorDoesNotBlock(mixedState.box, "mixed-leading inspector/field");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-leading: shortcut badge changed");
  await replaceSelection("Updated leading copy");
  await assertSelectionCleared("mixed-leading");
  await assertCaretVisible("mixed-leading");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-leading: typing flattened shortcut badge");
  await closeEditor();
  assert.equal(await mixed.evaluate((element) => element.innerHTML), mixedState.html, "mixed-leading: Escape did not restore mixed inline content");

  const trailingState = await mixed.evaluate((element) => {
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node instanceof Text && Boolean(node.nodeValue?.trim()));
    const trailing = directTextNodes[1];
    if (!(trailing instanceof Text)) throw new Error("Expected trailing direct text run");
    const range = document.createRange();
    range.selectNodeContents(trailing);
    const rect = range.getClientRects()[0];
    const host = element.getBoundingClientRect();
    if (!rect) throw new Error("Expected trailing text geometry");
    return {
      point: { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + rect.height / 2 },
      box: { x: host.x, y: host.y, width: host.width, height: host.height },
    };
  });
  await page.mouse.dblclick(trailingState.point.x, trailingState.point.y);
  await waitForEditor("mixed-trailing");
  assert.equal(await editor().inputValue(), "to drag them into the layout you want.", "mixed-trailing: wrong direct text run selected");
  assertSameBox(await box(ring()), trailingState.box, "mixed-trailing");
  await assertInitialSelection("mixed-trailing");
  await assertInspectorDoesNotBlock(trailingState.box, "mixed-trailing inspector/field");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-trailing: shortcut badge changed");
  await replaceSelection("Updated trailing copy");
  await assertSelectionCleared("mixed-trailing");
  await assertCaretVisible("mixed-trailing");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-trailing: typing flattened shortcut badge");
  await closeEditor();
  assert.equal(await mixed.evaluate((element) => element.innerHTML), mixedState.html, "mixed-trailing: Escape did not restore mixed inline content");

  // Reproduce the edge-of-page card from the manual acceptance screenshot.
  // The unified editor must remain visible and use an available lane instead
  // of covering the text or disappearing below the viewport.
  await page.setViewportSize({ width: 700, height: 220 });
  const edge = page.locator(".warm-card p");
  await edge.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(50);
  const edgeState = await edge.evaluate((element) => {
    const runs = Array.from(element.childNodes)
      .filter((node) => node instanceof Text && Boolean(node.nodeValue?.trim()));
    const trailing = runs[runs.length - 1];
    if (!(trailing instanceof Text)) throw new Error("Expected trailing Guides + rulers text run");
    const range = document.createRange();
    range.selectNodeContents(trailing);
    const rects = Array.from(range.getClientRects());
    const rect = rects[rects.length - 1];
    const host = element.getBoundingClientRect();
    if (!rect) throw new Error("Expected edge text geometry");
    return {
      point: { x: rect.left + Math.min(18, rect.width / 2), y: rect.top + rect.height / 2 },
      box: { x: host.x, y: host.y, width: host.width, height: host.height },
    };
  });
  await page.mouse.dblclick(edgeState.point.x, edgeState.point.y);
  await waitForEditor("edge");
  await assertInspectorDoesNotBlock(edgeState.box, "edge inspector/field");
  await assertUnifiedInspector("edge");
  const edgeInspectorBox = await box(inspector());
  const edgeInspectorDebug = await inspector().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const shell = element.parentElement;
    const shellRect = shell?.getBoundingClientRect();
    const shellStyle = shell ? getComputedStyle(shell) : null;
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
      placement: element.getAttribute("data-mesurer-text-inspector-placement"),
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      shell: shellRect ? {
        x: shellRect.x,
        y: shellRect.y,
        width: shellRect.width,
        height: shellRect.height,
        position: shellStyle?.position ?? null,
        anchor: shell?.getAttribute("data-mesurer-native-scroll-anchor") ?? null,
        owner: shell?.getAttribute("data-mesurer-native-scroll-owner") ?? null,
        anchorX: shell?.style.getPropertyValue("--mesurer-native-anchor-x") ?? "",
        anchorY: shell?.style.getPropertyValue("--mesurer-native-anchor-y") ?? "",
      } : null,
    };
  });
  assert(
    edgeInspectorBox.y >= 0 && edgeInspectorBox.y + edgeInspectorBox.height <= 220,
    `edge: unified inspector should stay inside viewport: ${JSON.stringify(edgeInspectorDebug)}`,
  );
  await assertInspectorStableAfterPointerMoves("edge");
  await replaceSelection("Updated edge copy");
  await assertSelectionCleared("edge");
  await assertCaretVisible("edge");
  await closeEditor();

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Host-anchored editing + full-hit Mesurer dropdowns + stable Typography inspector + visible caret + mixed-inline text runs: PASS");
} finally {
  await browser.close();
}
