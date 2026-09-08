import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TEXT_EDITING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const describeElement = (element) => {
  if (!(element instanceof Element)) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    tag: element.tagName,
    id: element.id || null,
    className: typeof element.className === "string" ? element.className : null,
    data: Object.fromEntries(
      [...element.attributes]
        .filter((attribute) => attribute.name.startsWith("data-mesurer"))
        .map((attribute) => [attribute.name, attribute.value]),
    ),
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    },
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    pointerEvents: style.pointerEvents,
    position: style.position,
    zIndex: style.zIndex,
    overflow: style.overflow,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    contain: style.contain,
    transform: style.transform,
  };
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrangeButton = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".primary-action");
  await arrangeButton.waitFor({ state: "visible" });
  await target.waitFor({ state: "visible" });

  const targetBox = await target.boundingBox();
  assert(targetBox, "Expected text-editing target geometry");
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

  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const styleButton = inspector.locator("[data-mesurer-text-style-menu-button='true']");
  await inspector.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector("[data-mesurer-text-inspector-info='true']")?.getAttribute("data-mesurer-text-inspector-unified") === "true");

  const styleBox = await styleButton.boundingBox();
  assert(styleBox, "Expected Style trigger geometry");
  await page.mouse.click(styleBox.x + styleBox.width - 4, styleBox.y + styleBox.height / 2);

  const popup = page.locator("[data-mesurer-unified-select-popup='true'][data-mesurer-unified-select-kind='style']");
  const option = popup.locator("[data-mesurer-unified-select-option='heading-2']");
  await popup.waitFor({ state: "visible" });
  await option.waitFor({ state: "visible" });

  const evidence = await option.evaluate((element, describe) => {
    const describeElementInPage = new Function("element", `return (${describe})(element);`);
    const optionRect = element.getBoundingClientRect();
    const point = {
      x: optionRect.left + optionRect.width / 2,
      y: optionRect.top + optionRect.height / 2,
    };

    const ancestors = [];
    let current = element;
    while (current) {
      if (current instanceof Element) ancestors.push(describeElementInPage(current));
      const root = current.getRootNode();
      if (current.parentElement) {
        current = current.parentElement;
      } else if (root instanceof ShadowRoot) {
        current = root.host;
      } else {
        current = null;
      }
    }

    const deepHitStack = [];
    let root = document;
    const seenRoots = new Set();
    while (root && !seenRoots.has(root)) {
      seenRoots.add(root);
      const hits = typeof root.elementsFromPoint === "function"
        ? root.elementsFromPoint(point.x, point.y)
        : [];
      deepHitStack.push({
        root: root instanceof Document
          ? "document"
          : `shadow:${root.host?.tagName ?? "unknown"}`,
        hits: hits.map((hit) => describeElementInPage(hit)),
      });
      const top = hits[0];
      root = top?.shadowRoot ?? null;
    }

    const ownerRoot = element.getRootNode();
    return {
      point,
      option: describeElementInPage(element),
      popup: describeElementInPage(element.closest("[data-mesurer-unified-select-popup='true']")),
      inspector: describeElementInPage(ownerRoot.querySelector?.("[data-mesurer-text-inspector-info='true']") ?? null),
      runtimeMount: describeElementInPage(ownerRoot.querySelector?.("[data-mesurer-text-edit-runtime='true']") ?? null),
      rendererRoot: describeElementInPage(ownerRoot.querySelector?.("[data-mesurer-root='true']") ?? null),
      rootType: ownerRoot instanceof ShadowRoot ? "shadow" : ownerRoot instanceof Document ? "document" : ownerRoot.constructor.name,
      rootHost: ownerRoot instanceof ShadowRoot ? describeElementInPage(ownerRoot.host) : null,
      ancestors,
      deepHitStack,
    };
  }, describeElement.toString());

  console.log(`[hit-test-debug] ${JSON.stringify(evidence, null, 2)}`);

  const center = evidence.point;
  const beforeExpanded = await styleButton.getAttribute("aria-expanded");
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(100);
  const after = {
    popupCount: await popup.count(),
    styleExpanded: await styleButton.getAttribute("aria-expanded"),
    targetTag: await target.evaluate((element) => element.tagName),
  };
  console.log(`[hit-test-debug-click] ${JSON.stringify({ beforeExpanded, ...after }, null, 2)}`);
} finally {
  await browser.close();
}
