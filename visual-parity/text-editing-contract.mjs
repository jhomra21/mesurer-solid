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

const firstFamily = (families) => (families.split(",")[0] ?? families).trim().replace(/^['"]|['"]$/g, "");
const computedTypography = (element) => {
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
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const selectButton = page.locator("[data-mesurer-builtin='select'] button");
  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  const variantReference = page.locator(".type-card h2");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });
  await variantReference.waitFor({ state: "visible" });

  const before = await target.evaluate(computedTypography);
  const variantStyle = await variantReference.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
    };
  });
  const dominantHeading2Style = await page.locator("h2").evaluateAll((elements) => {
    const variants = new Map();
    for (const element of elements) {
      const hasDirectText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()),
      );
      if (!hasDirectText) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const snapshot = {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        color: style.color,
      };
      const signature = JSON.stringify(snapshot);
      const current = variants.get(signature);
      if (current) current.count += 1;
      else variants.set(signature, { count: 1, snapshot });
    }
    const dominant = [...variants.entries()]
      .sort(([leftSignature, left], [rightSignature, right]) =>
        right.count - left.count || leftSignature.localeCompare(rightSignature))[0]?.[1];
    if (!dominant) throw new Error("Expected at least one visible direct-text H2 for the Heading 2 preset contract");
    return dominant.snapshot;
  });
  const renderedHeadingTags = await page.locator("h1, h2, h3").evaluateAll((elements) =>
    [...new Set(elements
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && Array.from(element.childNodes).some(
            (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()),
          );
      })
      .map((element) => element.tagName))]);

  const targetBox = await target.boundingBox();
  assert(targetBox, "Text editing contract target must have a bounding box");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  // Keep the Arrange-first interaction path: direct editing must still reach
  // the underlying page text while Arrange owns the selected element.
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
  await page.mouse.dblclick(x, y);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const sourceToolbar = page.locator("[data-mesurer-text-style-toolbar='true']");
  const sourceMenu = page.locator("[data-mesurer-text-style-menu='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "attached" });
  await inspector.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-mesurer-text-inspector-info='true']")?.getAttribute("data-mesurer-text-inspector-unified") === "true");

  assert.equal(await inspector.getAttribute("aria-label"), "Typography editor", "Direct editing should expose one interactive Typography editor");
  assert.equal(await inspector.getAttribute("data-mesurer-text-inspector-unified"), "true", "Typography details and editing controls should be unified");
  assert.equal(await sourceToolbar.evaluate((element) => getComputedStyle(element).display), "none", "Legacy floating text toolbar should be hidden");
  assert.equal(await sourceMenu.evaluate((element) => getComputedStyle(element).display), "none", "Legacy floating text menu should be hidden");

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

  for (const label of ["Family", "Size", "Weight", "Line", "Tracking", "Format", "Color", "Style"]) {
    assert((await inspector.textContent())?.includes(label), `Unified Typography editor should include ${label}`);
  }

  const familySelect = inspector.locator("[data-mesurer-text-style-select='font']");
  const sizeSelect = inspector.locator("[data-mesurer-text-style-select='size']");
  const weightSelect = inspector.locator("[data-mesurer-text-style-select='weight']");
  const familyTrigger = inspector.locator("[data-mesurer-unified-select-trigger='font']");
  const sizeTrigger = inspector.locator("[data-mesurer-unified-select-trigger='size']");
  const weightTrigger = inspector.locator("[data-mesurer-unified-select-trigger='weight']");
  const lineInput = inspector.locator("[data-mesurer-text-style-input='line']");
  const trackingInput = inspector.locator("[data-mesurer-text-style-input='tracking']");
  const boldButton = inspector.locator("[data-mesurer-text-style-button='bold']");
  const italicButton = inspector.locator("[data-mesurer-text-style-button='italic']");
  const underlineButton = inspector.locator("[data-mesurer-text-style-button='underline']");
  const colorSwatches = inspector.locator("[data-mesurer-text-color]");
  const customColor = inspector.locator("[data-mesurer-text-custom-color='true']");
  const styleButton = inspector.locator("[data-mesurer-text-style-menu-button='true']");

  for (const control of [familySelect, sizeSelect, weightSelect, familyTrigger, sizeTrigger, weightTrigger, lineInput, trackingInput, boldButton, italicButton, underlineButton, customColor, styleButton]) {
    assert.equal(await control.count(), 1, "Unified Typography editor should contain each editing control exactly once");
  }
  assert.equal(await familySelect.inputValue(), before.fontFamily, "Family source select should mirror the live font family");
  assert.equal(await sizeSelect.inputValue(), before.fontSize, "Size source select should mirror the live font size");
  assert.equal(await weightSelect.inputValue(), before.fontWeight, "Weight source select should mirror the live font weight");
  assert.equal(await lineInput.inputValue(), before.lineHeight, "Line row should become the live line-height input");
  assert.equal(await trackingInput.inputValue(), before.letterSpacing, "Tracking row should become the live letter-spacing input");

  const buttonChrome = await boldButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.width, height: style.height, borderRadius: style.borderRadius, pressed: element.getAttribute("aria-pressed") };
  });
  assert.equal(buttonChrome.width, "28px", "In-card formatting controls should use the compact inspector size");
  assert.equal(buttonChrome.height, "28px", "In-card formatting controls should use the compact inspector size");
  assert.equal(buttonChrome.borderRadius, "5px", "In-card formatting controls should use Mesurer control rounding");
  assert(["true", "false"].includes(buttonChrome.pressed), "Formatting buttons should expose pressed state");

  const families = await familySelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  const sizes = await sizeSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  const weights = await weightSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  assert(families.includes(variantStyle.fontFamily), `Page font variant should remain available: ${variantStyle.fontFamily}`);
  assert(sizes.includes(variantStyle.fontSize), `Page size variant should remain available: ${variantStyle.fontSize}`);
  assert(weights.includes(variantStyle.fontWeight), `Page weight variant should remain available: ${variantStyle.fontWeight}`);

  const chooseDropdownValue = async (kind, label) => {
    const trigger = inspector.locator(`[data-mesurer-unified-select-trigger='${kind}']`);
    const triggerBox = await trigger.boundingBox();
    assert(triggerBox, `${kind}: expected custom dropdown geometry`);
    // Click the chevron-side edge rather than the text. The whole field must be interactive.
    await page.mouse.click(triggerBox.x + triggerBox.width - 4, triggerBox.y + triggerBox.height / 2);
    const popup = page.locator(`[data-mesurer-unified-select-popup='true'][data-mesurer-unified-select-kind='${kind}']`);
    await popup.waitFor({ state: "visible" });
    const option = popup.getByRole("option", { name: label, exact: true });
    await option.waitFor({ state: "visible" });
    await option.click();
    await popup.waitFor({ state: "detached" });
  };

  // Semantic presets use the same Mesurer dropdown primitive instead of expanding
  // a second layout inside the Typography card.
  const styleBox = await styleButton.boundingBox();
  assert(styleBox, "Style: expected custom dropdown geometry");
  await page.mouse.click(styleBox.x + styleBox.width - 4, styleBox.y + styleBox.height / 2);
  const presetPopup = page.locator("[data-mesurer-unified-select-popup='true'][data-mesurer-unified-select-kind='style']");
  await presetPopup.waitFor({ state: "visible" });
  assert.equal(await sourceMenu.evaluate((element) => getComputedStyle(element).display), "none", "Custom Style dropdown should not restore the legacy menu");
  assert.equal(await inspector.locator("[data-mesurer-unified-text-presets='true']").count(), 0, "Style should not expand a second panel inside the inspector");
  for (const level of [1, 2, 3]) {
    const expected = renderedHeadingTags.includes(`H${level}`) ? 1 : 0;
    const count = await presetPopup.locator(`[data-mesurer-unified-select-option='heading-${level}']`).count();
    assert.equal(count, expected, `Heading ${level} preset availability should match rendered H${level} usage`);
  }
  const heading2Preset = presetPopup.locator("[data-mesurer-unified-select-option='heading-2']");
  await heading2Preset.waitFor({ state: "visible" });
  await heading2Preset.click();
  await presetPopup.waitFor({ state: "detached" });

  const presetApplied = await target.evaluate(computedTypography);
  for (const property of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "textTransform", "color"]) {
    assert.equal(presetApplied[property], dominantHeading2Style[property], `Heading 2 preset should apply dominant rendered ${property}`);
  }

  // Exercise the actual user-facing dropdowns; native selects remain only as state bridges.
  await chooseDropdownValue("font", variantStyle.fontFamily);
  await chooseDropdownValue("size", variantStyle.fontSize);
  await chooseDropdownValue("weight", variantStyle.fontWeight);

  const desiredLineHeight = "31px";
  const desiredTracking = "1px";
  await lineInput.fill(desiredLineHeight);
  await lineInput.press("Enter");
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).lineHeight === expected, desiredLineHeight);
  await trackingInput.fill(desiredTracking);
  await trackingInput.press("Enter");
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).letterSpacing === expected, desiredTracking);

  const numericVariantWeight = Number.parseInt(variantStyle.fontWeight, 10);
  const toggledBoldWeight = Number.isFinite(numericVariantWeight) && numericVariantWeight >= 600 ? "400" : "700";
  await boldButton.click();
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).fontWeight === expected, toggledBoldWeight);
  await boldButton.click();
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).fontWeight === expected, variantStyle.fontWeight);

  const desiredFontStyle = dominantHeading2Style.fontStyle === "normal" ? "italic" : "normal";
  await italicButton.click();
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).fontStyle === expected, desiredFontStyle);

  const desiredUnderline = !before.decoration.includes("underline");
  await underlineButton.click();
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).textDecorationLine.includes("underline") === expected, desiredUnderline);

  const swatchColors = await colorSwatches.evaluateAll((items) => items.map((item) => item.dataset.mesurerTextColor));
  assert(swatchColors.length > 1, "Unified Typography editor should expose rendered page colors");
  assert(swatchColors.includes(variantStyle.color), `Page color variant should remain available: ${variantStyle.color}`);

  const customHex = "#2a6fdb";
  const customRenderedColor = "rgb(42, 111, 219)";
  await customColor.evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, customHex);
  await page.waitForFunction((expected) => getComputedStyle(document.querySelector(".primary-action")).color === expected, customRenderedColor);

  const desiredText = "Desired copy from Mesurer";
  await editor.fill(desiredText);
  await page.waitForFunction((expected) => document.querySelector(".primary-action")?.textContent === expected, desiredText);
  await editor.focus();
  await page.keyboard.press("Enter");
  await editor.waitFor({ state: "detached" });
  await inspector.waitFor({ state: "detached" });

  const desired = await target.evaluate(computedTypography);
  assert.equal(desired.text, desiredText, "Committed text should remain as Desired while Select/Arrange is active");
  assert.equal(desired.fontFamily, variantStyle.fontFamily, "Chosen page font variant should preview on the real target");
  assert.equal(desired.fontSize, variantStyle.fontSize, "Chosen page size variant should preview on the real target");
  assert.equal(desired.fontWeight, variantStyle.fontWeight, "Chosen page weight variant should preview on the real target");
  assert.equal(desired.fontStyle, desiredFontStyle, "Italic toggle should preview on the real target");
  assert.equal(desired.lineHeight, desiredLineHeight, "Editable Line row should preview on the real target");
  assert.equal(desired.letterSpacing, desiredTracking, "Editable Tracking row should preview on the real target");
  assert.equal(desired.textTransform, dominantHeading2Style.textTransform, "Heading preset should carry the page-derived text transform");
  assert.equal(desired.color, customRenderedColor, "Custom text color should preview on the real target");
  assert.equal(desired.decoration.includes("underline"), desiredUnderline, "Underline toggle should preview on the real target");

  // Deactivating editing restores Live; returning to Select reapplies Desired.
  await arrangeButton.click();
  await selectButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === expected.text
      && style.fontFamily === expected.fontFamily
      && style.fontSize === expected.fontSize
      && style.fontWeight === expected.fontWeight
      && style.fontStyle === expected.fontStyle
      && style.lineHeight === expected.lineHeight
      && style.letterSpacing === expected.letterSpacing
      && style.textTransform === expected.textTransform
      && style.color === expected.color
      && style.textDecorationLine === expected.decoration;
  }, before);

  await selectButton.click();
  await page.waitForFunction((expected) => {
    const element = document.querySelector(".primary-action");
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return element.textContent === expected.text
      && style.fontFamily === expected.fontFamily
      && style.fontSize === expected.fontSize
      && style.fontWeight === expected.fontWeight
      && style.fontStyle === expected.fontStyle
      && style.lineHeight === expected.lineHeight
      && style.letterSpacing === expected.letterSpacing
      && style.textTransform === expected.textTransform
      && style.color === expected.color
      && style.textDecorationLine.includes("underline") === expected.underline;
  }, {
    text: desiredText,
    fontFamily: variantStyle.fontFamily,
    fontSize: variantStyle.fontSize,
    fontWeight: variantStyle.fontWeight,
    fontStyle: desiredFontStyle,
    lineHeight: desiredLineHeight,
    letterSpacing: desiredTracking,
    textTransform: dominantHeading2Style.textTransform,
    color: customRenderedColor,
    underline: desiredUnderline,
  });

  assert.equal(pageErrors.length, 0, `Text editing browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Text editing browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log(`Arrange-compatible direct text editing + one interactive Typography inspector + full-hit Mesurer dropdowns + editable Line/Tracking + B/I/U + color + reversible Desired state: PASS (${firstFamily(before.fontFamily)})`);
} finally {
  await browser.close();
}
