import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_EDITING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const editor = () => page.locator("[data-mesurer-text-editor='true']");
const ring = () => page.locator("[data-mesurer-text-edit-ring='true']");
const selection = () => page.locator("[data-mesurer-text-selection-highlight='true']");
const inspector = () => page.locator("[data-mesurer-text-inspector-info='true']");
const toolbar = () => page.locator("[data-mesurer-text-style-toolbar='true']");
const waitForEditor = async (stage) => {
  await page.waitForTimeout(100);
  assert.equal(await editor().count(), 1, `${stage}: expected one direct text editor`);
  assert.equal(await ring().count(), 1, `${stage}: expected one host-anchored edit ring`);
};
const closeEditor = async () => {
  await editor().focus();
  await page.keyboard.press("Escape");
  await editor().waitFor({ state: "detached" });
};
const box = async (locator) => {
  const value = await locator.boundingBox();
  assert(value, "Expected rendered geometry");
  return value;
};
const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(Math.abs(actual[key] - expected[key]) <= 1.5, `${stage}: ${key} differs; host=${expected[key]} ring=${actual[key]}`);
  }
};
const overlapArea = (left, right) => {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
};
const assertNoOverlap = (left, right, stage) => {
  assert.equal(overlapArea(left, right), 0, `${stage}: surfaces overlap`);
};
const assertInitialSelection = async (stage) => {
  assert(await selection().count() > 0, `${stage}: expected selected-text highlight on entry`);
};
const assertSelectionCleared = async (stage) => {
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-text-selection-highlight='true']").length === 0);
  assert.equal(await selection().count(), 0, `${stage}: selection highlight should clear after replacement input`);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const primary = page.locator(".primary-action");
  await arrange.waitFor({ state: "visible" });
  await arrange.click();
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-tool-id='arrange']")?.getAttribute("aria-pressed") === "true");

  const primaryBox = await box(primary);
  await page.mouse.click(primaryBox.x + primaryBox.width / 2, primaryBox.y + primaryBox.height / 2);
  await page.mouse.dblclick(primaryBox.x + primaryBox.width / 2, primaryBox.y + primaryBox.height / 2);
  await waitForEditor("primary");
  assert.equal(await editor().evaluate((element) => getComputedStyle(element).opacity), "0", "primary: textarea should be visually transparent");
  assertSameBox(await box(ring()), primaryBox, "primary");
  await assertInitialSelection("primary");
  await closeEditor();

  const slim = page.locator(".feature-copy .kicker");
  const slimBox = await box(slim);
  const slimBackground = await slim.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.mouse.dblclick(slimBox.x + slimBox.width / 2, slimBox.y + slimBox.height / 2);
  await waitForEditor("slim");
  assert.equal(await slim.evaluate((element) => getComputedStyle(element).backgroundColor), slimBackground, "slim: host background changed on edit");
  assertSameBox(await box(ring()), slimBox, "slim");
  await assertInitialSelection("slim");
  await closeEditor();

  await page.setViewportSize({ width: 1280, height: 520 });
  const mixed = page.locator(".feature-copy > p:not(.kicker)").first();
  await mixed.evaluate((element) => {
    const targetTop = 140;
    window.scrollTo({
      top: Math.max(0, window.scrollY + element.getBoundingClientRect().top - targetTop),
      behavior: "instant",
    });
  });
  await page.waitForTimeout(50);

  const mixedState = await mixed.evaluate((element) => {
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node instanceof Text && Boolean(node.nodeValue?.trim()));
    if (directTextNodes.length !== 2) throw new Error("Expected two direct text runs around the shortcut badge");

    const pointFor = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      if (!rect) throw new Error("Expected direct text geometry");
      return {
        x: rect.left + Math.min(24, rect.width / 2),
        y: rect.top + rect.height / 2,
      };
    };

    const host = element.getBoundingClientRect();
    return {
      html: element.innerHTML,
      leadingPoint: pointFor(directTextNodes[0]),
      trailingPoint: pointFor(directTextNodes[1]),
      box: { x: host.x, y: host.y, width: host.width, height: host.height },
    };
  });

  await page.mouse.dblclick(mixedState.leadingPoint.x, mixedState.leadingPoint.y);
  await waitForEditor("mixed-leading");
  assert.equal(await editor().inputValue(), "Select one or more elements, then use Arrange or", "mixed-leading: wrong direct text run selected");
  assertSameBox(await box(ring()), mixedState.box, "mixed-leading");
  await assertInitialSelection("mixed-leading");
  assertNoOverlap(await box(inspector()), mixedState.box, "mixed-leading inspector/field");
  assertNoOverlap(await box(inspector()), await box(toolbar()), "mixed-leading inspector/toolbar");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-leading: shortcut badge changed");
  await editor().evaluate((element) => {
    element.value = "Updated leading copy";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await assertSelectionCleared("mixed-leading");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-leading: typing flattened shortcut badge");
  await closeEditor();
  assert.equal(await mixed.evaluate((element) => element.innerHTML), mixedState.html, "mixed-leading: Escape did not restore mixed inline content");

  const trailingState = await mixed.evaluate((element) => {
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node instanceof Text && Boolean(node.nodeValue?.trim()));
    const trailing = directTextNodes[1];
    if (!(trailing instanceof Text)) throw new Error("Expected trailing direct text run");
    const range = document.createRange();
    range.selectNodeContents(trailing);
    const rect = range.getClientRects()[0];
    const host = element.getBoundingClientRect();
    if (!rect) throw new Error("Expected trailing text geometry");
    return {
      point: { x: rect.left + Math.min(24, rect.width / 2), y: rect.top + rect.height / 2 },
      box: { x: host.x, y: host.y, width: host.width, height: host.height },
    };
  });
  await page.mouse.dblclick(trailingState.point.x, trailingState.point.y);
  await waitForEditor("mixed-trailing");
  assert.equal(await editor().inputValue(), "to drag them into the layout you want.", "mixed-trailing: wrong direct text run selected");
  assertSameBox(await box(ring()), trailingState.box, "mixed-trailing");
  await assertInitialSelection("mixed-trailing");
  assertNoOverlap(await box(inspector()), trailingState.box, "mixed-trailing inspector/field");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-trailing: shortcut badge changed");
  await editor().evaluate((element) => {
    element.value = "Updated trailing copy";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await assertSelectionCleared("mixed-trailing");
  assert.equal(await mixed.locator("kbd").textContent(), "Shift+A", "mixed-trailing: typing flattened shortcut badge");
  await closeEditor();
  assert.equal(await mixed.evaluate((element) => element.innerHTML), mixedState.html, "mixed-trailing: Escape did not restore mixed inline content");

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("Host-anchored editing + restored select-all highlight + collision-safe inspector + mixed-inline text runs: PASS");
} finally {
  await browser.close();
}
