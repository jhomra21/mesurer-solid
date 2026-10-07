import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.MOTION_URL ?? "http://127.0.0.1:4179/motion-contract.html";

const output = process.env.MOTION_OUT ?? "motion-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const selectTarget = async (selector) => {
  const target = page.locator(selector);
  await target.waitFor({ state: "visible" });
  const box = await target.boundingBox();

  assert(box, `Expected rendered target geometry for ${selector}`);
  await page.mouse.click(
    box.x + Math.max(8, box.width - 24),
    box.y + box.height / 2,
  );
  await settle();
};

const readAnimation = (selector) => page.evaluate(
  (target) => window.__MESURER_MOTION_TEST__?.stateFor(target)[0] ?? null,
  selector,
);

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_MOTION_TEST__));

  const select = page.locator("[data-mesurer-builtin='select'] button");

  await select.waitFor({ state: "visible" });

  if ((await select.getAttribute("aria-pressed")) !== "true") await select.click();

  await selectTarget("[data-testid='css-motion']");

  const player = page.locator("[data-mesurer-motion-player='true']");
  const details = player.locator("[data-mesurer-motion-details='true']");
  const inspect = player.locator("[data-mesurer-motion-inspect='true']");
  const play = player.locator("[data-mesurer-motion-play='true']");
  const scrubber = player.locator("[data-mesurer-motion-scrubber='true']");
  const speed = player.locator("[data-mesurer-motion-speed='true']");

  const preflight = await page.evaluate(() => {
    const target = document.querySelector("[data-testid='css-motion']");
    const toolbar = document.querySelector("[data-mesurer-toolbar='true']");
    const surface = document.querySelector("[data-mesurer-motion-surface='true']");
    const selected = document.querySelectorAll("[data-mesurer-selection-box='true'], [data-mesurer-selected='true']");

    return {
      targetAnimations: target instanceof Element
        ? target.getAnimations({ subtree: true }).map((animation) => ({
            id: animation.id,
            playState: animation.playState,
            currentTime: Number(animation.currentTime),
            timing: animation.effect?.getTiming() ?? null,
            keyframes: animation.effect && "getKeyframes" in animation.effect
              ? animation.effect.getKeyframes()
              : [],
          }))
        : [],
      toolbar: toolbar?.outerHTML ?? null,
      motionSurface: surface?.outerHTML ?? null,
      selectionMarkers: selected.length,
    };
  });

  await writeFile(
    join(output, "motion-preflight.json"),
    `${JSON.stringify({ preflight, errors }, null, 2)}\n`,
    "utf8",
  );

  await page.screenshot({
    path: join(output, "motion-preflight.png"),
    fullPage: true,
  });

  await player.waitFor({ state: "visible", timeout: 5000 });
  await scrubber.waitFor({ state: "visible" });

  assert.equal(
    await inspect.getAttribute("aria-expanded"),
    "false",
    "Motion details must start collapsed like upstream",
  );

  await inspect.click();
  await details.waitFor({ state: "visible" });

  const cssText = (await details.textContent()) ?? "";

  assert.match(cssText, /mesurer-contract-pulse/i, "Motion details must name the selected CSS animation");
  assert.match(cssText, /2(?:\.0)?s|2000ms/i, "Motion details must show the CSS animation duration");
  assert.match(cssText, /opacity/i, "Motion details must include animated properties");

  const playerBox = await player.boundingBox();

  assert(playerBox, "Motion player must have rendered geometry");
  assert(
    Math.abs(playerBox.width - 352) <= 2,
    `Motion player must use the upstream 22rem width, got ${playerBox.width}px`,
  );

  await play.click();
  await page.waitForFunction(() =>
    window.__MESURER_MOTION_TEST__?.stateFor("[data-testid='css-motion']")[0]?.playState === "paused"
  );

  const paused = await readAnimation("[data-testid='css-motion']");

  assert.equal(paused?.playState, "paused", "Pause must control the selected CSS animation");

  await scrubber.evaluate((element) => {
    const input = element;

    input.value = "0.75";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await settle();

  const scrubbed = await readAnimation("[data-testid='css-motion']");

  assert(scrubbed?.currentTime !== null, "Scrubbing must expose a numeric animation currentTime");
  assert(
    scrubbed.currentTime >= 1400 && scrubbed.currentTime <= 1600,
    `Scrubbing to 75% of a 2s animation must seek near 1500ms, got ${scrubbed.currentTime}`,
  );
  assert.equal(scrubbed.playState, "paused", "Scrubbing must leave motion paused");

  await speed.click();
  const speedMenu = player.locator("[data-mesurer-motion-speed-menu='true']");

  await speedMenu.waitFor({ state: "visible" });
  await speedMenu.locator("[data-mesurer-motion-speed-option='0.5']").click();
  await settle();

  const slowed = await readAnimation("[data-testid='css-motion']");

  assert.equal(slowed?.playbackRate, 0.5, "Motion speed control must set playbackRate to 0.5");

  await play.click();
  await page.waitForFunction(() =>
    window.__MESURER_MOTION_TEST__?.stateFor("[data-testid='css-motion']")[0]?.playState === "running"
  );

  await selectTarget("[data-testid='web-motion']");
  await player.waitFor({ state: "visible" });

  if ((await inspect.getAttribute("aria-expanded")) !== "true") {
    await inspect.click();
  }

  await details.waitFor({ state: "visible" });

  const webText = (await details.textContent()) ?? "";

  assert.match(
    webText,
    /mesurer-contract-web-animation|web animation/i,
    "Motion player must inspect a selected Web Animations API target",
  );

  const webBefore = await readAnimation("[data-testid='web-motion']");

  await play.click();
  await page.waitForFunction((beforeState) => {
    const current = window.__MESURER_MOTION_TEST__?.stateFor("[data-testid='web-motion']")[0];

    return current?.playState === (beforeState === "running" ? "paused" : "running");
  }, webBefore?.playState ?? "running");

  const screenshotPath = join(output, "motion-player.png");

  await page.screenshot({ path: screenshotPath, fullPage: true });

  await selectTarget("[data-testid='static-target']");
  await player.waitFor({ state: "hidden" });

  const report = {
    css: {
      paused,
      scrubbed,
      slowed,
    },
    web: webBefore,
    player: {
      width: playerBox.width,
      details: cssText,
    },
    diagnostics: errors,
  };

  await writeFile(
    join(output, "motion-contract.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  assert.deepEqual(errors, [], `Motion contract emitted browser errors: ${errors.join("\n")}`);

  console.log("Motion inspection contract: PASS");
} finally {
  await browser.close();
}
