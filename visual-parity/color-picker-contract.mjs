import { chromium } from "playwright";

const url = process.env.COLOR_PICKER_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const clickLocatorCenter = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Color picker control has no geometry");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const clickColorTarget = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Color picker target has no geometry");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const fallback = document.querySelector("[data-mesurer-color-picker-fallback='true']");
    if (!(fallback instanceof HTMLElement)) return false;
    fallback.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    fallback.style.pointerEvents = "auto";
    return element?.matches(".swatches b") ?? false;
  }, point);
  if (!hit) throw new Error(`Color picker target is not hit-testable below the fallback overlay at ${JSON.stringify(point)}`);
  await page.mouse.click(point.x, point.y);
};

try {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "EyeDropper");
  });
  await page.goto(url, { waitUntil: "networkidle" });

  const hasEyeDropper = await page.evaluate(() => Reflect.has(window, "EyeDropper"));
  if (hasEyeDropper) {
    throw new Error("Fallback contract requires EyeDropper to be absent");
  }

  const colorButton = page.getByRole("button", { name: "Color picker (P)" });
  await colorButton.waitFor();
  await clickLocatorCenter(colorButton);

  if ((await colorButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Color Picker button did not become active");
  }

  let fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  if ((await fallback.getAttribute("data-mesurer-color-picker-mode")) !== "dom-fallback") {
    throw new Error("Fallback surface did not identify DOM fallback sampling mode");
  }
  const fallbackCursor = await fallback.evaluate((element) => getComputedStyle(element).cursor);
  if (fallbackCursor !== "crosshair") {
    throw new Error(`Color Picker fallback did not expose a crosshair cursor: ${fallbackCursor}`);
  }

  const readyStatus = page.getByRole("status", { name: "Color picker ready" });
  await readyStatus.waitFor({ state: "visible" });
  const readyText = (await readyStatus.textContent()) ?? "";
  if (!readyText.includes("Pick a color on the page")) {
    throw new Error(`Color Picker did not visibly explain fallback picking: ${readyText}`);
  }

  const secondSwatch = page.locator(".swatches b").nth(1);
  await clickColorTarget(secondSwatch);
  await fallback.waitFor({ state: "detached" });

  const panel = page.locator(".mesurer-color-picker");
  await panel.waitFor({ state: "visible" });
  const firstResult = (await panel.textContent()) ?? "";
  if (!firstResult.includes("#818cf8")) {
    throw new Error(`Color Picker fallback sampled the wrong color: ${firstResult}`);
  }
  if (!firstResult.includes("P or Color Picker to pick again")) {
    throw new Error(`Color Picker fallback result did not explain how to repick: ${firstResult}`);
  }
  if ((await panel.getAttribute("data-mesurer-color-picker-mode")) !== "dom-fallback") {
    throw new Error("Fallback result did not preserve DOM fallback sampling provenance");
  }
  if ((await colorButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Color Picker result should remain active after sampling");
  }

  // A real pointer press on the already-active toolbar button must start another pick.
  await clickLocatorCenter(colorButton);
  fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  await readyStatus.waitFor({ state: "visible" });
  if (await panel.count()) {
    throw new Error("Pressing Color Picker again should clear the previous result while repicking");
  }
  const thirdSwatch = page.locator(".swatches b").nth(2);
  await clickColorTarget(thirdSwatch);
  await fallback.waitFor({ state: "detached" });
  await panel.waitFor({ state: "visible" });
  const secondResult = (await panel.textContent()) ?? "";
  if (!secondResult.includes("#fb7185")) {
    throw new Error(`Repeated toolbar Color Picker sampled the wrong color: ${secondResult}`);
  }

  await page.keyboard.press("p");
  fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  await readyStatus.waitFor({ state: "visible" });
  if (await panel.count()) {
    throw new Error("Starting a keyboard fallback pick should clear the previous result panel");
  }

  await page.keyboard.press("Escape");
  await fallback.waitFor({ state: "detached" });
  if ((await colorButton.getAttribute("aria-pressed")) !== "false") {
    throw new Error("Escape did not cancel Color Picker fallback state");
  }

  await page.keyboard.press("p");
  fallback = page.locator("[data-mesurer-color-picker-fallback='true']");
  await fallback.waitFor({ state: "visible" });
  const firstSwatch = page.locator(".swatches b").nth(0);
  await clickColorTarget(firstSwatch);
  await fallback.waitFor({ state: "detached" });
  await panel.waitFor({ state: "visible" });
  const keyboardResult = (await panel.textContent()) ?? "";
  if (!keyboardResult.includes("#5eead4")) {
    throw new Error(`Keyboard Color Picker fallback sampled the wrong color: ${keyboardResult}`);
  }

  if (errors.length > 0) {
    throw new Error(`Color Picker fallback emitted runtime diagnostics:\n${errors.join("\n")}`);
  }

  console.log("Color Picker browser fallback contract: PASS");
} finally {
  await browser.close();
}
