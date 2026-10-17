import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_TOOLS_URL ?? "http://127.0.0.1:4192/responsive-preview.html";

const output = process.env.RESPONSIVE_TOOLS_OUT ?? "responsive-tools-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

await page.addInitScript(() => {
  const recordingCanvas = document.createElement("canvas");
  recordingCanvas.width = 640;
  recordingCanvas.height = 360;
  const recordingContext = recordingCanvas.getContext("2d");
  let frameNumber = 0;

  const drawRecordingFrame = () => {
    recordingContext.fillStyle = `rgb(${frameNumber % 255} 40 180)`;
    recordingContext.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    frameNumber += 1;
    requestAnimationFrame(drawRecordingFrame);
  };

  drawRecordingFrame();
  Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
    configurable: true,
    value: async () => recordingCanvas.captureStream(60),
  });
  window.__MESURER_HOST__ = {
    captureScreenshot: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = innerWidth * 2;
      canvas.height = innerHeight * 2;
      const context = canvas.getContext("2d");
      context.fillStyle = "#5eead4";
      context.fillRect(0, 0, canvas.width, canvas.height);

      return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    },
  };
  Object.defineProperty(window, "EyeDropper", {
    configurable: true,
    value: class {
      async open() { return { sRGBHex: "#5eead4" }; }
    },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined },
  });
});

