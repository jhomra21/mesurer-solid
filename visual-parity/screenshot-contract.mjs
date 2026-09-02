import { chromium } from "playwright";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:4174/screenshot-contract.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const nativeContextMenuIsAvailable = (locator) => locator.evaluate((element) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
  });
  element.dispatchEvent(event);
  return !event.defaultPrevented;
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SCREENSHOT_TEST__));

  const island = page.locator("[data-mesurer-island='true']");
  const screenshotButton = island.locator("[data-mesurer-tool-id='screenshot'] button");
  await screenshotButton.waitFor();
  if ((await screenshotButton.getAttribute("aria-label")) !== "Screenshot") {
    throw new Error("Screenshot plugin tool did not mount with the expected accessible label");
  }

  await screenshotButton.click();
  await page.waitForFunction(() => window.__MESURER_SCREENSHOT_TEST__?.service.active() === true);
  const toolbarVisibility = await island.locator("[data-mesurer-toolbar='true']").evaluate((element) => getComputedStyle(element).visibility);
  if (toolbarVisibility !== "hidden") {
    throw new Error(`Screenshot selection must hide the toolbar, got ${toolbarVisibility}`);
  }

  const overlay = island.locator("[data-mesurer-screenshot-select='true']");
  await overlay.waitFor({ state: "visible" });
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(500, 380, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction(() => window.__MESURER_SCREENSHOT_TEST__?.service.active() === false);
  const preview = island.locator("[data-mesurer-screenshot-preview='true']");
  const previewImage = island.locator("[data-mesurer-screenshot-preview-image='true']");
  await preview.waitFor({ state: "visible" });
  const previewSize = await previewImage.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  if (previewSize.width !== 600 || previewSize.height !== 360) {
    throw new Error(`Expected 2x cropped PNG dimensions 600x360, got ${previewSize.width}x${previewSize.height}`);
  }
  const previewPointerEvents = await preview.evaluate((element) => getComputedStyle(element).pointerEvents);
  if (previewPointerEvents === "none") throw new Error("Screenshot preview is not interactive");
  if (!(await nativeContextMenuIsAvailable(previewImage))) {
    throw new Error("Screenshot preview image prevents the native browser context menu");
  }
  const toast = island.locator("[data-mesurer-screenshot-toast='true']");
  if ((await toast.textContent()) !== "Screenshot captured") {
    throw new Error(`Unexpected screenshot confirmation text: ${await toast.textContent()}`);
  }

  const previewBeforeDrag = await preview.boundingBox();
  if (!previewBeforeDrag) throw new Error("Screenshot preview has no drag geometry");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Screenshot contract requires a fixed viewport");
  const expectedPreviewLeft = viewport.width - previewBeforeDrag.width - 8;
  const expectedPreviewTop = viewport.height - previewBeforeDrag.height - 8;
  if (Math.abs(previewBeforeDrag.x - expectedPreviewLeft) > 0.5 || Math.abs(previewBeforeDrag.y - expectedPreviewTop) > 0.5) {
    throw new Error(`Screenshot preview did not default to the bottom-right 8px inset: ${JSON.stringify({ previewBeforeDrag, viewport, expectedPreviewLeft, expectedPreviewTop })}`);
  }
  const previewHitTest = await preview.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = element.getRootNode();
    const hit = "elementFromPoint" in root
      ? root.elementFromPoint(rect.left + 24, rect.top + 40)
      : null;
    return {
      previewContainsHit: hit ? element.contains(hit) : false,
      hitTag: hit?.tagName ?? null,
      hitDataset: hit instanceof HTMLElement ? { ...hit.dataset } : null,
      previewStyle: {
        left: element.style.left,
        top: element.style.top,
        pointerEvents: getComputedStyle(element).pointerEvents,
      },
      parentPointerEvents: element.parentElement
        ? getComputedStyle(element.parentElement).pointerEvents
        : null,
    };
  });
  await page.mouse.move(previewBeforeDrag.x + 24, previewBeforeDrag.y + 40);
  await page.mouse.down();
  await page.mouse.move(previewBeforeDrag.x - 70, previewBeforeDrag.y - 50, { steps: 6 });
  await page.mouse.up();
  const previewAfterDrag = await preview.boundingBox();
  if (!previewAfterDrag) throw new Error("Screenshot preview disappeared while dragging");
  if (Math.abs(previewAfterDrag.x - previewBeforeDrag.x) < 40 || Math.abs(previewAfterDrag.y - previewBeforeDrag.y) < 25) {
    throw new Error(`Screenshot preview did not move with the pointer: ${JSON.stringify({ previewBeforeDrag, previewAfterDrag, previewHitTest })}`);
  }
  if (previewAfterDrag.x < 8 || previewAfterDrag.y < 8 || previewAfterDrag.x + previewAfterDrag.width > viewport.width - 8 || previewAfterDrag.y + previewAfterDrag.height > viewport.height - 8) {
    throw new Error(`Dragged screenshot preview escaped the 8px viewport clamp: ${JSON.stringify({ previewAfterDrag, viewport })}`);
  }

  await previewImage.click({ position: { x: 28, y: 40 } });
  const viewer = island.locator("[data-mesurer-screenshot-viewer='true']");
  const viewerImage = island.locator("[data-mesurer-screenshot-viewer-image='true']");
  await viewer.waitFor({ state: "visible" });
  const viewerSize = await viewerImage.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  if (viewerSize.width !== 600 || viewerSize.height !== 360) {
    throw new Error(`Expanded screenshot changed dimensions: ${viewerSize.width}x${viewerSize.height}`);
  }
  if (!(await nativeContextMenuIsAvailable(viewerImage))) {
    throw new Error("Expanded screenshot image prevents the native browser context menu");
  }
  const copyButton = island.locator("[data-mesurer-screenshot-viewer-copy='true']");
  const saveButton = island.locator("[data-mesurer-screenshot-viewer-save='true']");
  const closeViewerButton = island.locator("[data-mesurer-screenshot-viewer-close='true']");
  await copyButton.waitFor({ state: "visible" });
  await saveButton.waitFor({ state: "visible" });
  await closeViewerButton.waitFor({ state: "visible" });

  const downloadPromise = page.waitForEvent("download");
  await saveButton.click();
  const download = await downloadPromise;
  if (!/^mesurer-\d{4}-\d{2}-\d{2}-\d{6}\.png$/.test(download.suggestedFilename())) {
    throw new Error(`Screenshot viewer used an unexpected filename: ${download.suggestedFilename()}`);
  }
  if ((await toast.textContent()) !== "Saved screenshot") {
    throw new Error("Screenshot viewer Save action did not report completion");
  }

  await closeViewerButton.click();
  await viewer.waitFor({ state: "hidden" });
  if (!(await preview.isVisible())) throw new Error("Closing the viewer should keep the thumbnail available");

  await previewImage.click({ position: { x: 28, y: 40 } });
  await viewer.waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await viewer.waitFor({ state: "hidden" });
  if (!(await preview.isVisible())) throw new Error("Escape from the viewer should keep the thumbnail available");

  const dismissPreviewButton = island.locator("[data-mesurer-screenshot-preview-dismiss='true']");
  await dismissPreviewButton.click();
  await preview.waitFor({ state: "hidden" });

  const restoredToolbar = await island.locator("[data-mesurer-toolbar='true']").evaluate((element) => getComputedStyle(element).visibility);
  if (restoredToolbar === "hidden") throw new Error("Toolbar visibility was not restored after screenshot capture");

  await screenshotButton.click();
  await page.waitForFunction(() => window.__MESURER_SCREENSHOT_TEST__?.service.active() === true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__MESURER_SCREENSHOT_TEST__?.service.active() === false);
  if (await overlay.isVisible()) throw new Error("Escape did not dismiss screenshot selection");

  const programmatic = await page.evaluate(async () => {
    const service = window.__MESURER_SCREENSHOT_TEST__?.service;
    if (!service) throw new Error("Screenshot service unavailable");
    const result = await service.capture({ left: 100, top: 100, width: 120, height: 80 });
    const bitmap = await createImageBitmap(result.blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return {
      dimensions,
      copied: result.copied,
      downloaded: result.downloaded,
      rect: result.rect,
      settings: service.settings(),
    };
  });
  if (programmatic.dimensions.width !== 240 || programmatic.dimensions.height !== 160) {
    throw new Error(`Programmatic screenshot crop was not HiDPI-scaled: ${JSON.stringify(programmatic)}`);
  }
  if (programmatic.copied || programmatic.downloaded) {
    throw new Error(`Fixture disabled both outputs but reported one as saved: ${JSON.stringify(programmatic)}`);
  }
  if (programmatic.settings.copy || programmatic.settings.download) {
    throw new Error(`Screenshot fixture settings did not persist: ${JSON.stringify(programmatic)}`);
  }
  await preview.waitFor({ state: "visible" });

  const automaticCopyFallback = await page.evaluate(async () => {
    const service = window.__MESURER_SCREENSHOT_TEST__?.service;
    if (!service) throw new Error("Screenshot service unavailable");
    service.setSettings({ copy: true, download: false });
    const result = await service.capture({ left: 140, top: 120, width: 80, height: 60 });
    return {
      copied: result.copied,
      downloaded: result.downloaded,
      size: result.blob.size,
    };
  });
  if (automaticCopyFallback.size <= 0 || automaticCopyFallback.downloaded) {
    throw new Error(`Automatic copy fallback lost the captured PNG: ${JSON.stringify(automaticCopyFallback)}`);
  }
  await preview.waitFor({ state: "visible" });

  if (errors.length) throw new Error(`Screenshot browser errors:\n${errors.join("\n")}`);
  console.log("Screenshot plugin browser contract: PASS");
  console.log(JSON.stringify({
    dragCrop: previewSize,
    viewer: viewerSize,
    programmatic,
    automaticCopyFallback,
  }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
