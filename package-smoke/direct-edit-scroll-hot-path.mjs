import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"),
  ));
  await page.evaluate(() => window.__MESURER__.command("builtin.select"));

  // Make page-DOM size deliberately large. The scroll event contract below is
  // structural rather than timing-based: none of these nodes may be scanned by
  // direct-edit scroll handlers.
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.dataset.testid = "scroll-hot-path-noise";
    fixture.style.height = "1800px";
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 5000; index += 1) {
      const node = document.createElement("span");
      node.textContent = String(index);
      fragment.append(node);
    }
    fixture.append(fragment);
    document.body.append(fixture);
  });

  const target = page.locator("[data-testid='consumer-sibling']");
  const box = await target.boundingBox();
  if (!box) throw new Error("Direct-edit hot-path target has no geometry");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.mouse.dblclick(x, y);
  await page.locator("[data-mesurer-text-editor='true']").waitFor({ state: "visible", timeout: 5000 });
  await page.locator("[data-mesurer-text-inspector-info='true']").waitFor({ state: "visible", timeout: 5000 });

  const result = await page.evaluate(() => {
    const counters = {
      documentQuerySelector: 0,
      documentQuerySelectorAll: 0,
      elementQuerySelector: 0,
      elementQuerySelectorAll: 0,
      boundingClientRect: 0,
      rangeClientRects: 0,
      rangeBoundingClientRect: 0,
      elementsFromPoint: 0,
      computedStyle: 0,
    };
    const stacks = {};
    let tracking = false;
    const record = (name) => {
      counters[name] += 1;
      stacks[name] ??= new Error(`first ${name}`).stack;
    };

    const originalDocumentQuerySelector = Document.prototype.querySelector;
    const originalDocumentQuerySelectorAll = Document.prototype.querySelectorAll;
    const originalElementQuerySelector = Element.prototype.querySelector;
    const originalElementQuerySelectorAll = Element.prototype.querySelectorAll;
    const originalBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalRangeClientRects = Range.prototype.getClientRects;
    const originalRangeBoundingClientRect = Range.prototype.getBoundingClientRect;
    const originalElementsFromPoint = Document.prototype.elementsFromPoint;
    const originalComputedStyle = window.getComputedStyle;

    Document.prototype.querySelector = function (...args) {
      if (tracking) record("documentQuerySelector");
      return originalDocumentQuerySelector.apply(this, args);
    };
    Document.prototype.querySelectorAll = function (...args) {
      if (tracking) record("documentQuerySelectorAll");
      return originalDocumentQuerySelectorAll.apply(this, args);
    };
    Element.prototype.querySelector = function (...args) {
      if (tracking) record("elementQuerySelector");
      return originalElementQuerySelector.apply(this, args);
    };
    Element.prototype.querySelectorAll = function (...args) {
      if (tracking) record("elementQuerySelectorAll");
      return originalElementQuerySelectorAll.apply(this, args);
    };
    Element.prototype.getBoundingClientRect = function (...args) {
      if (tracking) record("boundingClientRect");
      return originalBoundingClientRect.apply(this, args);
    };
    Range.prototype.getClientRects = function (...args) {
      if (tracking) record("rangeClientRects");
      return originalRangeClientRects.apply(this, args);
    };
    Range.prototype.getBoundingClientRect = function (...args) {
      if (tracking) record("rangeBoundingClientRect");
      return originalRangeBoundingClientRect.apply(this, args);
    };
    Document.prototype.elementsFromPoint = function (...args) {
      if (tracking) record("elementsFromPoint");
      return originalElementsFromPoint.apply(this, args);
    };
    window.getComputedStyle = function (...args) {
      if (tracking) record("computedStyle");
      return originalComputedStyle.apply(this, args);
    };

    try {
      tracking = true;
      for (let index = 0; index < 20; index += 1) {
        window.dispatchEvent(new Event("scroll"));
      }
      tracking = false;
    } finally {
      tracking = false;
      Document.prototype.querySelector = originalDocumentQuerySelector;
      Document.prototype.querySelectorAll = originalDocumentQuerySelectorAll;
      Element.prototype.querySelector = originalElementQuerySelector;
      Element.prototype.querySelectorAll = originalElementQuerySelectorAll;
      Element.prototype.getBoundingClientRect = originalBoundingClientRect;
      Range.prototype.getClientRects = originalRangeClientRects;
      Range.prototype.getBoundingClientRect = originalRangeBoundingClientRect;
      Document.prototype.elementsFromPoint = originalElementsFromPoint;
      window.getComputedStyle = originalComputedStyle;
    }

    return { counters, stacks };
  });

  const expensive = Object.entries(result.counters).filter(([, count]) => count !== 0);
  if (expensive.length) {
    throw new Error(`Direct-edit scroll event performed synchronous DOM discovery/layout work: ${JSON.stringify(result, null, 2)}`);
  }

  // Let deferred settle/reconciliation work complete and prove the accepted
  // interaction is still alive after the structural hot-path probe.
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => ({
    editor: Boolean(document.querySelector("[data-mesurer-text-editor='true']")),
    ring: document.querySelector("[data-mesurer-text-edit-ring='true']")?.getAttribute("data-mesurer-native-scroll-anchor") ?? null,
    typography: Boolean(document.querySelector("[data-mesurer-text-inspector-info='true']")),
  }));
  if (!state.editor || !state.typography) {
    throw new Error(`Direct edit did not survive scroll hot-path probe: ${JSON.stringify(state)}`);
  }

  console.log("Packed Solid 2 direct-edit scroll hot path: PASS", { counts: result.counters, state });
} finally {
  await page.close();
  await browser.close();
}
