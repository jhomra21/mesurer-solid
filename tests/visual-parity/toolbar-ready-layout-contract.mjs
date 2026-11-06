import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// `await mounted.ready` promises a toolbar that is present and already laid out.
// Failure modes this contract catches, each seen on a fresh load:
//   1. the toolbar is not visible within a couple of frames of `ready` resolving;
//   2. a button is added after the toolbar first shows (late plugin tool, late Color Picker);
//   3. a button moves or resizes after the toolbar first shows (mode-stage width still animating toward a larger panel);
//   4. a click on Settings right after `ready` lands on another button because 2 or 3 happened.
const origin = process.env.TOOLBAR_READY_ORIGIN ?? "http://127.0.0.1:4174";

const output = process.env.TOOLBAR_READY_OUT ?? "toolbar-ready-layout-artifacts";

const loads = Number(process.env.TOOLBAR_READY_LOADS ?? 20);

const observeMs = Number(process.env.TOOLBAR_READY_OBSERVE_MS ?? 1000);

// Each fixture sets a window flag after `await mounted.ready`. Together they cover an unisolated
// mount and an isolated ShadowRoot mount.
const fixtures = [
  { name: "placement", path: "/toolbar-placement-contract.html?none=1", flag: "__TOOLBAR_READY__" },
  { name: "isolated", path: "/keyboard-ownership.html?capture", flag: "__KB__" },
];

const viewport = { width: 1280, height: 800 };

const TOLERANCE = 0.5;

const MAX_HIDDEN_FRAMES_AFTER_READY = 2;

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const errors = [];

const openPage = async (flag, sampling) => {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning" || message.text().includes("[STRICT_")) errors.push(message.text());
  });

  if (sampling) await page.addInitScript(installSampler, flag);

  return page;
};

// Samples every frame once ready. Buttons are keyed by their stable id so a reorder also counts as a change.
function installSampler(flag) {
  window.__SAMPLES__ = [];
  window.__SAMPLING__ = true;

  const toolbarRoot = () => {
    const direct = document.querySelector("[data-mesurer-toolbar='true']");

    if (direct) return direct;

    for (const host of document.querySelectorAll("[data-mesurer-island]")) {
      const found = host.shadowRoot?.querySelector("[data-mesurer-toolbar='true']");

      if (found) return found;
    }

    return null;
  };

  const keyOf = (button, index) =>
    button.getAttribute("data-mesurer-tool-id")
    ?? button.getAttribute("data-mesurer-builtin")
    ?? button.getAttribute("data-mesurer-toolbar-mode")
    ?? button.getAttribute("aria-label")
    ?? `button-${index}`;

  const tick = () => {
    if (!window.__SAMPLING__) return;

    if (window[flag]) {
      const toolbar = toolbarRoot();
      const visible = Boolean(toolbar) && getComputedStyle(toolbar).visibility !== "hidden" && toolbar.getClientRects().length > 0;

      window.__SAMPLES__.push({
        t: performance.now(),
        visible,
        buttons: visible
          ? [...toolbar.querySelectorAll("button")].map((button, index) => {
            const box = button.getBoundingClientRect();

            return { key: `${keyOf(button, index)}#${index}`, x: box.x, y: box.y, width: box.width, height: box.height };
          })
          : [],
      });
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

const firstDifference = (samples) => {
  const first = samples[0];
  const firstKeys = first.buttons.map((button) => button.key);

  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    const keys = sample.buttons.map((button) => button.key);

    if (!sample.visible) return `+${Math.round(sample.t - first.t)}ms: toolbar hid again`;

    if (keys.join("|") !== firstKeys.join("|")) {
      const added = keys.filter((key) => !firstKeys.includes(key));
      const removed = firstKeys.filter((key) => !keys.includes(key));

      return `+${Math.round(sample.t - first.t)}ms: button set changed, added [${added}] removed [${removed}]`;
    }

    for (let position = 0; position < keys.length; position += 1) {
      const before = first.buttons[position];
      const now = sample.buttons[position];

      for (const axis of ["x", "y", "width", "height"]) {
        if (Math.abs(now[axis] - before[axis]) > TOLERANCE) {
          return `+${Math.round(sample.t - first.t)}ms: ${before.key} ${axis} ${before[axis].toFixed(1)} -> ${now[axis].toFixed(1)}`;
        }
      }
    }
  }

  return null;
};

const layoutFailures = [];

const clickFailures = [];

const evidence = [];

try {
  for (const fixture of fixtures) {
    const url = `${origin}${fixture.path}`;

    for (let load = 0; load < loads; load += 1) {
      const page = await openPage(fixture.flag, true);

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((flag) => window[flag] === true || Boolean(window[flag]), fixture.flag, { timeout: 15000 });
      await page.waitForTimeout(observeMs);

      const samples = await page.evaluate(() => {
        window.__SAMPLING__ = false;

        return window.__SAMPLES__;
      });

      const label = `${fixture.name} load ${load}`;
      const firstVisible = samples.findIndex((sample) => sample.visible);

      if (samples.length < 10) {
        layoutFailures.push(`${label}: only ${samples.length} frames sampled after ready`);
      } else if (firstVisible < 0) {
        layoutFailures.push(`${label}: toolbar never became visible after ready`);
      } else if (firstVisible > MAX_HIDDEN_FRAMES_AFTER_READY) {
        layoutFailures.push(`${label}: toolbar was still hidden ${firstVisible} frames after ready`);
      } else {
        const visibleSamples = samples.slice(firstVisible);
        const difference = firstDifference(visibleSamples);

        if (difference) layoutFailures.push(`${label}: ${difference}`);
        evidence.push({
          fixture: fixture.name,
          load,
          frames: visibleSamples.length,
          hiddenFramesAfterReady: firstVisible,
          buttons: visibleSamples[0].buttons.length,
          settingsX: visibleSamples[0].buttons.find((button) => button.key.startsWith("settings"))?.x,
        });
      }

      await page.close();
    }

    for (let load = 0; load < loads; load += 1) {
      const page = await openPage(fixture.flag, false);

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((flag) => Boolean(window[flag]), fixture.flag, { timeout: 15000 });

      const settings = page.locator("button[data-mesurer-builtin='settings']");
      await settings.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      const box = await settings.boundingBox();

      if (!box) {
        clickFailures.push(`${fixture.name} load ${load}: Settings is not visible right after ready`);
        await page.close();
        continue;
      }

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(400);

      if (!await page.getByRole("dialog", { name: "Settings" }).isVisible()) {
        clickFailures.push(`${fixture.name} load ${load}: clicking Settings at x=${Math.round(box.x)} right after ready did not open it`);
      }

      await page.close();
    }
  }

  await writeFile(`${output}/toolbar-ready-layout.json`, JSON.stringify({ viewport, loads, observeMs, layoutFailures, clickFailures, evidence }, null, 2));

  assert.deepEqual(layoutFailures, [], `Toolbar layout must not change after ready:\n${layoutFailures.join("\n")}`);
  assert.deepEqual(clickFailures, [], `Settings must open on the first click after ready:\n${clickFailures.join("\n")}`);
  assert.deepEqual(errors, [], `Browser diagnostics stay clean: ${errors.join("\n")}`);
  console.log(`Toolbar ready-layout contract passed: ${fixtures.length} fixtures x ${loads} sampled loads and first-click loads.`);
} finally {
  await browser.close();
}
