import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = async () => {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
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
  assert(targetBox, "direct-edit annotation target must have geometry");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  await page.mouse.click(x, y);
  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const annotation = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  await annotation.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await contextRoot.getAttribute("data-mesurer-document-inspector-mount"), "true");

  await page.mouse.dblclick(x, y);
  const editor = page.locator("[data-mesurer-text-editor='true']");
  await editor.waitFor({ state: "visible", timeout: 3000 });
  await annotation.waitFor({ state: "hidden", timeout: 3000 });
  assert.equal(
    await contextRoot.getAttribute("data-mesurer-direct-text-edit-active"),
    "true",
    "direct edit must mirror suppression state onto the document-backed Context root",
  );
  assert.equal(await annotation.isVisible(), false, "annotation trigger must not be visible during direct text edit");

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "hidden", timeout: 3000 });
  await settle();
  await annotation.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await contextRoot.evaluate((element) => element.hasAttribute("data-mesurer-direct-text-edit-active")),
    false,
    "direct-edit Context suppression must clear when editing ends",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Direct-edit annotation trigger ownership: PASS", {
    documentContextOwnership: true,
    mirroredDirectEditState: true,
    visibleBeforeEdit: true,
    hiddenDuringEdit: true,
    visibleAfterEdit: true,
  });
} finally {
  await browser.close();
}
