import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_EDITING_URL ?? "http://127.0.0.1:4174/";
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
  const typographyButton = page.locator("button[data-mesurer-builtin='text-inspector']");
  const target = page.locator(".primary-action");

  await selectButton.waitFor({ state: "visible" });
  await arrangeButton.waitFor({ state: "visible" });
  await typographyButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });

  assert.equal(await typographyButton.getAttribute("aria-label"), "Typography (A)", "The user-facing text inspection tool should be named Typography");
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "false", "Typography should start inactive");

  const targetBox = await target.boundingBox();
  assert(targetBox, "Typography layout target must have rendered geometry");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

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
  await page.locator("[data-mesurer-arrange-box='true']").waitFor({ state: "visible" });
  await page.mouse.dblclick(x, y);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const toolbar = page.locator("[data-mesurer-text-style-toolbar='true']");
  const menuButton = page.locator("[data-mesurer-text-style-menu-button='true']");
  const menu = page.locator("[data-mesurer-text-style-menu='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await toolbar.waitFor({ state: "visible" });
  await menuButton.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });
  await menu.waitFor({ state: "hidden" });

  const contextualState = await page.evaluate(() => {
    const root = document.querySelector("[data-mesurer-root='true']");
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    const typography = document.querySelector("button[data-mesurer-builtin='text-inspector']");
    return {
      rootContext: root?.getAttribute("data-mesurer-typography-context-active"),
      selectPressed: select?.getAttribute("aria-pressed"),
      arrangePressed: arrange?.getAttribute("aria-pressed"),
      typographyPressed: typography?.getAttribute("aria-pressed"),
      typographyDisabled: typography instanceof HTMLButtonElement ? typography.disabled : null,
    };
  });
  assert.equal(contextualState.rootContext, "true", "Double-click editing should expose an active Typography context");
  assert.equal(contextualState.selectPressed, "true", "Contextual Typography must not steal Select mode");
  assert.equal(contextualState.arrangePressed, "true", "Contextual Typography must not deactivate Arrange");
  assert.equal(contextualState.typographyPressed, "true", "Typography should visibly activate for the direct-edit session");
  assert.equal(contextualState.typographyDisabled, true, "Arrange should still reserve the explicit Typography tool switch while contextual Typography is active");
  assert.equal(await inspector.getAttribute("aria-label"), "Typography details", "The automatic field card should use Typography terminology");

  const layout = await toolbar.evaluate((element) => {
    const directChildren = Array.from(element.children);
    const direct = (candidate) => candidate instanceof HTMLElement && candidate.parentElement === element;
    return {
      boldDirect: direct(element.querySelector("[data-mesurer-text-style-button='bold']")),
      italicDirect: direct(element.querySelector("[data-mesurer-text-style-button='italic']")),
      underlineDirect: direct(element.querySelector("[data-mesurer-text-style-button='underline']")),
      fontDirect: direct(element.querySelector("[data-mesurer-text-style-select='font']")),
      sizeDirect: direct(element.querySelector("[data-mesurer-text-style-select='size']")),
      weightDirect: direct(element.querySelector("[data-mesurer-text-style-select='weight']")),
      colorsDirect: direct(element.querySelector("[data-mesurer-text-color-swatches='true']")),
      customColorDirect: element.querySelector("[data-mesurer-text-color-swatches='true']")?.querySelector("[data-mesurer-text-custom-color='true']") instanceof HTMLInputElement,
      separatorDirect: direct(element.querySelector("[data-mesurer-text-preset-separator='true']")),
      presetLast: directChildren.at(-1)?.hasAttribute("data-mesurer-text-style-menu-button") === true,
    };
  });
  for (const [key, value] of Object.entries(layout)) {
    assert.equal(value, true, `Typography toolbar layout contract failed: ${key}`);
  }

  const closedChevron = await menuButton.evaluate((button) => {
    const chevron = button.querySelector("[data-mesurer-text-style-chevron='true']");
    if (!(chevron instanceof HTMLElement)) throw new Error("Expected the semantic-style CSS chevron");
    const buttonRect = button.getBoundingClientRect();
    const chevronRect = chevron.getBoundingClientRect();
    return {
      text: chevron.textContent,
      width: getComputedStyle(chevron).width,
      height: getComputedStyle(chevron).height,
      transform: getComputedStyle(chevron).transform,
      centerDelta: Math.abs((chevronRect.top + chevronRect.height / 2) - (buttonRect.top + buttonRect.height / 2)),
    };
  });
  assert.equal(closedChevron.text, "", "Semantic-style chevron should not depend on a font glyph");
  assert.equal(closedChevron.width, "7px", "Semantic-style chevron should have fixed geometry");
  assert.equal(closedChevron.height, "7px", "Semantic-style chevron should have fixed geometry");
  assert(closedChevron.centerDelta <= 1.5, `Semantic-style chevron should be vertically centered; delta=${closedChevron.centerDelta}`);

  await menuButton.click();
  await menu.waitFor({ state: "visible" });
  const openChevronTransform = await page.locator("[data-mesurer-text-style-chevron='true']").evaluate((element) => getComputedStyle(element).transform);
  assert.notEqual(openChevronTransform, closedChevron.transform, "Semantic-style chevron should visibly rotate when the preset menu opens");

  const menuContents = await menu.evaluate((element) => ({
    label: element.getAttribute("aria-label"),
    presets: Array.from(element.children).filter((child) => child instanceof HTMLButtonElement && child.hasAttribute("data-mesurer-text-style-preset")).length,
    childCount: element.children.length,
    selects: element.querySelectorAll("[data-mesurer-text-style-select]").length,
    colors: element.querySelectorAll("[data-mesurer-text-color-swatches]").length,
  }));
  assert.equal(menuContents.label, "Text presets", "The semantic popup should identify itself as Text presets");
  assert(menuContents.presets > 0, "The semantic popup should contain page-derived Text/Heading presets");
  assert.equal(menuContents.childCount, menuContents.presets, "The semantic popup should contain only semantic preset rows");
  assert.equal(menuContents.selects, 0, "Font/size/weight do not belong inside the semantic preset popup");
  assert.equal(menuContents.colors, 0, "Text colors do not belong inside the semantic preset popup");

  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });

  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-root='true']");
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    const typography = document.querySelector("button[data-mesurer-builtin='text-inspector']");
    return root?.getAttribute("data-mesurer-typography-context-active") !== "true"
      && select?.getAttribute("aria-pressed") === "true"
      && arrange?.getAttribute("aria-pressed") === "true"
      && typography?.getAttribute("aria-pressed") === "false";
  });

  // Regression: when Typography itself is selected, its hover/pinned inspector
  // must not remain visible underneath the direct-edit Typography details card.
  await arrangeButton.click();
  await page.waitForFunction(() => {
    const select = document.querySelector("[data-mesurer-builtin='select'] button");
    const arrange = document.querySelector("button[data-mesurer-tool-id='arrange']");
    return select?.getAttribute("aria-pressed") === "true"
      && arrange?.getAttribute("aria-pressed") === "false";
  });
  assert.equal(await typographyButton.isDisabled(), false, "Typography should be available after Arrange is turned off");
  await typographyButton.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-builtin='text-inspector']")?.getAttribute("aria-pressed") === "true");

  await page.mouse.move(x, y);
  const normalTypographyCard = page.locator(".mesurer-ti-card:not([data-mesurer-text-inspector-info='true'])[data-state='visible']").first();
  await normalTypographyCard.waitFor({ state: "visible" });

  await page.mouse.dblclick(x, y);
  const typographyEditor = page.locator("[data-mesurer-text-editor='true']");
  const directTypographyCard = page.locator("[data-mesurer-text-inspector-info='true']");
  await typographyEditor.waitFor({ state: "visible" });
  await directTypographyCard.waitFor({ state: "visible" });

  assert.equal(
    await page.locator(".mesurer-ti-card:visible").count(),
    1,
    "Typography-first direct editing should expose exactly one visible typography information card",
  );
  assert.equal(
    await page.locator(".mesurer-ti-card:not([data-mesurer-text-inspector-info='true']):visible").count(),
    0,
    "Typography hover/pinned cards must be suppressed while the direct editor owns Typography details",
  );
  assert.equal(
    await page.locator(".mesurer-ti-box:visible").count(),
    0,
    "Typography hover/pinned highlight boxes must be suppressed while direct editing is active",
  );
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true", "Typography must remain selected during direct editing");

  await typographyEditor.focus();
  await page.keyboard.press("Escape");
  await typographyEditor.waitFor({ state: "detached" });
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".mesurer-ti-card:not([data-mesurer-text-inspector-info='true'])"))
    .some((card) => card instanceof HTMLElement
      && getComputedStyle(card).display !== "none"
      && card.getAttribute("aria-hidden") !== "true"));
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true", "Closing direct editing must leave explicit Typography mode selected");

  assert.equal(pageErrors.length, 0, `Typography layout browser contract page errors: ${pageErrors.join("\n")}`);
  assert.equal(consoleErrors.length, 0, `Typography layout browser contract console errors: ${consoleErrors.join("\n")}`);
  console.log("Direct typography controls + semantic-only presets + contextual/explicit Typography without duplicate cards: PASS");
} finally {
  await browser.close();
}
