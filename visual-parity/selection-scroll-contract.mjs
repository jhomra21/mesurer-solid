import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};
const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} chrome=${actual[key]}`,
    );
  }
};
const settleScroll = async () => {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
};
const sampleScrollMicrotask = async (deltaY, includeRing = false) => page.evaluate(
  ({ deltaY: scrollDelta, includeRing: shouldIncludeRing }) => new Promise((resolve, reject) => {
    const target = document.querySelector(".feature-copy .kicker");
    const selectedRoot = document.querySelector("[data-mesurer-selected-measurement='true']");
    const selectedChrome = selectedRoot?.children.item(0);
    const editRing = shouldIncludeRing
      ? document.querySelector("[data-mesurer-text-edit-ring='true']")
      : null;
    if (!(target instanceof HTMLElement) || !(selectedChrome instanceof HTMLElement)) {
      reject(new Error("Expected selected target and selected chrome before scroll"));
      return;
    }
    if (shouldIncludeRing && !(editRing instanceof HTMLElement)) {
      reject(new Error("Expected direct-edit ring before scroll"));
      return;
    }

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const onScroll = () => {
      queueMicrotask(() => {
        resolve({
          target: snapshot(target),
          selected: snapshot(selectedChrome),
          ring: editRing instanceof HTMLElement ? snapshot(editRing) : null,
        });
      });
    };
    window.addEventListener("scroll", onScroll, { capture: true, once: true });
    window.scrollBy({ top: scrollDelta, behavior: "instant" });
  }),
  { deltaY, includeRing },
);

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settleScroll();

  let targetBox = await box(target, "target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-selected-measurement='true']").length === 1);

  const selected = page.locator("[data-mesurer-selected-measurement='true']");
  const selectedChrome = selected.locator(":scope > div").first();
  const selectedLabel = selected.locator(":scope > div").last();
  assert.equal(
    await selectedChrome.evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
    "selected measurement chrome must not ease between scroll-synced rectangles",
  );
  assert.equal(
    await selectedLabel.evaluate((element) => getComputedStyle(element).transitionDuration),
    "0s",
    "selected measurement label must not ease behind the selected element",
  );
  assertSameBox(await box(selectedChrome, "selected before scroll"), targetBox, "selected before scroll");

  const immediateSelection = await sampleScrollMicrotask(180);
  assertSameBox(immediateSelection.selected, immediateSelection.target, "selected in scroll microtask");
  targetBox = immediateSelection.target;

  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-edit-ring='true']").length === 1);
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  assertSameBox(await box(editRing, "edit ring before scroll"), targetBox, "edit ring before scroll");

  const immediateEdit = await sampleScrollMicrotask(120, true);
  assertSameBox(immediateEdit.selected, immediateEdit.target, "selected chrome in edit scroll microtask");
  assert(immediateEdit.ring, "edit scroll microtask: expected ring geometry");
  assertSameBox(immediateEdit.ring, immediateEdit.target, "edit ring in scroll microtask");

  // Let the normal model refresh complete too; the synchronous anchoring path
  // and the canonical reactive state must converge on exactly the same host.
  await settleScroll();
  targetBox = await box(target, "target after settled edit scroll");
  assertSameBox(await box(selectedChrome, "selected after settled edit scroll"), targetBox, "selected after settled edit scroll");
  assertSameBox(await box(editRing, "edit ring after settled edit scroll"), targetBox, "edit ring after settled edit scroll");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selected measurement chrome + direct-edit ring stay host-locked before the next animation frame during scroll: PASS");
} finally {
  await browser.close();
}
