import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const DOCUMENT_SELECTED_CHROME = "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']";
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const selectionSnapshot = () => page.evaluate(async () => {
  const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
  if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
  const context = await subject.context({ scope: "selection" });
  return context.targets.map((target) => ({
    selector: target.inspection.selector,
    tag: target.inspection.tag,
    id: target.inspection.id,
  }));
});

const elementSummary = (element) => {
  if (!(element instanceof Element)) return null;
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    mesurerRoot: element.getAttribute("data-mesurer-root"),
    mesurerLayer: element.getAttribute("data-mesurer-layer"),
    mesurerInspectorUi: element.getAttribute("data-mesurer-inspector-ui"),
    annotationTrigger: element.getAttribute("data-mesurer-annotation-trigger"),
    selectedMeasurement: element.getAttribute("data-mesurer-selected-measurement"),
    measurementChrome: element.getAttribute("data-mesurer-measurement-chrome"),
  };
};

const diagnosticSnapshot = (x, y, stage) => page.evaluate(async ({ x, y, stage, selectedSelector }) => {
  const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
  if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
  const context = await subject.context({ scope: "selection" });
  const island = document.querySelector("[data-mesurer-island='true']");
  const shadowRoot = island instanceof HTMLElement ? island.shadowRoot : null;
  const docHit = document.elementFromPoint(x, y);
  const shadowHit = shadowRoot?.elementFromPoint?.(x, y) ?? null;
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  return {
    stage,
    point: { x, y },
    selection: context.targets.map((target) => ({
      selector: target.inspection.selector,
      tag: target.inspection.tag,
      id: target.inspection.id,
    })),
    documentHit: elementSummary(docHit),
    documentStack: document.elementsFromPoint(x, y).slice(0, 8).map(elementSummary),
    shadowHit: elementSummary(shadowHit),
    shadowStack: typeof shadowRoot?.elementsFromPoint === "function"
      ? shadowRoot.elementsFromPoint(x, y).slice(0, 8).map(elementSummary)
      : [],
    selectedChrome: Array.from(document.querySelectorAll(selectedSelector)).map((element) => ({
      summary: elementSummary(element),
      rect: rect(element),
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      opacity: getComputedStyle(element).opacity,
      anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
    })),
    annotationTriggers: shadowRoot
      ? Array.from(shadowRoot.querySelectorAll("[data-mesurer-annotation-trigger='true']")).map((element) => ({
        summary: elementSummary(element),
        rect: rect(element),
      }))
      : [],
  };
}, { x, y, stage, selectedSelector: DOCUMENT_SELECTED_CHROME });

const logSnapshot = async (x, y, stage) => {
  const value = await diagnosticSnapshot(x, y, stage);
  console.log(`[isolated-selection-handoff] ${stage} ${JSON.stringify(value)}`);
  return value;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const targetBox = await target.boundingBox();
  assert(targetBox, "initial target must have geometry");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await settle();
  assert.equal((await selectionSnapshot()).at(-1)?.id, "isolated-scroll-target", "initial physical selection must own the first target");

  await page.mouse.move(1220, 840);
  await page.mouse.wheel(0, 80);
  await settle();

  const nestedScroller = page.locator("#nested-scroll-shell");
  const nestedTarget = page.locator("#isolated-nested-scroll-target");
  await nestedScroller.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await nestedScroller.evaluate((element) => { element.scrollTop = 340; });
  await settle();

  const nestedTargetBox = await nestedTarget.boundingBox();
  assert(nestedTargetBox, "nested target must have geometry");
  const x = nestedTargetBox.x + nestedTargetBox.width / 2;
  const y = nestedTargetBox.y + nestedTargetBox.height / 2;
  await logSnapshot(x, y, "before-pointerdown");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await logSnapshot(x, y, "during-pointerdown");
  await page.mouse.up();
  await settle();
  const afterPointerUp = await logSnapshot(x, y, "after-pointerup");

  assert.equal(
    afterPointerUp.selection.at(-1)?.id,
    "isolated-nested-scroll-target",
    `nested physical selection must transfer to the nested target; selection=${JSON.stringify(afterPointerUp.selection)}`,
  );
  assert.equal(afterPointerUp.selectedChrome.length, 1, "nested physical selection must leave one rendered selected chrome");
  assert(afterPointerUp.selectedChrome[0].rect.width > 0 && afterPointerUp.selectedChrome[0].rect.height > 0, "nested selected chrome must have rendered geometry");
  assert.deepEqual(errors, [], `browser emitted errors: ${errors.join(" | ")}`);

  console.log("Isolated nested selection handoff diagnostic: PASS");
} finally {
  await browser.close();
}
