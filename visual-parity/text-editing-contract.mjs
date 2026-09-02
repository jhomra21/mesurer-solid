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
  const target = page.locator(".primary-action");
  const reference = page.locator(".type-card h2");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  await reference.waitFor({ state: "visible" });

  const before = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
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

  const targetBox = await target.boundingBox();
  assert(targetBox, "Text editing contract target must have a bounding box");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  // Reuse the same real Arrange-first selection path covered by arrange-contract.mjs.
  // Once the button is selected, its label sits underneath Mesurer's active Arrange box.
  // Direct text editing must still resolve and edit that underlying page text rather than
  // forcing the user to leave Arrange first.
  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return select instanceof HTMLButtonElement
      && select.getAttribute("aria-pressed") === "true"
      && arrange instanceof HTMLButtonElement
      && arrange.getAttribute("aria-pressed") === "true";
  });
  await page.mouse.click(x, y);

  const arrangeBox = page.locator("[data-mesurer-arrange-box='true']");
  await arrangeBox.waitFor({ state: "visible" });
  const arrangedSelection = await arrangeBox.boundingBox();
  assert(arrangedSelection, "Arrange selection box should have rendered geometry");
  assert(
    x >= arrangedSelection.x
      && x <= arrangedSelection.x + arrangedSelection.width
      && y >= arrangedSelection.y
      && y <= arrangedSelection.y + arrangedSelection.height,
    "Editable text should sit underneath the active Arrange interaction surface",
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
  const italicButton = page.locator("[data-mesurer-text-style-button='italic']");
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
  await sizeSelect.selectOption(referenceStyle.fontSize);
  await weightSelect.selectOption(referenceStyle.fontWeight);

  // Exercise the simple formatting toggles as real reversible controls. Bold is toggled on
  // and back to the selected page weight so the final Desired state keeps that page-derived
  // weight, while Italic and Underline remain as the user's requested Desired styling.
  const numericReferenceWeight = Number.parseInt(referenceStyle.fontWeight, 10);
  const toggledBoldWeight = Number.isFinite(numericReferenceWeight) && numericReferenceWeight >= 600 ? "400" : "700";
  await boldButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    return element instanceof HTMLElement && getComputedStyle(element).fontWeight === expected;
  }, toggledBoldWeight);
  await boldButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    return element instanceof HTMLElement && getComputedStyle(element).fontWeight === expected;
  }, referenceStyle.fontWeight);

  const desiredFontStyle = before.fontStyle === "normal" ? "italic" : "normal";
  await italicButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    return element instanceof HTMLElement && getComputedStyle(element).fontStyle === expected;
  }, desiredFontStyle);

  const desiredUnderline = !before.decoration.includes("underline");
  await underlineButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    return getComputedStyle(element).textDecorationLine.includes("underline") === expected;
  }, desiredUnderline);

  const colorSwatches = page.locator("[data-mesurer-text-color]");
  const swatchColors = await colorSwatches.evaluateAll((items) => items.map((item) => item.dataset.mesurerTextColor));
  assert(swatchColors.length > 1, "Text styling should expose a quick list of rendered page colors");
  const alternateColor = swatchColors.find((value) => value && value !== before.color);
  assert(alternateColor, `Expected a rendered-page color different from ${before.color}`);
  await page.locator(`[data-mesurer-text-color=${JSON.stringify(alternateColor)}]`).click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    return element instanceof HTMLElement && getComputedStyle(element).color === expected;
  }, alternateColor);

  const customHex = "#2a6fdb";
  const customRenderedColor = "rgb(42, 111, 219)";
  await page.locator("[data-mesurer-text-custom-color='true']").evaluate((element, value) => {
    if (!(element instanceof HTMLInputElement)) throw new Error("Expected text custom color input");
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, customHex);
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    return element instanceof HTMLElement && getComputedStyle(element).color === expected;
  }, customRenderedColor);

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
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      color: style.color,
      decoration: style.textDecorationLine,
    };
  });
  assert.equal(desired.text, desiredText, "Committed text should remain as Desired while Select/Arrange is active");
  assert.equal(desired.fontFamily, referenceStyle.fontFamily, "Chosen page font should preview on the real target");
  assert.equal(desired.fontSize, referenceStyle.fontSize, "Chosen page size should preview on the real target");
  assert.equal(desired.fontWeight, referenceStyle.fontWeight, "Chosen page weight should preview on the real target");
  assert.equal(desired.fontStyle, desiredFontStyle, "Italic toggle should preview on the real target");
  assert.equal(desired.color, customRenderedColor, "Custom text color should preview on the real target");
  assert.equal(desired.decoration.includes("underline"), desiredUnderline, "Underline toggle should preview on the real target");

  await arrangeButton.click();
  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontSize, fontWeight, fontStyle, color, decoration }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontSize === fontSize
      && style.fontWeight === fontWeight
      && style.fontStyle === fontStyle
      && style.color === color
      && style.textDecorationLine === decoration;
  }, before);

  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontSize, fontWeight, fontStyle, color, underline }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontSize === fontSize
      && style.fontWeight === fontWeight
      && style.fontStyle === fontStyle
      && style.color === color
      && style.textDecorationLine.includes("underline") === underline;
  }, {
    text: desiredText,
    fontFamily: referenceStyle.fontFamily,
    fontSize: referenceStyle.fontSize,
    fontWeight: referenceStyle.fontWeight,
    fontStyle: desiredFontStyle,
    color: customRenderedColor,
    underline: desiredUnderline,
  });

  assert.equal(pageErrors.length, 0, `Text editing browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Text editing browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange-compatible direct text editing + page-derived styles + B/I/U + custom color + reversible Desired state: PASS");
} finally {
  await browser.close();
}
