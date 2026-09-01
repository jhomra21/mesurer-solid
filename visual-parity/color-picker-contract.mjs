import { chromium } from "playwright";

const url = process.env.COLOR_PICKER_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const clickCenter = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Color picker target has no geometry");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

try {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "EyeDropper");
  });
  await page.goto(url, { waitUntil: "networkidle" });

  const eyeDropperType = await page.evaluate(() => typeof window.EyeDropper);
  if (eyeDropperType !== "undefined") {
    throw new Error(`Fallback contract requires EyeDropper to be absent, got ${eyeDropperType}`);
  }

  const colorButton = page.getByRole("button", { name: "Color picker (P)" });
  await colorButton.waitFor();
  await colorButton.click();

  if ((await colorButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Color Picker button did not become active");
  }

  let fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  const fallbackCursor = await fallback.evaluate((element) => getComputedStyle(element).cursor);
  if (fallbackCursor !== "crosshair") {
    throw new Error(`Color Picker fallback did not expose a crosshair cursor: ${fallbackCursor}`);
  }

  const secondSwatch = page.locator(".swatches b").nth(1);
  await clickCenter(secondSwatch);
  await fallback.waitFor({ state: "detached" });

  const panel = page.locator(".mesurer-color-picker");
  await panel.waitFor({ state: "visible" });
  const firstResult = (await panel.textContent()) ?? "";
  if (!firstResult.includes("#818cf8")) {
    throw new Error(`Color Picker fallback sampled the wrong color: ${firstResult}`);
  }
  if ((await colorButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Color Picker result should remain active after sampling");
  }

  await page.keyboard.press("p");
  fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  if (await panel.count()) {
    throw new Error("Starting a new fallback pick should clear the previous result panel");
  }

  await page.keyboard.press("Escape");
  await fallback.waitFor({ state: "detached" });
  if ((await colorButton.getAttribute("aria-pressed")) !== "false") {
    throw new Error("Escape did not cancel Color Picker fallback state");
  }

  await page.keyboard.press("p");
  fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  const thirdSwatch = page.locator(".swatches b").nth(2);
  await clickCenter(thirdSwatch);
  await fallback.waitFor({ state: "detached" });
  await panel.waitFor({ state: "visible" });
  const secondResult = (await panel.textContent()) ?? "";
  if (!secondResult.includes("#fb7185")) {
    throw new Error(`Keyboard Color Picker fallback sampled the wrong color: ${secondResult}`);
  }

  if (errors.length > 0) {
    throw new Error(`Color Picker fallback emitted runtime diagnostics:\n${errors.join("\n")}`);
  }

  console.log("Color Picker browser fallback contract: PASS");
} finally {
  await browser.close();
}
