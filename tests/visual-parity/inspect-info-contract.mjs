// Failure modes covered by this rendered contract:
// - Click mode fails to show a card for a real selected element, or leaves it
//   stale after selection changes / Select is turned off.
// - Hover mode fails to show the selector preview, or its pass-through card
//   steals the next real page click.
// - CSS values come from projected/root geometry rather than the source
//   document, omit the upstream row ordering/default filtering, or use a
//   non-source CSS size for Responsive previews.
// - The first six CSS rows / expand / collapse behavior drifts or leaks state
//   to the next selected element.
// - Copy controls report success without writing the exact formatted value to
//   the real browser clipboard, or are not physically actionable.
// - Settings do not persist across reload, or old settings with no new fields
//   fail to receive upstream defaults.
// - Selected card paint lets page selection through, or scroll causes a
//   freeze/jump instead of source-following motion.
// - Typography rows appear for multi-selection or diverge from its formatter.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.INSPECT_INFO_URL ?? "http://127.0.0.1:4190/";

const output = process.env.INSPECT_INFO_OUT ?? "inspect-info-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

const page = await context.newPage();

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const card = page.locator("[data-mesurer-inspect-info-card]:visible").first();

const root = page.locator(".primary-action");

const toolbar = page.locator("[data-mesurer-island] button[data-mesurer-builtin='select']");

const click = async (locator) => {
  await locator.waitFor({ state: "visible" });
  await locator.click();
};

const clickInspectControl = async (locator) => {
  await locator.waitFor({ state: "visible" });
  assert.equal(await locator.isEnabled(), true, "Inspect control is enabled");
  const bounds = await locator.boundingBox();
  assert(bounds, "Inspect control has rendered bounds");
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y);

  const hit = await locator.evaluate((element, coordinates) => {
    let hit = element.ownerDocument.elementFromPoint(coordinates.x, coordinates.y);

    while (hit?.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(coordinates.x, coordinates.y);

      if (!inner || inner === hit) break;

      hit = inner;
    }

    return {
      resolves: hit === element || Boolean(hit && element.contains(hit)),
      hit: hit ? { tag: hit.tagName, label: hit.getAttribute("aria-label"), className: hit.className } : null,
      control: { tag: element.tagName, label: element.getAttribute("aria-label") },
    };
  }, point);

  assert.equal(hit.resolves, true, `The actual browser hit test resolves to the Inspect control: ${JSON.stringify(hit)}`);
  await page.mouse.click(point.x, point.y);
};

const clickInspectedTarget = async (target) => {
  // The full-page Select interaction plane intentionally owns the hit test,
  // so Playwright sees that protected overlay rather than the underlying page
  // target as the locator hit target. Read the source bounds immediately before
  // physical mouse input; never reuse a cached point across layout changes.
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  assert(bounds, "The current inspected target has rendered geometry");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
};

