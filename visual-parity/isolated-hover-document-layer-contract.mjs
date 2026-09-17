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

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const mountState = await page.evaluate(() => ({
    isolated: window.__MESURER_ISOLATED_SCROLL_TEST__?.subject.root instanceof ShadowRoot,
    contextDocumentMounts: document.querySelectorAll(
      "[data-mesurer-document-inspector-mount='true'][data-mesurer-context-root='true']",
    ).length,
  }));
  assert.equal(mountState.isolated, true, "contract must exercise the isolated top-layer renderer");
  assert.equal(mountState.contextDocumentMounts, 1, "Context must provide one stable document inspector mount");

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const targetBox = await target.boundingBox();
  assert(targetBox, "isolated hover target must have rendered geometry");
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
  );

  const hover = page.locator("[data-mesurer-hover-measurement='true']");
  await hover.waitFor({ state: "visible", timeout: 3000 });
  const ownership = await hover.evaluate((element) => {
    const contextRoot = document.querySelector(
      "[data-mesurer-document-inspector-mount='true'][data-mesurer-context-root='true']",
    );
    const style = getComputedStyle(element);
    return {
      rootIsDocument: element.getRootNode() === document,
      directBodyChild: element.parentElement === document.body,
      documentLayer: element.dataset.mesurerDocumentHoverLayer ?? null,
      position: style.position,
      zIndex: Number(style.zIndex),
      contextRootIsDocument: contextRoot?.getRootNode() === document,
      panelCount: document.querySelectorAll("[data-mesurer-annotation-panel='true']").length,
      composerCount: document.querySelectorAll("[data-mesurer-annotation-composer='true']").length,
    };
  });

  assert.equal(ownership.panelCount, 0, "probe must run before any annotation panel exists");
  assert.equal(ownership.composerCount, 0, "probe must run before any annotation composer exists");
  assert.equal(ownership.contextRootIsDocument, true, "Context root must already own the document paint plane");
  assert.equal(ownership.rootIsDocument, true, "hover chrome must leave the protected top-layer island as soon as Context owns the document plane");
  assert.equal(ownership.directBodyChild, true, "document hover chrome must portal directly to body");
  assert.equal(ownership.documentLayer, "true", "document hover chrome must expose document-layer ownership");
  assert.equal(ownership.position, "absolute", "document hover chrome must use page-space positioning");
  assert.equal(ownership.zIndex, 2147482700, "hover chrome must remain below Context panels and interactive annotation controls");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Isolated hover document-layer ownership: PASS", ownership);
} finally {
  await browser.close();
}
