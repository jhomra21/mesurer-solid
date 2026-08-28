import { chromium } from "playwright";

const url = process.env.SCREENSHOT_URL ?? "http://127.0.0.1:4174/screenshot.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
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
  await preview.waitFor({ state: "visible" });
  const previewSize = await preview.locator("img").evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  if (previewSize.width !== 600 || previewSize.height !== 360) {
    throw new Error(`Expected 2x cropped PNG dimensions 600x360, got ${previewSize.width}x${previewSize.height}`);
  }

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

  if (errors.length) throw new Error(`Screenshot browser errors:\n${errors.join("\n")}`);
  console.log("Screenshot plugin browser contract: PASS");
  console.log(JSON.stringify({ dragCrop: previewSize, programmatic }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