const hoverInspectedTarget = async (target) => {
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  assert(bounds, "The current hover target has rendered geometry");

  await page.mouse.move(1, 1);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const selectedBox = page.locator("[data-mesurer-selected-measurement='true']");

const textFromClipboard = () => page.evaluate(() => navigator.clipboard.readText());

const formatEdges = (values) => {
  const [top, right, bottom, left] = values.map(Math.round);

  const shorthand = top === right && right === bottom && bottom === left
    ? `${top}`
    : top === bottom && left === right
      ? `${top} ${right}`
      : `${top} ${right} ${bottom} ${left}`;

  return values.every((value) => Math.round(value) === 0) ? null : shorthand.split(" ").map((value) => `${value}px`).join(" ");
};

try {
  await page.addInitScript(() => {
    // Released settings without Inspect fields must retain the new defaults.
    if (!localStorage.getItem("mesurer-settings")) localStorage.setItem("mesurer-settings",
      JSON.stringify({ version: 2, settings: { shortcutsEnabled: true }, workspace: null }));
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  const settingsButton = page.locator("[data-mesurer-builtin='settings'] button");
  const settingsPanel = page.getByRole("dialog", { name: "Settings" });
  await click(settingsButton);
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();

  const initialSettings = {
    infoCardMode: await settingsPanel.getByLabel("Info card mode").inputValue(),
    layoutDetailsEnabled: await settingsPanel.getByRole("switch", { name: "Layout details" }).getAttribute("aria-checked"),
  };

  assert.deepEqual(initialSettings, { infoCardMode: "click", layoutDetailsEnabled: "true" },
    "Old settings restore Click mode and layout-details-on defaults");

  await page.keyboard.press("Escape");
  await click(toolbar);
  const originalRootColor = await root.evaluate((element) => getComputedStyle(element).color);

  await hoverInspectedTarget(root);
  await clickInspectedTarget(root);
  await selectedBox.first().waitFor({ state: "attached" });
  await card.waitFor({ state: "visible" });

  const expected = await root.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      selector: element.id ? `#${element.id}` : "button.primary-action",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      paddingEdges: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map((value) => parseFloat(value)),
      display: style.display,
      color: style.color,
      background: style.backgroundColor,
    };
  });

  expected.color = originalRootColor;

  const selectedContext = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));
  const selectedSelector = selectedContext.targets[0].inspection.selector;
  assert.equal(await card.locator("[data-mesurer-inspect-selector]").innerText(), selectedSelector);
  assert.equal(await card.getByRole("button", { name: "Copy dimensions" }).innerText(), `${expected.width} x ${expected.height}`);
  const labels = await card.locator("[data-mesurer-inspect-css-row] > span:first-child").allInnerTexts();
  assert(labels.includes("padding") && labels.includes("background") && labels.includes("color"),
    "Source computed padding, background, and color are shown");
  assert(labels.indexOf("padding") < labels.indexOf("background")
    && labels.indexOf("background") < labels.indexOf("color"), "CSS rows follow upstream ordering");
  const expectedPadding = formatEdges(expected.paddingEdges);

  const renderedRowValue = async (label) => card.locator("[data-mesurer-inspect-css-row]")
    .filter({ has: page.locator(`span:text-is("${label}")`) })
    .locator("button, span")
    .last()
    .innerText();

  assert.equal(await renderedRowValue("padding"), expectedPadding,
    "Rendered padding exactly matches source computed edges and formatter");
  assert.equal(await renderedRowValue("color"), expected.color,
    "Selected source tint is excluded from rendered color evidence");
  assert.equal(await renderedRowValue("background"), expected.background,
    "Rendered background exactly matches source computed style");
  await page.screenshot({ path: join(output, "selected-card.png") });

  const paddingButton = card.getByRole("button", { name: "Copy padding" });
  await clickInspectControl(paddingButton);
  await page.waitForFunction(() => navigator.clipboard.readText().then((value) => value.length > 0));
  assert.equal(await textFromClipboard(), expectedPadding, "Copy writes the exact displayed source CSS value");
  await paddingButton.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((value) => navigator.clipboard.readText().then((clipboard) => clipboard === value), expectedPadding);
  assert.equal(await textFromClipboard(), expectedPadding, "Keyboard activation copies the selected-card value");

  const selectorCopy = card.getByRole("button", { name: `Copy selector ${selectedSelector}`, exact: true });
  await clickInspectControl(selectorCopy);
  await page.waitForFunction((value) => navigator.clipboard.readText().then((clipboard) => clipboard === value), selectedSelector);
  assert.equal(await textFromClipboard(), selectedSelector);

  const cardBounds = await card.boundingBox();
  assert(cardBounds, "Selected card has geometry");
  const paddingPoint = { x: cardBounds.x + 3, y: cardBounds.y + cardBounds.height / 2 };
  await page.mouse.move(paddingPoint.x, paddingPoint.y);
  assert.equal(await page.evaluate((point) => {
    const hit = document.elementFromPoint(point.x, point.y);

    return Boolean(hit?.closest("[data-mesurer-inspect-info-card='true']"));
  }, paddingPoint), true, "The complete selected surface, not just its buttons, owns hit testing");
  await page.mouse.click(paddingPoint.x, paddingPoint.y);
  assert.equal((await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }))).targets[0].inspection.selector,
    selectedSelector, "Clicking selected-card padding does not reselect page content underneath");

  await page.evaluate(() => {
    const clipboard = navigator.clipboard;
    window.__inspectOriginalClipboardWrite = clipboard.writeText.bind(clipboard);
    Object.defineProperty(clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Clipboard denied", "NotAllowedError")),
    });
  });
  await clickInspectControl(paddingButton);
  await page.getByRole("status").filter({ hasText: "Copy failed" }).waitFor({ state: "visible" });
  assert.notEqual(await page.getByRole("status").innerText(), "Copied!",
    "Rejected clipboard writes never report a false Copied state");

  await root.evaluate((element) => { element.style.color = "rgb(151, 12, 31)"; });
  await page.waitForFunction(() => {
    const row = [...(document.querySelectorAll("[data-mesurer-inspect-css-row]"))]
      .find((candidate) => candidate.querySelector("span")?.textContent === "color");

    return row?.querySelector("button")?.textContent === "rgb(151, 12, 31)";
  }, null, { timeout: 5000 });
  assert.equal(await card.getByRole("status").innerText(), "Copy failed",
    "Failure feedback survives a source-style update that replaces evidence rows");
  await root.evaluate((element, color) => { element.style.color = color; }, originalRootColor);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: window.__inspectOriginalClipboardWrite,
    });
    delete window.__inspectOriginalClipboardWrite;
  });

  const relativeCardOffset = async () => page.evaluate(() => {
    const target = document.querySelector(".primary-action").getBoundingClientRect();
    const card = document.querySelector("[data-mesurer-inspect-info-card]").getBoundingClientRect();

    return card.top - target.top;
  });

  const offsetBeforeScroll = await relativeCardOffset();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1200, 700);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction((before) => window.scrollY !== before, scrollBefore);

  const scrollSamples = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    let frames = 0;

    const sample = () => {
      const target = document.querySelector(".primary-action").getBoundingClientRect();
      const card = document.querySelector("[data-mesurer-inspect-info-card]").getBoundingClientRect();
      samples.push({ delta: card.top - target.top, scrollY: window.scrollY });

      if (++frames === 20) resolve(samples);
      else requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  }));

  assert(scrollSamples.every(({ delta }) => Math.abs(delta - offsetBeforeScroll) <= 1),
    `Root card follows its source without a scroll-settle jump: ${JSON.stringify(scrollSamples)}`);

  // Hover preview is deliberately pass-through and has no interactive or
  // focusable descendants. A click through it still reaches page content.
  const other = page.locator(".warm-card");
  const otherBounds = await other.boundingBox();
  assert(otherBounds, "Second page target has geometry");
  await other.evaluate((element) => {
    Object.assign(element.style, {
      display: "grid",
      gap: "7px",
      position: "relative",
      zIndex: "2",
      border: "2px solid rgb(30, 60, 90)",
      borderRadius: "12px",
      backgroundColor: "rgb(210, 220, 230)",
      color: "rgb(23, 45, 67)",
      boxShadow: "0 1px 2px rgb(0 0 0 / 20%)",
      opacity: "0.9",
      overflow: "hidden",
    });
  });
  await hoverInspectedTarget(other);
  await card.waitFor({ state: "visible" });
  assert.equal(await card.locator("[data-mesurer-inspect-selector]").innerText(), selectedSelector,
    "Click-mode selected card remains visible when hover moves to another target");
  const reselectPoint = { x: otherBounds.x + 10, y: otherBounds.y + 10 };
  assert.equal(await page.evaluate((point) => {
    const hit = document.elementFromPoint(point.x, point.y);

    return !hit?.closest("[data-mesurer-inspect-info-card='true']");
  }, reselectPoint), true, "The re-selection point is outside the selected card surface");
  await page.mouse.click(reselectPoint.x, reselectPoint.y);
  await page.waitForFunction((previous) => {
    const current = document.querySelector("[data-mesurer-inspect-selector]")?.textContent;

    return current !== previous;
  }, selectedSelector);
  await card.waitFor({ state: "visible" });
  const allRows = card.locator("[data-mesurer-inspect-css-row]");

  const countCssRows = async () => allRows.evaluateAll((rows) => rows.filter((row) =>
    !["Text", "Family", "Size", "Weight", "Line", "Tracking"].includes(row.querySelector("span")?.textContent ?? ""),
  ).length);

  const collapsedRows = await countCssRows();
  assert.equal(collapsedRows, 6, "Collapsed mode renders exactly the first six CSS rows");
  assert.equal(await card.getByRole("button", { name: /Show \d+ more CSS details/ }).isVisible(), true,
    "Additional CSS rows have an actionable expansion control");
  const expand = card.getByRole("button", { name: /Show \d+ more CSS details/ });
  await clickInspectControl(expand);
  assert.equal(await card.locator("button[aria-expanded='true']").getAttribute("aria-expanded"), "true",
    "Expand opens the full row list");
  const expandedRows = await countCssRows();
  assert(expandedRows > collapsedRows, "Expansion exposes rows beyond the first six");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await clickInspectControl(card.getByRole("button", { name: "Show less CSS details" }));
  await card.getByRole("button", { name: /Show \d+ more CSS details/ }).waitFor({ state: "visible" });
  assert.equal(await countCssRows(), 6, "Collapse restores exactly six CSS rows");
  await clickInspectControl(card.getByRole("button", { name: /Show \d+ more CSS details/ }));
  await card.getByRole("button", { name: "Show less CSS details" }).waitFor({ state: "visible" });
  await hoverInspectedTarget(root);
  await clickInspectedTarget(root);
  await page.waitForFunction((selector) =>
    document.querySelector("[data-mesurer-inspect-selector]")?.textContent === selector, selectedSelector);
  assert.equal(await card.getByRole("button", { name: "Show less CSS details" }).count(), 0,
    "Retargeting resets expansion rather than leaking the previous target's state");
  assert(await countCssRows() <= 6, "Retargeted card has at most six CSS rows");

  const multiPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await multiPage.goto(url, { waitUntil: "networkidle" });
  await multiPage.waitForFunction(() => Boolean(window.__MESURER__));
  await multiPage.evaluate(() => window.__MESURER__.ready());

  await multiPage.locator("button[data-mesurer-builtin='select']").click();
  const multiPrimary = multiPage.locator(".primary-action");
  await multiPrimary.scrollIntoViewIfNeeded();
  const primaryBounds = await multiPrimary.boundingBox();
  await multiPage.mouse.click(primaryBounds.x + primaryBounds.width / 2, primaryBounds.y + primaryBounds.height / 2);
  const multiOther = multiPage.locator(".warm-card");
  await multiOther.scrollIntoViewIfNeeded();
  const multiBounds = await multiOther.boundingBox();
  await multiPage.keyboard.down("Shift");
  await multiPage.mouse.click(multiBounds.x + 10, multiBounds.y + 10);
  await multiPage.keyboard.up("Shift");
  await multiPage.waitForFunction(() => document.querySelector("[data-mesurer-selection-group='true']"));
  const multiSelection = await multiPage.evaluate(() => window.__MESURER__.context({ scope: "selection" }));
  assert.equal(multiSelection.targets.length, 2, "Physical Shift-click establishes multi-selection");
  const multiCard = multiPage.locator("[data-mesurer-inspect-info-card]:visible").first();
  await multiCard.waitFor({ state: "visible" });
  assert.equal(await multiCard.locator("[data-mesurer-inspect-details] [data-mesurer-inspect-css-row]")
    .filter({ has: multiPage.locator("span:text-is('Family')") }).count(), 0,
  "Typography rows are omitted for multi-selection");
  await multiPage.close();

  // Settings are changed through the real UI and checked after a page reload.
  await settingsButton.click();
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  await settingsPanel.getByLabel("Info card mode").selectOption("hover");

  if (initialSettings.layoutDetailsEnabled === "true") {
    await settingsPanel.getByRole("switch", { name: "Layout details" }).click();
  }

  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.locator("[data-mesurer-builtin='settings'] button").click();
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  assert.equal(await settingsPanel.getByLabel("Info card mode").inputValue(), "hover");
  assert.equal(await settingsPanel.getByRole("switch", { name: "Layout details" }).getAttribute("aria-checked"), "false");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Escape");
  const selectButton = page.locator("[data-mesurer-island] button[data-mesurer-builtin='select']");

  if (await selectButton.getAttribute("aria-pressed") !== "true") await selectButton.click();
  await hoverInspectedTarget(root);

  await card.waitFor({ state: "visible" });
  assert.equal(await card.evaluate((element) => getComputedStyle(element).pointerEvents), "none",
    "Hover card is pass-through and non-interactive");
  assert.equal(await card.locator("button, a, input, select, textarea, [tabindex]").count(), 0,
    "Hover card has no focusable controls or actions");
  const hoverRect = await card.boundingBox();
  assert(hoverRect, "Hover card geometry is visible");

  await page.setViewportSize({ width: 1000, height: 600 });
  const tallTarget = root;
  const previousTallTargetStyle = await tallTarget.getAttribute("style");
  await tallTarget.evaluate((target) => {
    Object.assign(target.style, {
      position: "fixed",
      left: "400px",
      top: "20px",
      width: "100px",
      height: "560px",
      background: "rgb(230, 230, 230)",
      zIndex: "9999",
    });
  });
  await hoverInspectedTarget(tallTarget);

  const tallPlacement = await page.evaluate(() => {
    const target = document.querySelector(".primary-action").getBoundingClientRect();
    const card = document.querySelector("[data-mesurer-inspect-info-card]").getBoundingClientRect();

    return { target: target.toJSON(), card: card.toJSON() };
  });

  assert(tallPlacement.card.right <= tallPlacement.target.left + 1
    || tallPlacement.card.left >= tallPlacement.target.right - 1,
  `Root-page tall target uses a non-overlapping side candidate: ${JSON.stringify(tallPlacement)}`);
  await tallTarget.evaluate((target, style) => {
    if (style === null) target.removeAttribute("style");
    else target.setAttribute("style", style);
  }, previousTallTargetStyle);
  await page.setViewportSize({ width: 1280, height: 900 });
  await hoverInspectedTarget(root);

  await hoverInspectedTarget(other);
  await card.waitFor({ state: "visible" });
  assert.notEqual(await card.locator("[data-mesurer-inspect-selector]").innerText(), selectedSelector,
    "Moving over the next target retargets the pass-through hover card");
  await clickInspectedTarget(other);
  await selectedBox.first().waitFor({ state: "attached" });
  assert((await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }))).targets.length > 0,
    "A click physically through hover-card paint still reaches page selection");

  await settingsButton.click();
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  await settingsPanel.getByLabel("Info card mode").selectOption(initialSettings.infoCardMode);
  const currentLayoutSetting = await settingsPanel.getByRole("switch", { name: "Layout details" }).getAttribute("aria-checked");

  if (currentLayoutSetting !== initialSettings.layoutDetailsEnabled) {
    await settingsPanel.getByRole("switch", { name: "Layout details" }).click();
  }

  await page.keyboard.press("Escape");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await settingsButton.click();
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  assert.equal(await settingsPanel.getByLabel("Info card mode").inputValue(), initialSettings.infoCardMode,
    "Restoring the pre-test Inspect mode survives a reload");
  assert.equal(await settingsPanel.getByRole("switch", { name: "Layout details" }).getAttribute("aria-checked"),
    initialSettings.layoutDetailsEnabled, "Restoring the pre-test layout-details setting survives a reload");
  await page.keyboard.press("Escape");

  const responsiveUrl = new URL("responsive-preview.html", url).href;
  await page.goto(responsiveUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.locator("button[data-mesurer-builtin='select']").click();
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  const preview = page.locator("iframe[data-mesurer-responsive-frame]").first();
  await preview.waitFor({ state: "attached" });
  const previewTarget = page.frameLocator("iframe[data-mesurer-responsive-frame]").getByTestId("inspection-target");
  await previewTarget.waitFor({ state: "visible" });

  const previewEvidence = await previewTarget.evaluate((element) => {
    Object.assign(element.style, {
      display: "flex",
      gap: "7px",
      margin: "5px",
      position: "relative",
      zIndex: "2",
      border: "2px solid rgb(30, 60, 90)",
      borderRadius: "4px",
      backgroundColor: "rgb(210, 220, 230)",
      color: "rgb(23, 45, 67)",
      boxShadow: "0 1px 2px rgb(0 0 0 / 20%)",
      opacity: "0.9",
      overflow: "hidden",
      fontSize: "13.3333px",
      fontWeight: "400",
    });
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      color: style.color,
      background: style.backgroundColor,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map((value) => Number.parseFloat(value)),
    };
  });

  await preview.evaluate((frame) => {
    frame.contentWindow.__previewClipboardCalls = 0;
    const clipboard = frame.contentWindow.navigator.clipboard;
    Object.defineProperty(clipboard, "writeText", {
      configurable: true,
      value: () => {
        frame.contentWindow.__previewClipboardCalls += 1;

        return Promise.reject(new DOMException("Preview document is not focused", "NotAllowedError"));
      },
    });
  });

  const projected = await preview.evaluate((frame) => {
    const target = frame.contentDocument.querySelector("[data-testid='inspection-target']");
    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const scale = frameRect.width / frame.offsetWidth;

    return {
      x: frameRect.left + (targetRect.left + frame.clientLeft) * scale,
      y: frameRect.top + (targetRect.top + frame.clientTop) * scale,
      width: targetRect.width * scale,
      height: targetRect.height * scale,
    };
  });

  await page.mouse.move(projected.x + projected.width / 2, projected.y + projected.height / 2);
  await page.mouse.click(projected.x + projected.width / 2, projected.y + projected.height / 2);
  await card.waitFor({ state: "visible" });
  assert.equal(await card.getByRole("button", { name: "Copy dimensions" }).innerText(),
    `${previewEvidence.width} x ${previewEvidence.height}`,
    "Selected preview dimensions use source CSS pixels");
  assert.equal(await card.getByRole("button", { name: "Copy Size", exact: true }).innerText(), "13.3px",
    "Preview typography uses the shared one-decimal formatter");
  assert.equal(await card.getByRole("button", { name: "Copy Weight", exact: true }).innerText(), "400 / normal",
    "Preview typography uses the shared weight formatter");
  const previewDimensions = card.getByRole("button", { name: "Copy dimensions" });
  await clickInspectControl(previewDimensions);
  await page.waitForFunction((value) => navigator.clipboard.readText().then((clipboard) => clipboard === value),
    `${previewEvidence.width} x ${previewEvidence.height}`);
  assert.equal(await textFromClipboard(), `${previewEvidence.width} x ${previewEvidence.height}`,
    "Preview card copies through the real root-document clipboard");
  assert.equal(await preview.evaluate((frame) => frame.contentWindow.__previewClipboardCalls), 0,
    "Preview source window is used for evidence, never for clipboard writes");
  const previewRowCount = await countCssRows();
  assert.equal(previewRowCount, 6, "Preview CSS starts collapsed to six rows");
  await clickInspectControl(card.getByRole("button", { name: /Show \d+ more CSS details/ }));
  await card.getByRole("button", { name: "Show less CSS details" }).waitFor({ state: "visible" });
  assert(await countCssRows() > previewRowCount,
    "Responsive selected card expansion reveals the full rendered CSS evidence");
  assert.equal(await renderedRowValue("color"), previewEvidence.color,
    "Selected preview color is the exact computed source color");
  await clickInspectControl(card.getByRole("button", { name: "Copy color", exact: true }));
  await page.waitForFunction((value) => navigator.clipboard.readText().then((text) => text === value), previewEvidence.color);
  assert.equal(await textFromClipboard(), previewEvidence.color);
  const previewCardBounds = await card.boundingBox();
  await page.mouse.click(previewCardBounds.x + 3, previewCardBounds.y + 3);
  assert.equal(await card.getByRole("button", { name: "Copy dimensions" }).innerText(),
    `${previewEvidence.width} x ${previewEvidence.height}`,
    "Responsive selected-card padding protects selection underneath");
  await previewTarget.evaluate((element) => { element.style.color = "rgb(151, 12, 31)"; });
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;

    return root?.querySelector("button[aria-label='Copy color']")?.textContent === "rgb(151, 12, 31)";
  });
  assert.equal(await renderedRowValue("color"), "rgb(151, 12, 31)",
    "Responsive source-style changes refresh visible evidence");
  await page.screenshot({ path: join(output, "preview-expanded.png") });

  const result = {
    url,
    expected,
    initialSettings,
    persistedSettings: { infoCardMode: "hover", layoutDetailsEnabled: false },
    previewEvidence,
    previewDimensionsCopied: `${previewEvidence.width} x ${previewEvidence.height}`,
    scrollSamples,
    tallPlacement,
    errors,
  };

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Inspect info contract passed. Evidence: ${output}`);
} catch (error) {
  await writeFile(join(output, "failure-card.html"), await card.evaluate((element) => element.outerHTML).catch(() => ""));
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "failure.json"), `${JSON.stringify({ url, errors, error: String(error), stack: error?.stack }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
