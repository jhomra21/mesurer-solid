import { chromium } from "playwright";

const url = process.env.COLOR_PICKER_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const diagnostics = [];

const watchDiagnostics = (page, label) => {
  page.on("pageerror", (error) => diagnostics.push(`${label}: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`${label}: ${message.text()}`);
  });
};

const clickLocatorCenter = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Color picker control has no geometry");
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

try {
  const unsupportedPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  watchDiagnostics(unsupportedPage, "unsupported");
  await unsupportedPage.addInitScript(() => {
    Reflect.deleteProperty(window, "EyeDropper");
  });
  await unsupportedPage.goto(url, { waitUntil: "networkidle" });

  const unsupportedHasEyeDropper = await unsupportedPage.evaluate(() => Reflect.has(window, "EyeDropper"));
  if (unsupportedHasEyeDropper) {
    throw new Error("Unsupported Color Picker contract requires EyeDropper to be absent");
  }

  const unavailableButton = unsupportedPage.locator('button[aria-label="Color picker (P)"]');
  await unsupportedPage.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Color picker (P)"]');
    return button instanceof HTMLElement && getComputedStyle(button).display === "none";
  });
  if (await unavailableButton.isVisible()) {
    throw new Error("Color Picker button remained visible without native EyeDropper support");
  }

  await unsupportedPage.keyboard.press("p");
  await unsupportedPage.waitForTimeout(80);
  if (await unsupportedPage.locator(".mesurer-color-picker").count()) {
    throw new Error("Color Picker produced a result without native EyeDropper support");
  }
  if (await unsupportedPage.locator("[data-mesurer-color-picker-fallback='true']").count()) {
    throw new Error("Legacy DOM Color Picker fallback should not exist");
  }
  await unsupportedPage.close();

  const supportedPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  watchDiagnostics(supportedPage, "supported");
  await supportedPage.addInitScript(() => {
    const colors = ["#5eead4", "#818cf8", "#fb7185"];
    Object.defineProperty(window, "__mesurerEyeDropperOpens", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          const index = window.__mesurerEyeDropperOpens;
          window.__mesurerEyeDropperOpens += 1;
          return { sRGBHex: colors[index] ?? colors.at(-1) };
        }
      },
    });
  });
  await supportedPage.goto(url, { waitUntil: "networkidle" });

  const colorButton = supportedPage.getByRole("button", { name: "Color picker (P)" });
  await colorButton.waitFor({ state: "visible" });
  const panel = supportedPage.locator(".mesurer-color-picker");

  await clickLocatorCenter(colorButton);
  await panel.waitFor({ state: "visible" });
  await supportedPage.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#5eead4") === true,
  );
  if ((await panel.getAttribute("data-mesurer-color-picker-mode")) !== "native") {
    throw new Error("Native Color Picker result did not identify native sampling mode");
  }
  if ((await colorButton.getAttribute("aria-pressed")) !== "true") {
    throw new Error("Color Picker button did not remain active after native sampling");
  }

  await clickLocatorCenter(colorButton);
  await supportedPage.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#818cf8") === true,
  );

  await supportedPage.keyboard.press("p");
  await supportedPage.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#fb7185") === true,
  );

  const opens = await supportedPage.evaluate(() => window.__mesurerEyeDropperOpens);
  if (opens !== 3) {
    throw new Error(`Expected three native EyeDropper opens, got ${opens}`);
  }
  if (await supportedPage.locator("[data-mesurer-color-picker-fallback='true']").count()) {
    throw new Error("Legacy DOM Color Picker fallback should not exist when EyeDropper is supported");
  }

  if (diagnostics.length > 0) {
    throw new Error(`Color Picker contract emitted runtime diagnostics:\n${diagnostics.join("\n")}`);
  }

  console.log("Color Picker native capability contract: PASS");
} finally {
  await browser.close();
}
