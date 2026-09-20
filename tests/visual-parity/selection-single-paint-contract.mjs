import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

const SELECTED_CHROME = "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']";

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);

  return value;
};

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const assertSameBox = (actual, expected, stage, tolerance = 1.5) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${stage}: ${key} drifted; target=${expected[key]} selected=${actual[key]}`,
    );
  }
};

const topLayerDuplicates = (targetId) => page.evaluate((id) => {
  const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
  const target = document.getElementById(id);

  if (!subject || !(subject.root instanceof ShadowRoot) || !(target instanceof HTMLElement)) return null;
  const targetRect = target.getBoundingClientRect();

  return Array.from(subject.root.querySelectorAll("[data-mesurer-measurement='true']:not([data-mesurer-selected-measurement='true'])"))
    .flatMap((root) => {
      const chrome = root.querySelector("[data-mesurer-measurement-chrome='true']");

      if (!(chrome instanceof HTMLElement)) return [];
      const rect = chrome.getBoundingClientRect();
      const sameRect = ["x", "y", "width", "height"].every((key) => Math.abs(rect[key] - targetRect[key]) <= 1.5);

      return sameRect ? [{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }] : [];
    });
}, targetId);

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetBox = await box(target, "target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selected = page.locator(SELECTED_CHROME);
  await selected.waitFor({ state: "visible" });
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);

    return element instanceof HTMLElement
      && element.dataset.mesurerNativeScrollAnchor === "box"
      && Boolean(getComputedStyle(element).getPropertyValue("position-anchor").trim());
  }, SELECTED_CHROME);
  await settle();

  targetBox = await box(target, "target after selection");
  assertSameBox(await box(selected, "selected chrome after selection"), targetBox, "single selected chrome");
  assert.deepEqual(
    await topLayerDuplicates("isolated-scroll-target"),
    [],
    "selected target must not keep a second measurement box in the fixed top-layer island",
  );

  for (const delta of [48, 48, -32, 64, -64]) {
    await page.mouse.move(1220, 840);
    await page.mouse.wheel(0, delta);
    await settle();
    const frameTarget = await box(target, `target after wheel ${delta}`);
    const frameSelected = await box(selected, `selected chrome after wheel ${delta}`);
    assertSameBox(frameSelected, frameTarget, `selection after wheel ${delta}`);
    assert.deepEqual(
      await topLayerDuplicates("isolated-scroll-target"),
      [],
      `wheel ${delta} recreated a top-layer selection ghost`,
    );
  }

  const panelZIndex = await page.evaluate(() => {
    const contextRoot = document.querySelector("[data-mesurer-context-root='true']");

    return contextRoot instanceof HTMLElement ? getComputedStyle(contextRoot).zIndex : null;
  });

  assert.notEqual(panelZIndex, null, "Context document root must remain mounted while selection chrome is document-owned");

  assert.equal(await page.locator(SELECTED_CHROME).count(), 1, "selection must have exactly one persistent document chrome box");
  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selection single-paint E2E: a selected target has one document-owned border, no fixed-island duplicate, and wheel scrolling cannot recreate a ghost selection: PASS");
} finally {
  await browser.close();
}
