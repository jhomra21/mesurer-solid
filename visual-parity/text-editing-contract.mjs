import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TEXT_EDITING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const arrangeTarget = page.locator(".type-card");
  const target = page.locator(".tracked-text");
  const reference = page.locator(".type-card h2");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await arrangeTarget.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  await reference.waitFor({ state: "visible" });

  const before = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      decoration: style.textDecorationLine,
    };
  });
  const referenceStyle = await reference.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
    };
  });

  const arrangeTargetBox = await arrangeTarget.boundingBox();
  const targetBox = await target.boundingBox();
  assert(arrangeTargetBox, "Text editing Arrange target must have a bounding box");
  assert(targetBox, "Text editing contract target must have a bounding box");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  // Match the already-proven Arrange-first workflow. Select the enclosing typography card
  // through its empty padding so the normal point-selection path resolves the card itself.
  // Then edit the nested paragraph through the active Arrange box. The feature contract is
  // that Mesurer's own move surface must not prevent direct editing of underlying page text.
  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });
  await page.mouse.click(
    arrangeTargetBox.x + arrangeTargetBox.width - 12,
    arrangeTargetBox.y + arrangeTargetBox.height - 12,
  );

  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  await arrangeBox.waitFor({ state: "visible" });
  const arrangedSelection = await arrangeBox.boundingBox();
  assert(arrangedSelection, "Arrange selection box should have rendered geometry");
  assert(
    x >= arrangedSelection.x
      && x <= arrangedSelection.x + arrangedSelection.width
      && y >= arrangedSelection.y
      && y <= arrangedSelection.y + arrangedSelection.height,
    "Nested text should sit underneath the active Arrange interaction surface",
  );
  await page.mouse.dblclick(x, y);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const toolbar = page.locator("[data-mesurer-text-style-toolbar='true']");
  await editor.waitFor({ state: "visible" });
  await toolbar.waitFor({ state: "visible" });

  const editorState = await editor.evaluate((element) => ({
    value: element.value,
    selectionStart: element.selectionStart,
    selectionEnd: element.selectionEnd,
    fontFamily: getComputedStyle(element).fontFamily,
    fontSize: getComputedStyle(element).fontSize,
    fontWeight: getComputedStyle(element).fontWeight,
    color: getComputedStyle(element).color,
  }));
  assert.equal(editorState.value, before.text, "Editor should start with the target's current text");
  assert.equal(editorState.selectionStart, 0, "Direct text editing should select from the first character");
  assert.equal(editorState.selectionEnd, editorState.value.length, "Direct text editing should select the entire current text");
  assert.equal(editorState.fontFamily, before.fontFamily, "Editor should inherit the target font family");
  assert.equal(editorState.fontSize, before.fontSize, "Editor should inherit the target font size");
  assert.equal(editorState.fontWeight, before.fontWeight, "Editor should inherit the target font weight");
  assert.equal(editorState.color, before.color, "Editor should inherit the target text color");

  const familySelect = page.locator("[data-mesurer-text-style-select='font-family']");
  const sizeSelect = page.locator("[data-mesurer-text-style-select='font-size']");
  const weightSelect = page.locator("[data-mesurer-text-style-select='font-weight']");
  const boldButton = page.locator("[data-mesurer-text-style-button='bold']");
  const underlineButton = page.locator("[data-mesurer-text-style-button='underline']");

  const families = await familySelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  const sizes = await sizeSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  const weights = await weightSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  assert(
    families.includes(referenceStyle.fontFamily),
    `Page-derived font list should include ${referenceStyle.fontFamily}: ${JSON.stringify(families)}`,
  );
  assert(
    sizes.includes(referenceStyle.fontSize),
    `Page-derived size list should include ${referenceStyle.fontSize}: ${JSON.stringify(sizes)}`,
  );
  assert(
    weights.includes(referenceStyle.fontWeight),
    `Page-derived weight list should include ${referenceStyle.fontWeight}: ${JSON.stringify(weights)}`,
  );

  await familySelect.selectOption(referenceStyle.fontFamily);
  await weightSelect.selectOption(referenceStyle.fontWeight);
  if (Number.parseInt(referenceStyle.fontWeight, 10) < 600) await boldButton.click();
  await underlineButton.click();

  const colorSwatches = page.locator("[data-mesurer-text-color]");
  const swatchColors = await colorSwatches.evaluateAll((items) => items.map((item) => item.dataset.mesurerTextColor));
  assert(swatchColors.length > 1, "Text styling should expose a quick list of rendered page colors");
  const alternateColor = swatchColors.find((value) => value && value !== before.color);
  assert(alternateColor, `Expected a rendered-page color different from ${before.color}`);
  await page.locator(`[data-mesurer-text-color=${JSON.stringify(alternateColor)}]`).click();

  const desiredText = "Desired copy from Mesurer";
  await editor.fill(desiredText);
  await editor.focus();
  await page.keyboard.press("Enter");
  await editor.waitFor({ state: "detached" });

  const desired = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      color: style.color,
      decoration: style.textDecorationLine,
    };
  });
  assert.equal(desired.text, desiredText, "Committed text should remain as Desired while Select/Arrange is active");
  assert.equal(desired.fontFamily, referenceStyle.fontFamily, "Chosen page font should preview on the real target");
  assert.equal(desired.fontWeight, referenceStyle.fontWeight, "Chosen page weight should preview on the real target");
  assert.equal(desired.color, alternateColor, "Chosen page color should preview on the real target");
  assert(desired.decoration.includes("underline"), "Underline should preview on the real target");

  await arrangeButton.click();
  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontWeight, color, decoration }) => {
    const element = document.querySelector(".tracked-text");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontWeight === fontWeight
      && style.color === color
      && style.textDecorationLine === decoration;
  }, before);

  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontWeight, color }) => {
    const element = document.querySelector(".tracked-text");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontWeight === fontWeight
      && style.color === color
      && style.textDecorationLine.includes("underline");
  }, {
    text: desiredText,
    fontFamily: referenceStyle.fontFamily,
    fontWeight: referenceStyle.fontWeight,
    color: alternateColor,
  });

  assert.equal(pageErrors.length, 0, `Text editing browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Text editing browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange-compatible direct text editing + page-derived style suggestions + reversible Desired state: PASS");
} finally {
  await browser.close();
}