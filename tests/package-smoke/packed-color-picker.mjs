import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const output = process.env.PACKED_COLOR_PICKER_OUT ?? "packed-color-picker-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

const createPage = async (supported) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.addInitScript((enabled) => {
    if (!enabled) {
      Reflect.deleteProperty(window, "EyeDropper");

      return;
    }

    const samples = ["#5eead4", "#818cf8", "#fb7185"];

    Object.defineProperty(window, "__packedColorPickerOpens", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(window, "__packedClipboardWrites", {
      configurable: true,
      writable: true,
      value: [],
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          window.__packedClipboardWrites.push(value);
        },
      },
    });
    Object.defineProperty(window, "EyeDropper", {
      configurable: true,
      value: class {
        async open() {
          const index = window.__packedColorPickerOpens++;

          return { sRGBHex: samples[index] ?? samples.at(-1) };
        }
      },
    });
  }, supported);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && document.querySelector("[data-mesurer-island='true']")));
  await page.locator("[data-mesurer-toolbar='true']").waitFor({ state: "visible" });

  return page;
};

try {
  const unsupported = await createPage(false);

  assert.equal(
    await unsupported.getByRole("button", { name: "Color picker (P)" }).count(),
    0,
    "Packed consumer exposed Color Picker without native EyeDropper support",
  );
  await unsupported.keyboard.press("p");
  assert.equal(await unsupported.locator(".mesurer-color-picker").count(), 0);
  await unsupported.close();

  const supported = await createPage(true);
  const picker = supported.getByRole("button", { name: "Color picker (P)" });
  const panel = supported.locator(".mesurer-color-picker");

  await picker.waitFor({ state: "visible" });
  const buttonBox = await picker.boundingBox();

  assert(buttonBox, "Packed consumer Color Picker button has no physical geometry");

  const clickPicker = async () => {
    const box = await picker.boundingBox();

    assert(box, "Packed Color Picker lost its button geometry");
    await supported.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  await clickPicker();
  await panel.waitFor({ state: "visible" });
  await supported.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#5eead4") === true,
  );

  assert.equal(await panel.getAttribute("data-mesurer-color-picker-mode"), "native");
  assert.equal(await picker.getAttribute("aria-pressed"), "true");
  assert.deepEqual(await supported.evaluate(() => window.__packedClipboardWrites), ["#5eead4"]);

  const panelBox = await panel.boundingBox();

  assert(panelBox && panelBox.width > 0 && panelBox.height > 0, "Packed Color Picker panel has no visible geometry");

  await supported.screenshot({ path: join(output, "packed-color-picker.png") });

  await clickPicker();
  await panel.waitFor({ state: "detached" });
  assert.equal(await picker.getAttribute("aria-pressed"), "false");
  assert.equal(await supported.evaluate(() => window.__packedColorPickerOpens), 1);

  await clickPicker();
  await supported.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#818cf8") === true,
  );

  await supported.keyboard.press("p");
  await supported.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#fb7185") === true,
  );

  const results = await supported.evaluate(() => ({
    opens: window.__packedColorPickerOpens,
    clipboardWrites: window.__packedClipboardWrites,
    mode: document.querySelector(".mesurer-color-picker")?.getAttribute("data-mesurer-color-picker-mode"),
    version: window.__MESURER__?.version ?? null,
  }));

  assert.equal(results.opens, 3);
  assert.equal(results.mode, "native");
  assert.deepEqual(results.clipboardWrites, ["#5eead4", "#818cf8", "#fb7185"]);
  assert.deepEqual(errors, [], `Packed consumer Color Picker browser errors: ${errors.join("\n")}`);

  await writeFile(join(output, "result.json"), `${JSON.stringify({
    packageHost: url,
    unsupportedHidden: true,
    buttonBox,
    panelBox,
    ...results,
    errors,
  }, null, 2)}\n`, "utf8");

  console.log("Packed Solid 2 consumer Color Picker physical E2E: PASS");
  await supported.close();
} finally {
  await browser.close();
}
