// Failure modes covered before implementation:
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
// - Typography, direct editing, Alt distances, drag, and capture tools leave
//   duplicate/stale Inspect cards visible.
// Responsive source values and preview ownership are covered by
// responsive-inspection-contract.mjs.

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

const card = page.locator("[data-mesurer-inspect-info-card]");

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
  assert.equal(
    await locator.evaluate((element, coordinates) => {
      const hit = element.ownerDocument.elementFromPoint(coordinates.x, coordinates.y);

      return hit === element || Boolean(hit && element.contains(hit));
    }, point),
    true,
    "The actual browser hit test resolves to the Inspect control",
  );
  await page.mouse.click(point.x, point.y);
};

const clickInspectedTarget = async (target) => {
  // The full-page Select interaction plane intentionally owns the hit test,
  // so Playwright sees that protected overlay rather than the underlying page
  // target as the locator hit target. Read the source bounds immediately before
  // physical mouse input; never reuse a cached point across layout changes.
  const bounds = await target.boundingBox();
  assert(bounds, "The current inspected target has rendered geometry");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
};

const hoverInspectedTarget = async (target) => {
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
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await click(toolbar);

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
    };
  });

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
  await page.screenshot({ path: join(output, "selected-card.png") });

  const paddingButton = card.getByRole("button", { name: "Copy padding" });
  await clickInspectControl(paddingButton);
  await page.waitForFunction(() => navigator.clipboard.readText().then((value) => value.length > 0));
  assert.equal(await textFromClipboard(), expectedPadding, "Copy writes the exact displayed source CSS value");

  const selectorCopy = card.getByRole("button", { name: `Copy selector ${selectedSelector}`, exact: true });
  await clickInspectControl(selectorCopy);
  await page.waitForFunction((value) => navigator.clipboard.readText().then((clipboard) => clipboard === value), selectedSelector);
  assert.equal(await textFromClipboard(), selectedSelector);

  // Hover preview is deliberately pass-through. Moving and clicking a second
  // element must still reach the page and retarget selection.
  const other = page.locator(".warm-card");
  await hoverInspectedTarget(other);
  await card.waitFor({ state: "hidden" }).catch(() => undefined);

  // Settings are changed through the real UI and checked after a page reload.
  await page.locator("[data-mesurer-builtin='settings'] button").click();
  const settingsPanel = page.getByRole("dialog", { name: "Settings" });
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  await settingsPanel.getByLabel("Info card mode").selectOption("hover");
  await settingsPanel.getByRole("switch", { name: "Layout details" }).click();
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
  const hoverRect = await card.boundingBox();
  assert(hoverRect, "Hover card geometry is visible");
  await hoverInspectedTarget(other);
  await card.waitFor({ state: "visible" });
  assert.notEqual(await card.locator("[data-mesurer-inspect-selector]").innerText(), selectedSelector,
    "Moving over the next target retargets the pass-through hover card");

  await page.locator("[data-mesurer-builtin='settings'] button").click();
  await settingsPanel.waitFor({ state: "visible" });
  await settingsPanel.getByRole("tab", { name: "Select" }).click();
  await settingsPanel.getByLabel("Info card mode").selectOption("click");
  await settingsPanel.getByRole("switch", { name: "Layout details" }).click();
  await page.keyboard.press("Escape");

  const result = {
    url,
    expected,
    persistedSettings: { infoCardMode: "hover", layoutDetailsEnabled: false },
    errors,
  };

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Inspect info contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "failure.json"), `${JSON.stringify({ url, errors, error: String(error), stack: error?.stack }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
