import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";

const output = process.env.PACKED_COLOR_PICKER_OUT ?? "packed-color-picker-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const errors = [];

let stage = "initialize";

let activePage = null;

const createPage = async (supported) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  activePage = page;
  stage = supported ? "start supported consumer" : "start unsupported consumer";

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
  stage = "unsupported fixture";
  const unsupported = await createPage(false);

  assert.equal(
    await unsupported.getByRole("button", { name: "Color picker (P)" }).count(),
    0,
    "Packed consumer exposed Color Picker without native EyeDropper support",
  );
  await unsupported.keyboard.press("p");
  assert.equal(await unsupported.locator(".mesurer-color-picker").count(), 0);
  await unsupported.close();

  stage = "supported fixture";
  const supported = await createPage(true);
  const picker = supported.getByRole("button", { name: "Color picker (P)" });
  const panel = supported.locator(".mesurer-color-picker");

  stage = "wait for native Color Picker button";
  await picker.waitFor({ state: "visible" });
  const buttonBox = await picker.boundingBox();

  assert(buttonBox, "Packed consumer Color Picker button has no physical geometry");

  const clickPicker = async () => {
    const box = await picker.boundingBox();

    assert(box, "Packed Color Picker lost its button geometry");
    await supported.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  stage = "open EyeDropper and render first native result";
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

  stage = "toggle native Color Picker off";
  await clickPicker();
  await panel.waitFor({ state: "detached" });
  assert.equal(await picker.getAttribute("aria-pressed"), "false");
  assert.equal(await supported.evaluate(() => window.__packedColorPickerOpens), 1);

  stage = "reopen native Color Picker";
  await clickPicker();
  await supported.waitForFunction(() =>
    document.querySelector(".mesurer-color-picker")?.textContent?.includes("#818cf8") === true,
  );

  stage = "restart EyeDropper with P shortcut";
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
} catch (error) {
  const snapshot = await activePage?.evaluate(() => ({
    location: location.href,
    ready: Boolean(window.__HOST_READY__),
    eyeDropperAvailable: Boolean(window.EyeDropper),
    island: Boolean(document.querySelector("[data-mesurer-island='true']")),
    picker: document.querySelector("button[aria-label='Color picker (P)']")?.outerHTML.slice(0, 700) ?? null,
    panel: document.querySelector(".mesurer-color-picker")?.outerHTML.slice(0, 1000) ?? null,
    opens: window.__packedColorPickerOpens,
    writes: window.__packedClipboardWrites,
  })).catch(() => null);

  await writeFile(join(output, "failure.json"), `${JSON.stringify({
    stage,
    snapshot,
    errors,
    message: String(error),
  }, null, 2)}\n`, "utf8");

  throw new Error(`Packed browser Color Picker failed at ${stage}: ${String(error)}`, { cause: error });
} finally {
  await browser.close();
}
