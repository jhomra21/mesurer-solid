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
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
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
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      color: style.color,
    };
  });
  const renderedHeadingTags = await page.locator("h1, h2, h3").evaluateAll((elements) =>
    [...new Set(elements.map((element) => element.tagName))]);
  const firstFamily = (families) => (families.split(",")[0] ?? families).trim().replace(/^['"]|['"]$/g, "");

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
  const styleMenuButton = page.locator("[data-mesurer-text-style-menu-button='true']");
  const styleMenu = page.locator("[data-mesurer-text-style-menu='true']");
  const inspectorInfo = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await toolbar.waitFor({ state: "visible" });
  await styleMenuButton.waitFor({ state: "visible" });
  await inspectorInfo.waitFor({ state: "visible" });
  await styleMenu.waitFor({ state: "hidden" });

  const toolbarChrome = await toolbar.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      classes: element.className,
      surface: element.dataset.mesurerTextStyleSurface,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      padding: style.padding,
      gap: style.gap,
      shadow: style.boxShadow,
      controls: element.querySelectorAll(":scope > button").length,
    };
  });
  assert.match(toolbarChrome.classes, /mesurer-toolbar-surface/, "Direct text controls should use the canonical Mesurer toolbar surface");
  assert.equal(toolbarChrome.surface, "toolbar", "Direct text controls should identify themselves as a toolbar-style surface");
  assert.equal(toolbarChrome.background, "rgb(255, 255, 255)", "Direct text toolbar should use Mesurer's white toolbar surface");
  assert.equal(toolbarChrome.borderRadius, "12px", "Direct text toolbar should use the canonical 12px toolbar radius");
  assert.equal(toolbarChrome.padding, "4px", "Direct text toolbar should use the canonical 4px toolbar padding");
  assert.equal(toolbarChrome.gap, "4px", "Direct text toolbar should use the canonical 4px control gap");
  assert.notEqual(toolbarChrome.shadow, "none", "Direct text toolbar should retain Mesurer's floating toolbar shadow");
  assert.equal(toolbarChrome.controls, 4, "The default text toolbar should stay compact: B, I, U, and one Text menu button");

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

  const inspectorText = await inspectorInfo.textContent();
  for (const label of ["Family", "Size", "Weight", "Line", "Tracking"]) {
    assert(inspectorText?.includes(label), `Automatic Text Inspector information should include ${label}`);
  }
  assert(inspectorText?.includes(firstFamily(before.fontFamily)), "Automatic Text Inspector should describe the double-clicked field's font family");
  assert(inspectorText?.includes(before.fontSize), "Automatic Text Inspector should describe the double-clicked field's font size");
  assert(inspectorText?.includes(before.text ?? ""), "Automatic Text Inspector should identify the double-clicked field's text");

  const boldButton = page.locator("[data-mesurer-text-style-button='bold']");
  const italicButton = page.locator("[data-mesurer-text-style-button='italic']");
  const underlineButton = page.locator("[data-mesurer-text-style-button='underline']");
  const buttonChrome = await boldButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: style.width,
      height: style.height,
      borderRadius: style.borderRadius,
      ariaPressed: element.getAttribute("aria-pressed"),
    };
  });
  assert.equal(buttonChrome.width, "32px", "Text formatting buttons should match the toolbar's 32px control size");
  assert.equal(buttonChrome.height, "32px", "Text formatting buttons should match the toolbar's 32px control size");
  assert.equal(buttonChrome.borderRadius, "8px", "Text formatting buttons should match Mesurer toolbar button rounding");
  assert(["true", "false"].includes(buttonChrome.ariaPressed), "Formatting buttons should expose pressed state");

  await styleMenuButton.click();
  await styleMenu.waitFor({ state: "visible" });
  assert.equal(await styleMenuButton.getAttribute("aria-expanded"), "true", "Text menu button should expose its open state");

  const menuChrome = await styleMenu.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      shadow: style.boxShadow,
      width: style.width,
    };
  });
  assert.equal(menuChrome.background, "rgb(255, 255, 255)", "Text style menu should use Mesurer's white floating surface");
  assert.equal(menuChrome.borderRadius, "12px", "Text style menu should use the canonical 12px radius");
  assert.notEqual(menuChrome.shadow, "none", "Text style menu should retain the floating Mesurer shadow");
  assert.equal(menuChrome.width, "288px", "Text style menu should stay compact rather than expanding the toolbar");

  const textPreset = page.locator("[data-mesurer-text-style-preset='text']");
  const heading2Preset = page.locator("[data-mesurer-text-style-preset='heading-2']");
  await textPreset.waitFor({ state: "visible" });
  await heading2Preset.waitFor({ state: "visible" });
  for (const level of [1, 2, 3]) {
    const expected = renderedHeadingTags.includes(`H${level}`) ? 1 : 0;
    const count = await page.locator(`[data-mesurer-text-style-preset='heading-${level}']`).count();
    assert.equal(count, expected, `Heading ${level} preset availability should match rendered H${level} usage on the page`);
  }
  assert((await textPreset.textContent())?.includes("0"), "Text preset should advertise its keyboard shortcut");
  assert((await heading2Preset.textContent())?.includes("2"), "Heading 2 preset should advertise its keyboard shortcut");

  await heading2Preset.click();
  await styleMenu.waitFor({ state: "hidden" });
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.fontFamily === expected.fontFamily
      && style.fontSize === expected.fontSize
      && style.fontWeight === expected.fontWeight
      && style.fontStyle === expected.fontStyle
      && style.lineHeight === expected.lineHeight
      && style.letterSpacing === expected.letterSpacing
      && style.textTransform === expected.textTransform
      && style.color === expected.color;
  }, referenceStyle);

  await page.waitForFunction(({ family, size, weight }) => {
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    if (!(card instanceof HTMLElement)) return false;
    const text = card.textContent ?? "";
    const first = (family.split(",")[0] ?? family).trim().replace(/^['"]|['"]$/g, "");
    return text.includes(first) && text.includes(size) && text.includes(weight);
  }, {
    family: referenceStyle.fontFamily,
    size: referenceStyle.fontSize,
    weight: referenceStyle.fontWeight,
  });

  await styleMenuButton.click();
  await styleMenu.waitFor({ state: "visible" });
  const familySelect = page.locator("[data-mesurer-text-style-select='font']");
  const sizeSelect = page.locator("[data-mesurer-text-style-select='size']");
  const weightSelect = page.locator("[data-mesurer-text-style-select='weight']");
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

  const desiredFontStyle = referenceStyle.fontStyle === "normal" ? "italic" : "normal";
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
  assert(swatchColors.length > 1, "Text styling should expose a quick list of rendered page colors inside the Text menu");
  const alternateColor = swatchColors.find((value) => value && value !== referenceStyle.color);
  assert(alternateColor, `Expected a rendered-page color different from ${referenceStyle.color}`);
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
  await page.waitForFunction((expected) => {
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    return card instanceof HTMLElement && (card.textContent ?? "").includes(expected);
  }, desiredText);
  await editor.focus();
  await page.keyboard.press("Enter");
  await editor.waitFor({ state: "detached" });
  await styleMenu.waitFor({ state: "detached" });
  await inspectorInfo.waitFor({ state: "detached" });

  const desired = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textTransform: style.textTransform,
      color: style.color,
      decoration: style.textDecorationLine,
    };
  });
  assert.equal(desired.text, desiredText, "Committed text should remain as Desired while Select/Arrange is active");
  assert.equal(desired.fontFamily, referenceStyle.fontFamily, "Chosen heading/page font should preview on the real target");
  assert.equal(desired.fontSize, referenceStyle.fontSize, "Chosen heading/page size should preview on the real target");
  assert.equal(desired.fontWeight, referenceStyle.fontWeight, "Chosen heading/page weight should preview on the real target");
  assert.equal(desired.fontStyle, desiredFontStyle, "Italic toggle should preview on the real target");
  assert.equal(desired.lineHeight, referenceStyle.lineHeight, "Heading preset should carry the page-derived line height");
  assert.equal(desired.letterSpacing, referenceStyle.letterSpacing, "Heading preset should carry the page-derived tracking");
  assert.equal(desired.textTransform, referenceStyle.textTransform, "Heading preset should carry the page-derived text transform");
  assert.equal(desired.color, customRenderedColor, "Custom text color should preview on the real target");
  assert.equal(desired.decoration.includes("underline"), desiredUnderline, "Underline toggle should preview on the real target");

  await arrangeButton.click();
  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textTransform, color, decoration }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontSize === fontSize
      && style.fontWeight === fontWeight
      && style.fontStyle === fontStyle
      && style.lineHeight === lineHeight
      && style.letterSpacing === letterSpacing
      && style.textTransform === textTransform
      && style.color === color
      && style.textDecorationLine === decoration;
  }, before);

  await selectButton.click();
  await page.waitForFunction(({ text, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textTransform, color, underline }) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === text
      && style.fontFamily === fontFamily
      && style.fontSize === fontSize
      && style.fontWeight === fontWeight
      && style.fontStyle === fontStyle
      && style.lineHeight === lineHeight
      && style.letterSpacing === letterSpacing
      && style.textTransform === textTransform
      && style.color === color
      && style.textDecorationLine.includes("underline") === underline;
  }, {
    text: desiredText,
    fontFamily: referenceStyle.fontFamily,
    fontSize: referenceStyle.fontSize,
    fontWeight: referenceStyle.fontWeight,
    fontStyle: desiredFontStyle,
    lineHeight: referenceStyle.lineHeight,
    letterSpacing: referenceStyle.letterSpacing,
    textTransform: referenceStyle.textTransform,
    color: customRenderedColor,
    underline: desiredUnderline,
  });

  assert.equal(pageErrors.length, 0, `Text editing browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Text editing browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Arrange-compatible direct text editing + compact Text menu + page-derived heading presets + Mesurer toolbar UI + automatic Text Inspector + B/I/U + custom color + reversible Desired state: PASS");
} finally {
  await browser.close();
}