import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const url = process.env.SELF_HOST_URL;
const outputDir = process.env.SELF_HOST_OUT;
const deviceScaleFactor = Number.parseFloat(process.env.SELF_HOST_DPR ?? "3");

if (!url || !outputDir) {
  throw new Error("SELF_HOST_URL and SELF_HOST_OUT are required");
}
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
  throw new Error(`SELF_HOST_DPR must be positive, received ${process.env.SELF_HOST_DPR}`);
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor });
const page = await context.newPage();

const boxGap = (a, b) => {
  const horizontal = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const vertical = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(horizontal, vertical);
};

const captureAround = async (boxes, name, padding = 24) => {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const clipX = Math.max(0, left - padding);
  const clipY = Math.max(0, top - padding);
  await page.screenshot({
    path: path.join(outputDir, `${name}-${deviceScaleFactor}x.png`),
    clip: {
      x: clipX,
      y: clipY,
      width: Math.min(1280 - clipX, right - left + padding * 2),
      height: Math.min(720 - clipY, bottom - top + padding * 2),
    },
  });
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELF_HOSTING__?.subject));
  await page.evaluate(async () => { await window.__MESURER_SELF_HOSTING__.subject.agent.command("builtin.select"); });

  const target = page.locator("[data-self-host-target]");
  const targetBox = await target.boundingBox();
  assert(targetBox, "Self-host selection target must have a bounding box");
  await page.mouse.click(targetBox.x + 10, targetBox.y + 10);
  await page.waitForFunction(() => {
    const button = document.querySelector("button[data-mesurer-tool-id='context.copy-selection']");
    return button instanceof HTMLButtonElement && !button.disabled;
  });

  const annotationTrigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await annotationTrigger.waitFor({ state: "visible" });
  const triggerBox = await annotationTrigger.boundingBox();
  assert(triggerBox);
  assert.equal(triggerBox.width, 24);
  assert.equal(triggerBox.height, 24);
  assert(boxGap(targetBox, triggerBox) <= 8.5);

  await annotationTrigger.click();
  const composer = page.locator("[data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  const composerBox = await composer.boundingBox();
  assert(composerBox);
  assert(boxGap(targetBox, composerBox) <= 8.5);
  assert(composerBox.width <= 272.5);
  const noteText = "Increase the spacing above this control to 24px.";
  await composer.locator("textarea").fill(noteText);
  await page.screenshot({ path: path.join(outputDir, `annotation-composer-${deviceScaleFactor}x.png`), fullPage: false });
  await captureAround([targetBox, composerBox], "annotation-composer-detail", 28);

  await composer.getByRole("button", { name: "Add note" }).click();
  const annotationPanel = page.locator("[data-mesurer-annotation-panel='true']");
  const annotationMarker = page.locator("[data-mesurer-annotation-marker='true']");
  await annotationPanel.waitFor({ state: "visible" });
  await annotationMarker.waitFor({ state: "visible" });
  const panelBox = await annotationPanel.boundingBox();
  const markerBox = await annotationMarker.boundingBox();
  assert(panelBox && markerBox);
  assert.equal(markerBox.width, 24);
  assert.equal(markerBox.height, 24);
  assert(boxGap(targetBox, markerBox) <= 8.5);
  assert(boxGap(markerBox, panelBox) <= 8.5);
  assert.equal((await annotationPanel.textContent())?.includes(noteText), true);
  await captureAround([targetBox, markerBox, panelBox], "annotation-panel-detail", 28);
  await annotationPanel.getByRole("button", { name: "Close annotation" }).click();

  await page.evaluate(async () => { await window.__MESURER_SELF_HOSTING__.mountObserver(); });
  const toolIds = ["context.copy", "context.copy-selection", "context.add-note", "context.send-selection"];
  const measurements = await page.evaluate((ids) => {
    const observer = window.__MESURER_SELF_HOSTING__.observer;
    if (!observer) throw new Error("Observer Mesurer did not mount.");
    const center = (value) => ({ x: value.left + value.width / 2, y: value.top + value.height / 2 });
    const tools = ids.map((id) => {
      const button = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button`);
      const svg = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button svg`);
      const glyph = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button svg path`);
      if (!button || !svg || !glyph) throw new Error(`Missing rendered geometry for ${id}`);
      const buttonCenter = center(button.rect), svgCenter = center(svg.rect), glyphCenter = center(glyph.rect);
      return { id, button: button.rect, svg: svg.rect, glyph: glyph.rect, buttonCenter, svgCenter, glyphCenter,
        svgCenterDelta: { x: svgCenter.x - buttonCenter.x, y: svgCenter.y - buttonCenter.y },
        opticalCenterDelta: { x: glyphCenter.x - svgCenter.x, y: glyphCenter.y - svgCenter.y } };
    });
    return { viewport: observer.agent.viewport(), tools };
  }, toolIds);

  const close = (actual, expected, tolerance, message) => assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}±${tolerance}, got ${actual}`);
  const toolbarCenterY = measurements.tools[0].buttonCenter.y;
  let maxOpticalOffset = 0;
  for (const tool of measurements.tools) {
    close(tool.button.width, 32, 0.05, `${tool.id} button width`);
    close(tool.button.height, 32, 0.05, `${tool.id} button height`);
    close(tool.svg.width, 20, 0.05, `${tool.id} SVG width`);
    close(tool.svg.height, 20, 0.05, `${tool.id} SVG height`);
    close(tool.svgCenterDelta.x, 0, 0.05, `${tool.id} horizontal centering`);
    close(tool.svgCenterDelta.y, 0, 0.05, `${tool.id} vertical centering`);
    close(tool.buttonCenter.y, toolbarCenterY, 0.05, `${tool.id} toolbar center line`);
    assert(tool.glyph.width >= 11 && tool.glyph.width <= 18.5);
    assert(tool.glyph.height >= 11 && tool.glyph.height <= 18.5);
    const opticalOffset = Math.hypot(tool.opticalCenterDelta.x, tool.opticalCenterDelta.y);
    maxOpticalOffset = Math.max(maxOpticalOffset, opticalOffset);
    assert(opticalOffset <= 1.5);
  }

  const evidence = {
    deviceScaleFactor,
    maxOpticalOffset,
    annotation: { target: targetBox, trigger: triggerBox, composer: composerBox, marker: markerBox, panel: panelBox, note: noteText },
    measurements,
  };
  await fs.writeFile(path.join(outputDir, "self-hosting-measurements.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await page.screenshot({ path: path.join(outputDir, `mesurer-inspecting-mesurer-${deviceScaleFactor}x.png`), fullPage: false });
  console.log(JSON.stringify({ result: "PASS", maxOpticalOffset, annotationTriggerGap: boxGap(targetBox, triggerBox), annotationComposerGap: boxGap(targetBox, composerBox), annotationMarkerGap: boxGap(targetBox, markerBox), annotationPanelGap: boxGap(markerBox, panelBox), outputDir }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