page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("frame-ancestors 'none'")) errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  const typographyButton = page.locator("[data-mesurer-builtin='text-inspector'] button");
  await typographyButton.click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Typography should be enabled before opening Responsive");
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Opening Responsive should preserve active Typography mode");
  await page.locator("button[data-mesurer-builtin='select']").click();
  const frame = page.locator("iframe[data-mesurer-responsive-frame]").first();
  await frame.waitFor();
  await frame.contentFrame().locator("[data-testid='edit-target']").waitFor();
  await frame.evaluate((node) => {
    const target = node.contentDocument.querySelector("[data-testid='edit-target']");
    const inspection = node.contentDocument.querySelector("#inspection-target");
    target.style.cssText = "position:absolute;left:24px;top:140px;display:block;width:102px;height:22px;margin:0;padding:0";
    inspection.style.cssText = "position:absolute;left:146px;top:140px;display:block;width:48px;height:22px;margin:0;padding:0";
  });
  await settle();

  const target = frame.contentFrame().locator("[data-testid='edit-target']");
  const projected = await target.boundingBox();
  assert(projected, "Preview target must have rendered bounds");
  const center = { x: projected.x + projected.width / 2, y: projected.y + projected.height / 2 };
  await page.mouse.move(center.x, center.y, { steps: 3 });
  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(overlay.querySelector("[data-mesurer-hover-measurement='true']"));
  });
  const hover = await page.locator("[data-mesurer-hover-measurement='true']").boundingBox();
  assert(hover && Math.abs(hover.width - projected.width) < 1,
    "Real mouse movement over a preview element must render its hover outline");

  await page.mouse.click(center.x, center.y);
  const selected = page.locator("[data-mesurer-selected-measurement='true']");
  await selected.waitFor({ state: "attached" });
  const measurementText = await selected.innerText();
  const inspectCard = page.locator("[data-mesurer-inspect-info-card]");
  await inspectCard.waitFor({ state: "visible" });
  const dimensions = await inspectCard.getByRole("button", { name: "Copy dimensions" }).innerText();
  assert.match(dimensions, /102\s*x\s*22/,
    `Inspect card header must report preview CSS pixels, got ${JSON.stringify(dimensions)}`);
  assert.equal(await selected.locator("[data-mesurer-measurement-label='true']").count(), 0,
    "The selected measurement label is suppressed only while its Inspect card is visible");
  await page.screenshot({ path: join(output, "responsive-tools-selected.png"), fullPage: true });

  const inspection = frame.contentFrame().locator("#inspection-target");

  const inspectionRect = await inspection.evaluate((element) => {
    const { left, top, width, height, right } = element.getBoundingClientRect();

    return { left, top, width, height, right };
  });

  const inspectionProjected = await inspection.boundingBox();

  assert(inspectionProjected, "Inspection target must have rendered bounds");

  const inspectionCenter = {
    x: inspectionProjected.x + inspectionProjected.width / 2,
    y: inspectionProjected.y + inspectionProjected.height / 2,
  };

  await page.mouse.move(inspectionCenter.x, inspectionCenter.y, { steps: 3 });

  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;
    const hover = overlay.querySelector("[data-mesurer-hover-measurement='true']");

    return Boolean(hover && Number.parseFloat(hover.style.width) > 0);
  });

  const hoverOverSelection = await page.locator("[data-mesurer-hover-measurement='true']").boundingBox();

  assert(hoverOverSelection && Math.abs(hoverOverSelection.width - inspectionProjected.width) < 1,
    "Hover outline must update to another preview element while a different element remains selected");

  await page.keyboard.down("Alt");
  await inspectCard.waitFor({ state: "hidden" });
  const selectedDimensionsLabel = page.locator("[data-mesurer-measurement-label='true']").filter({ hasText: /102\s*x\s*22/ });
  await selectedDimensionsLabel.waitFor({ state: "visible" });
  assert.match(await selectedDimensionsLabel.innerText(), /102\s*x\s*22/,
    "The selected measurement label returns when the Inspect card is suppressed");

  await page.mouse.move(inspectionCenter.x + 1, inspectionCenter.y, { steps: 2 });

  await page.waitForFunction(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return Boolean(overlay.querySelector("[data-mesurer-distance-kind='preview']"));
  });
  await page.waitForTimeout(100);

  const distanceLabel = page.locator("[data-mesurer-distance-kind='preview'] [data-mesurer-distance-label='true']").first();

  assert(await distanceLabel.count(), "Alt distance label must render");

  const distanceText = (await distanceLabel.innerText()).trim();

  const expectedGap = Math.round(inspectionRect.left - 24 - 102);

  assert.equal(distanceText, `${expectedGap}`,
    `Alt distance should report preview CSS-pixel gap ${expectedGap}, got ${JSON.stringify(distanceText)}`);
  await page.keyboard.up("Alt");

  // Alt-hover the preview container while its child remains selected. The four
  // gaps are derived from the source-document padding box, not the scaled stage.
  await page.keyboard.down("Alt");
  const container = frame.contentFrame().locator("main").nth(1);

  const expectedContainerGaps = await container.evaluate((element) => {
    const child = element.ownerDocument.querySelector("[data-testid='edit-target']");
    const rect = child.getBoundingClientRect();
    const containerRect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

    const paddingBox = {
      left: containerRect.left + borderLeft,
      top: containerRect.top + borderTop,
      right: containerRect.right - borderRight,
      bottom: containerRect.bottom - borderBottom,
    };

    return [
      Math.max(0, rect.top - paddingBox.top),
      Math.max(0, paddingBox.bottom - rect.bottom),
      Math.max(0, rect.left - paddingBox.left),
      Math.max(0, paddingBox.right - rect.right),
    ].map(Math.round);
  });

  const containerBounds = await container.boundingBox();
  assert(containerBounds, "Preview container must have rendered bounds");
  await page.mouse.move(containerBounds.x + 1, containerBounds.y + 1, { steps: 2 });
  await page.waitForFunction((gaps) => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    return gaps.some((gap) => gap > 0
      && [...overlay.querySelectorAll("div")].some((element) => element.textContent?.trim() === String(gap)));
  }, expectedContainerGaps);

  const renderedContainerLabels = await page.locator("[data-mesurer-island]").evaluate((island) =>
    [...(island.shadowRoot?.querySelectorAll("div") ?? [])]
      .flatMap((element) => {
        const text = element.textContent?.trim();

        return text ? [text] : [];
      }));

  const matchingContainerGap = expectedContainerGaps.find((gap) => gap > 0 && renderedContainerLabels.includes(String(gap)));
  assert.notEqual(matchingContainerGap, undefined,
    `Alt-hovering the preview container should report a source CSS-pixel gap from ${JSON.stringify(expectedContainerGaps)}, got ${JSON.stringify(renderedContainerLabels)}`);
  await page.keyboard.up("Alt");

  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await page.getByLabel("Add a size").selectOption("375x667");
  assert.equal(await page.locator("iframe[data-mesurer-responsive-frame]").count(), 2);

  const initialFrames = await page.locator("iframe[data-mesurer-responsive-frame]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-mesurer-responsive-preview-id")));

  const screenshotButton = page.locator("[data-mesurer-tool-id='screenshot'] button").first();
  await screenshotButton.click();
  const screenshotOverlay = page.locator("[data-mesurer-screenshot-select='true']");
  await screenshotOverlay.waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "Screenshot selection keeps Responsive open");
  assert.deepEqual(await page.locator("iframe[data-mesurer-responsive-frame]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-mesurer-responsive-preview-id"))), initialFrames,
    "Starting Screenshot keeps preview iframe identities");
  const firstPreviewBox = await page.locator("iframe[data-mesurer-responsive-frame]").first().boundingBox();
  assert(firstPreviewBox, "Responsive preview has bounds for capture-selection hit testing");

  const screenshotHit = await page.evaluate(({ x, y }) => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;
    const hit = root?.elementFromPoint(x, y);

    return { isSelection: Boolean(hit?.closest?.("[data-mesurer-screenshot-select='true']")),
      stage: Boolean(hit?.closest?.("[data-mesurer-responsive-stage]")) };
  }, { x: firstPreviewBox.x + 12, y: firstPreviewBox.y + 12 });

  assert.equal(screenshotHit.isSelection, true, `Screenshot selection must own hit testing over preview pixels: ${JSON.stringify(screenshotHit)}`);
  assert.equal(screenshotHit.stage, false);
  await page.mouse.move(firstPreviewBox.x + 10, firstPreviewBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(firstPreviewBox.x + 180, firstPreviewBox.y + 130, { steps: 5 });
  await page.mouse.up();
  const screenshotPreview = page.locator("[data-mesurer-screenshot-preview='true']");
  await screenshotPreview.waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "Completing Screenshot selection keeps Responsive open");
  assert.deepEqual(await page.locator("iframe[data-mesurer-responsive-frame]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-mesurer-responsive-preview-id"))), initialFrames,
  "Screenshot capture retains both preview iframe identities");

  const capturedPreviewSize = await page.locator("[data-mesurer-screenshot-preview-image='true']").evaluate((image) =>
    [image.naturalWidth, image.naturalHeight]);

  assert.deepEqual(capturedPreviewSize, [340, 240], "Screenshot selection over the preview produced a cropped capture");
  await page.locator("[data-mesurer-screenshot-preview-dismiss='true']").click();
  await screenshotPreview.waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1);
  await page.keyboard.press("Shift+S");
  await screenshotOverlay.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await screenshotOverlay.waitFor({ state: "hidden" });

  const recordButton = page.locator("[data-mesurer-tool-id='recording'] button").first();
  await recordButton.click();
  const recordingOverlay = page.locator("[data-mesurer-recording-select='true']");
  await recordingOverlay.waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "Recording selection keeps Responsive open");

  const recordingHit = await page.evaluate(({ x, y }) => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;
    const hit = root?.elementFromPoint(x, y);

    return { isSelection: Boolean(hit?.closest?.("[data-mesurer-recording-select='true']")),
      stage: Boolean(hit?.closest?.("[data-mesurer-responsive-stage]")) };
  }, { x: firstPreviewBox.x + 14, y: firstPreviewBox.y + 14 });

  assert.equal(recordingHit.isSelection, true, `Recording selection must own hit testing over preview pixels: ${JSON.stringify(recordingHit)}`);
  assert.equal(recordingHit.stage, false);

  await page.mouse.move(firstPreviewBox.x + 12, firstPreviewBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(firstPreviewBox.x + 182, firstPreviewBox.y + 132, { steps: 5 });
  await page.mouse.up();
  const recordRegionStart = page.locator("[data-mesurer-recording-start='true']");
  await recordRegionStart.waitFor({ state: "visible" });
  await recordRegionStart.click();
  const recordStop = page.locator("[data-mesurer-recording-stop='true']");
  await recordStop.waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await recordStop.click();
  const recordingPreview = page.locator("[data-mesurer-recording-preview='true']");
  await recordingPreview.waitFor({ state: "visible", timeout: 120000 });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "Capturing a selected preview region leaves Responsive open");
  assert.deepEqual(await page.locator("iframe[data-mesurer-responsive-frame]").evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-mesurer-responsive-preview-id"))), initialFrames,
  "Recording capture preserves the live preview iframe identities");
  const discardRecording = page.locator("[data-mesurer-recording-discard='true']");
  await recordingPreview.hover();
  await discardRecording.click();
  await recordingPreview.waitFor({ state: "hidden" });

  await recordButton.click();
  await recordingOverlay.waitFor({ state: "visible" });
  await page.keyboard.press("Shift+R");
  await recordingOverlay.waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1);

  const colorButton = page.getByRole("button", { name: "Color picker (P)" });

  if (await colorButton.count()) {
    await colorButton.click();
    const colorTarget = page.locator("[data-mesurer-color-picker-target='true']");
    await colorTarget.waitFor({ state: "visible" });

    const colorHit = await page.evaluate(({ x, y }) => {
      const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;
      const hit = root?.elementFromPoint(x, y);

      return { picker: Boolean(hit?.closest?.("[data-mesurer-color-picker-target='true']")),
        stage: Boolean(hit?.closest?.("[data-mesurer-responsive-stage]")) };
    }, { x: firstPreviewBox.x + 16, y: firstPreviewBox.y + 16 });

    assert.equal(colorHit.picker, true, `Color Picker must be above the stage: ${JSON.stringify(colorHit)}`);
    assert.equal(colorHit.stage, false);
    await page.mouse.click(firstPreviewBox.x + 16, firstPreviewBox.y + 16);

    const colorPanel = page.locator(".mesurer-color-picker");
    await colorPanel.waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
      "Color Picker keeps Responsive open");
    assert.match(await colorPanel.textContent(), /#5eead4/i, "Color Picker sampled the host capture over the visible preview");
    const colorPanelBox = await colorPanel.boundingBox();
    assert(colorPanelBox, "Color Picker surface is visible while Responsive is open");

    const colorSurfaceHit = await page.evaluate(({ x, y }) => {
      const island = document.querySelector("[data-mesurer-island]");
      const root = island?.shadowRoot;
      const hit = root?.elementFromPoint(x, y);

      return { picker: Boolean(hit?.closest?.(".mesurer-color-picker")),
        stage: Boolean(hit?.closest?.("[data-mesurer-responsive-stage]")) };
    }, { x: colorPanelBox.x + colorPanelBox.width / 2, y: colorPanelBox.y + colorPanelBox.height / 2 });

    assert.equal(colorSurfaceHit.picker, true, `Color Picker must be above the stage: ${JSON.stringify(colorSurfaceHit)}`);
    assert.equal(colorSurfaceHit.stage, false);
    await page.keyboard.press("Escape");
    await colorPanel.waitFor({ state: "hidden" });
    await colorTarget.waitFor({ state: "hidden" });
    assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1);
    await page.keyboard.press("p");
    await colorTarget.waitFor({ state: "visible" });
    await page.mouse.click(firstPreviewBox.x + 18, firstPreviewBox.y + 18);
    await colorPanel.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await colorPanel.waitFor({ state: "hidden" });
  }

  const settingsButton = page.locator("button[data-mesurer-builtin='settings']");
  await settingsButton.click();
  await page.getByText("General", { exact: true }).waitFor({ state: "visible" });
  await page.locator("iframe[data-mesurer-responsive-frame]").first().evaluate((item) => item.contentWindow.focus());
  await page.keyboard.press("Escape");
  await page.getByText("General", { exact: true }).waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "First Escape from a focused preview dismisses Settings, not Responsive");
  await page.locator("iframe[data-mesurer-responsive-frame]").first().evaluate((item) => item.contentWindow.focus());
  await page.keyboard.press("Escape");
  await page.locator("[data-mesurer-responsive-stage]").waitFor({ state: "detached" });

  await typographyButton.click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Typography should be enabled before opening Responsive");
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  assert.equal(await typographyButton.getAttribute("aria-pressed"), "true",
    "Opening Responsive should preserve active Typography mode");

  const typoTarget = frame.contentFrame().locator("h1");
  const typoBox = await typoTarget.boundingBox();
  assert(typoBox, "Preview Typography target must render");
  await page.mouse.click(typoBox.x + typoBox.width / 2, typoBox.y + typoBox.height / 2);
  const card = page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']");
  await card.waitFor();
  const cardRect = await card.boundingBox();

  assert(cardRect, "Typography card must be visible");

  const hit = await page.evaluate(({ x, y }) => {
    const island = document.querySelector("[data-mesurer-island]");
    const node = island?.shadowRoot?.elementFromPoint(x, y) ?? document.elementFromPoint(x, y);

    const card = island?.shadowRoot?.querySelector(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']")
      ?? document.querySelector(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']");

    let hitCard = false;

    for (let current = node; current; current = current.parentElement ?? current.getRootNode()?.host ?? null) {
      if (current === card) {
        hitCard = true;
        break;
      }
    }

    return {
      node: node?.outerHTML?.slice(0, 180),
      stage: island?.shadowRoot?.querySelector("[data-mesurer-responsive-stage]")?.contains(node),
      hitCard,
    };
  }, { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2 });

  assert.equal(hit.stage, false, `Typography card must win hit testing above Responsive stage: ${JSON.stringify(hit)}`);
  assert.equal(hit.hitCard, true, `Typography panel center must hit the panel rather than a covering stage surface: ${JSON.stringify(hit)}`);

  const cardStyle = await page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']").evaluate((element) => {
    const style = getComputedStyle(element);

    return { display: style.display, position: style.position, visibility: style.visibility, pointerEvents: style.pointerEvents };
  });

  assert.notEqual(cardStyle.display, "none", `Typography panel must have visible styles in Responsive root: ${JSON.stringify(cardStyle)}`);
  assert.notEqual(cardStyle.visibility, "hidden", `Typography panel must not be hidden in Responsive root: ${JSON.stringify(cardStyle)}`);
  assert.notEqual(cardStyle.pointerEvents, "none", `Typography panel must remain interactive: ${JSON.stringify(cardStyle)}`);

  await page.locator("button[data-mesurer-builtin='responsive']").click();
  const hostTarget = page.locator("#root-only-target");
  const hostBounds = await hostTarget.boundingBox();
  assert(hostBounds, "Host Typography target must have rendered bounds");
  await page.mouse.move(hostBounds.x + hostBounds.width / 2, hostBounds.y + hostBounds.height / 2);
  const hostCard = page.locator(".mesurer-ti-card:has(.mesurer-ti-close)[data-state='visible']").last();
  await hostCard.waitFor({ state: "visible" });

  const hostCardStyle = await hostCard.evaluate((element) => {
    const style = getComputedStyle(element);

    return { display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents };
  });

  assert.notEqual(hostCardStyle.display, "none", `Typography must remain styled on the host page: ${JSON.stringify(hostCardStyle)}`);
  assert.notEqual(hostCardStyle.visibility, "hidden", `Typography must remain visible on the host page: ${JSON.stringify(hostCardStyle)}`);
  assert.notEqual(hostCardStyle.pointerEvents, "none", `Typography must remain hit-testable on the host page: ${JSON.stringify(hostCardStyle)}`);

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "responsive-tools.json"), `${JSON.stringify({
    url, scale: projected.width / 102, cssSize: { width: 102, height: 22 },
    screenSize: { width: projected.width, height: projected.height }, measurementText,
    hoverOverSelection, cssGap: expectedGap, distanceText, hit, errors,
  }, null, 2)}\n`);
  console.log(`Responsive tools contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "responsive-tools-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-tools-failure.json"), `${JSON.stringify({
    url, errors, error: String(error), stack: error?.stack,
  }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
