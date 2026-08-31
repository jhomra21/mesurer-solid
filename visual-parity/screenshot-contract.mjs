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
  if ((await screenshotButton.getAttribute("aria-label")) !== "Screenshot (Shift+S)") {
    throw new Error("Screenshot plugin tool did not mount with the expected shortcut in its accessible label");
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
      ? root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : null;
    return hit === element || (hit instanceof Element && element.contains(hit));
  });
  if (!previewHitTest) throw new Error("Screenshot preview is not above the page for pointer interaction");
  if (await nativeContextMenuIsAvailable(preview)) {
    throw new Error("Screenshot preview chrome should suppress the native context menu");
  }

  await page.mouse.move(previewBeforeDrag.x + previewBeforeDrag.width / 2, previewBeforeDrag.y + 10);
  await page.mouse.down();
  await page.mouse.move(850, 250, { steps: 8 });
  await page.mouse.up();
  const previewAfterDrag = await preview.boundingBox();
  if (!previewAfterDrag) throw new Error("Screenshot preview disappeared after drag");
  if (Math.abs(previewAfterDrag.x - previewBeforeDrag.x) < 10 && Math.abs(previewAfterDrag.y - previewBeforeDrag.y) < 10) {
    throw new Error("Screenshot preview did not move after dragging");
  }

  const closeButton = island.getByRole("button", { name: "Close screenshot preview" });
  await closeButton.click();
  await preview.waitFor({ state: "hidden" });

  const screenshotOptions = island.getByRole("button", { name: "Screenshot options" });
  await screenshotOptions.click();
  const screenshotMenu = island.getByRole("menu", { name: "Screenshot options" });
  await screenshotMenu.waitFor({ state: "visible" });
  const autoCopy = screenshotMenu.getByRole("menuitemcheckbox", { name: "Auto-copy" });
  await autoCopy.click();
  await screenshotMenu.waitFor({ state: "hidden" });

  if (errors.length > 0) {
    throw new Error(`Screenshot contract emitted runtime diagnostics:\n${errors.join("\n")}`);
  }

  console.log("Screenshot browser contract: PASS");
} finally {
  await browser.close();
}
