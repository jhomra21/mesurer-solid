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

  const scrubberBox = await scrubber.boundingBox();

  assert(scrubberBox, "Motion scrubber must have rendered geometry");
  const scrubY = scrubberBox.y + scrubberBox.height / 2;
  const scrubX = scrubberBox.x + scrubberBox.width * 0.75;

  await page.mouse.move(scrubX, scrubY);
  await page.mouse.down();
  await page.mouse.up();
  await settle();

  const scrubSemantics = await scrubber.evaluate((element) => ({
    role: element.getAttribute("role"),
    value: Number(element.getAttribute("aria-valuenow")),
    max: Number(element.getAttribute("aria-valuemax")),
    playhead: element.querySelector(".mesurer-recording-playhead")?.getBoundingClientRect().width ?? 0,
  }));

  assert.equal(scrubSemantics.role, "slider");
  assert(Math.abs(scrubSemantics.value - 1500) <= 100, `Scrub semantics wrong: ${JSON.stringify(scrubSemantics)}`);
  assert(scrubSemantics.playhead > 0, "Motion timeline playhead must paint");

  await scrubber.focus();
  await page.keyboard.press("Home");
  await settle();

  const home = await readAnimation("[data-testid='css-motion']");

  assert(home?.currentTime !== null && home.currentTime <= 50, `Home should seek to start: ${JSON.stringify(home)}`);
  await page.keyboard.press("End");
  await settle();

  const end = await readAnimation("[data-testid='css-motion']");

  assert(end?.currentTime !== null && end.currentTime >= 1950, `End should seek to finish: ${JSON.stringify(end)}`);
  await page.mouse.click(scrubX, scrubY);
  await settle();

  const scrubbed = await readAnimation("[data-testid='css-motion']");

  assert(scrubbed?.currentTime !== null, "Scrubbing must expose a numeric animation currentTime");
  assert(
    scrubbed.currentTime >= 1400 && scrubbed.currentTime <= 1600,
    `Scrubbing to 75% of a 2s animation must seek near 1500ms, got ${scrubbed.currentTime}`,
  );
  assert.equal(scrubbed.playState, "paused", "Scrubbing must leave motion paused");

  await speed.selectOption("0.5");
  await settle();

  const slowed = await readAnimation("[data-testid='css-motion']");

  assert.equal(slowed?.playbackRate, 0.5, "Motion preset must set playbackRate to 0.5");

  await speed.selectOption("custom");
  const customSpeed = player.getByRole("dialog", { name: "Custom playback speed" });

  await customSpeed.waitFor({ state: "visible" });
  const customValue = customSpeed.getByRole("spinbutton", { name: "Custom playback speed value" });

  await customValue.fill("1.75");
  await customValue.press("Tab");
  await settle();

  const customPlayback = await readAnimation("[data-testid='css-motion']");

  assert.equal(customPlayback?.playbackRate, 1.75, "Motion custom speed must control playbackRate");
  await page.keyboard.press("Escape");
  await customSpeed.waitFor({ state: "hidden" });
  assert.equal(await speed.evaluate((element) => document.activeElement === element), true, "Escape must restore speed select focus");

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
