import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.IFRAME_SELECTION_URL ?? "http://127.0.0.1:4181/iframe-selection.html";
const output = process.env.IFRAME_SELECTION_OUT ?? "iframe-selection-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_IFRAME_TEST__));

  const select = page.locator("[data-mesurer-builtin='select'] button");

  await select.waitFor({ state: "visible" });

  if ((await select.getAttribute("aria-pressed")) !== "true") await select.click();

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector("[data-testid='same-origin-frame']");

    if (!(frame instanceof HTMLIFrameElement)) throw new Error("Missing same-origin iframe fixture");

    const target = frame.contentDocument?.querySelector("[data-testid='frame-target']");

    if (!(target instanceof frame.contentWindow!.Element)) throw new Error("Missing iframe target");

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const scaleX = frameRect.width / frame.offsetWidth;
    const scaleY = frameRect.height / frame.offsetHeight;

    return {
      frame: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
        clientLeft: frame.clientLeft,
        clientTop: frame.clientTop,
        scaleX,
        scaleY,
      },
      target: {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      },
      expected: {
        left: frameRect.left + (frame.clientLeft + targetRect.left) * scaleX,
        top: frameRect.top + (frame.clientTop + targetRect.top) * scaleY,
        width: targetRect.width * scaleX,
        height: targetRect.height * scaleY,
      },
    };
  });

  await page.mouse.click(
    geometry.expected.left + geometry.expected.width / 2,
    geometry.expected.top + geometry.expected.height / 2,
  );

  const selected = page.locator("[data-mesurer-selected-measurement='true']").last();

  await selected.waitFor({ state: "visible", timeout: 5000 });

  const selectedBox = await selected.boundingBox();

  assert(selectedBox, "Selected iframe child must expose rendered measurement geometry");

  for (const [key, actual, expected] of [
    ["left", selectedBox.x, geometry.expected.left],
    ["top", selectedBox.y, geometry.expected.top],
    ["width", selectedBox.width, geometry.expected.width],
    ["height", selectedBox.height, geometry.expected.height],
  ]) {
    assert(
      Math.abs(actual - expected) <= 2,
      `Iframe child ${key} must project into the parent viewport. expected=${expected} actual=${actual}`,
    );
  }

  assert(
    Math.abs(selectedBox.width - geometry.frame.width) > 20,
    "Selection must resolve the iframe child, not the iframe element",
  );

  const screenshotPath = join(output, "iframe-selection.png");

  await page.screenshot({ path: screenshotPath, fullPage: true });

  await writeFile(
    join(output, "iframe-selection.json"),
    `${JSON.stringify({ geometry, selectedBox, errors }, null, 2)}\n`,
    "utf8",
  );

  assert.deepEqual(errors, [], `Iframe contract emitted browser errors: ${errors.join("\n")}`);

  console.log("Same-origin iframe selection contract: PASS");
} finally {
  await browser.close();
}
