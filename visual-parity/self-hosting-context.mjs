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
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor,
});
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELF_HOSTING__?.subject));

  await page.evaluate(async () => {
    const harness = window.__MESURER_SELF_HOSTING__;
    await harness.subject.agent.command("builtin.select");
  });

  const target = page.locator("[data-self-host-target]");
  const targetBox = await target.boundingBox();
  assert(targetBox, "Self-host selection target must have a bounding box");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  await page.waitForFunction(() => {
    const button = document.querySelector("button[data-mesurer-tool-id='context.copy-selection']");
    return button instanceof HTMLButtonElement && !button.disabled;
  });

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.mountObserver();
  });

  const toolIds = [
    "context.copy",
    "context.copy-selection",
    "context.add-note",
    "context.send-selection",
  ];

  const measurements = await page.evaluate((ids) => {
    const harness = window.__MESURER_SELF_HOSTING__;
    const observer = harness.observer;
    if (!observer) throw new Error("Observer Mesurer did not mount.");

    const center = (value) => ({
      x: value.left + value.width / 2,
      y: value.top + value.height / 2,
    });

    const tools = ids.map((id) => {
      const button = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button`);
      const svg = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button svg`);
      const glyph = observer.agent.inspect(`[data-mesurer-tool-id='${id}'] button svg path`);
      if (!button || !svg || !glyph) throw new Error(`Missing rendered geometry for ${id}`);
      const buttonCenter = center(button.rect);
      const svgCenter = center(svg.rect);
      const glyphCenter = center(glyph.rect);
      return {
        id,
        button: button.rect,
        svg: svg.rect,
        glyph: glyph.rect,
        buttonCenter,
        svgCenter,
        glyphCenter,
        svgCenterDelta: {
          x: svgCenter.x - buttonCenter.x,
          y: svgCenter.y - buttonCenter.y,
        },
        opticalCenterDelta: {
          x: glyphCenter.x - svgCenter.x,
          y: glyphCenter.y - svgCenter.y,
        },
      };
    });

    const builtins = ["select", "xray", "color-picker", "rulers", "text-inspector", "guides", "settings"]
      .map((id) => {
        const button = observer.agent.inspect(`[data-mesurer-builtin='${id}'] button`);
        const svg = observer.agent.inspect(`[data-mesurer-builtin='${id}'] button svg`);
        return button && svg ? { id, button: button.rect, svg: svg.rect } : null;
      })
      .filter(Boolean);

    return {
      viewport: observer.agent.viewport(),
      tools,
      builtins,
    };
  }, toolIds);

  const close = (actual, expected, tolerance, message) => {
    assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}±${tolerance}, got ${actual}`);
  };

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
    assert(tool.glyph.width >= 11 && tool.glyph.width <= 18.5, `${tool.id} glyph width ${tool.glyph.width} is outside the existing toolbar icon envelope`);
    assert(tool.glyph.height >= 11 && tool.glyph.height <= 18.5, `${tool.id} glyph height ${tool.glyph.height} is outside the existing toolbar icon envelope`);
    const opticalOffset = Math.hypot(tool.opticalCenterDelta.x, tool.opticalCenterDelta.y);
    maxOpticalOffset = Math.max(maxOpticalOffset, opticalOffset);
    assert(opticalOffset <= 1.5, `${tool.id} optical center offset ${opticalOffset.toFixed(3)}px exceeds 1.5px`);
  }

  await page.evaluate(async () => {
    const harness = window.__MESURER_SELF_HOSTING__;
    const observer = harness.observer;
    if (!observer) throw new Error("Observer Mesurer did not mount.");
    await observer.agent.command("builtin.select");
  });

  const copyButton = page.locator("button[data-mesurer-tool-id='context.copy']").first();
  const copyBox = await copyButton.boundingBox();
  assert(copyBox, "Copy context button must have a bounding box");
  await page.mouse.click(copyBox.x + 3, copyBox.y + copyBox.height / 2);

  await page.waitForFunction(() => {
    const observer = window.__MESURER_SELF_HOSTING__?.observer;
    return Boolean(observer?.element.querySelector('[data-mesurer-selected-measurement="true"]'));
  });

  const summaryLines = [
    `context buttons: ${measurements.tools.length} × 32×32px`,
    "context SVG boxes: 20×20px, centered in every button",
    `max glyph optical-center offset: ${maxOpticalOffset.toFixed(2)}px`,
    "observer selection: Copy context button",
  ];
  await page.evaluate((lines) => window.__MESURER_SELF_HOSTING__.setReport(lines), summaryLines);

  const evidence = {
    deviceScaleFactor,
    assertions: {
      buttonBox: "32x32 ± 0.05px",
      svgBox: "20x20 ± 0.05px",
      svgCenterDelta: "≤ 0.05px per axis",
      toolbarCenterLineDelta: "≤ 0.05px",
      glyphEnvelope: "11–18.5px per axis",
      opticalCenterOffset: "≤ 1.5px",
    },
    maxOpticalOffset,
    measurements,
  };

  await fs.writeFile(
    path.join(outputDir, "self-hosting-measurements.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );

  await page.screenshot({
    path: path.join(outputDir, `mesurer-inspecting-mesurer-${deviceScaleFactor}x.png`),
    fullPage: false,
  });

  const subjectToolbarRect = await page.evaluate(() => {
    const toolbar = window.__MESURER_SELF_HOSTING__.subject.element.querySelector("[data-mesurer-toolbar='true']");
    if (!(toolbar instanceof HTMLElement)) return null;
    const rect = toolbar.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert(subjectToolbarRect, "Subject toolbar must exist for detail capture");
  const padding = 24;
  const clipX = Math.max(0, subjectToolbarRect.x - padding);
  const clipY = Math.max(0, subjectToolbarRect.y - padding);
  await page.screenshot({
    path: path.join(outputDir, `context-toolbar-detail-${deviceScaleFactor}x.png`),
    clip: {
      x: clipX,
      y: clipY,
      width: Math.min(1280 - clipX, subjectToolbarRect.width + padding * 2),
      height: Math.min(720 - clipY, subjectToolbarRect.height + padding * 2),
    },
  });

  console.log(JSON.stringify({
    result: "PASS",
    toolIds,
    maxOpticalOffset,
    outputDir,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
