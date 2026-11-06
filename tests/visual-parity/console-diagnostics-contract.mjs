// Console diagnostics contract.
//
// Every examples/basic fixture page is loaded in a fresh browser context and
// driven through the common Mesurer tools. Any console warning, console error,
// page error, failed request, HTTP error, or Vite error overlay fails the run.
// Solid dev diagnostics (EFFECT_WRITES_OWN_SOURCE, NO_OWNER_CLEANUP,
// UNSTABLE_LIST_IDENTITY, ...) arrive as console warnings, so a clean run proves
// the exercised paths raise none.
//
// Ways this contract could fail (written before the code):
//  1. A page logs console.warn/console.error/console.assert while mounting or
//     while a tool is used: recorded in `messages` with page, step, and location.
//  2. A page throws an uncaught exception or unhandled rejection (`pageerror`).
//  3. A request fails or answers >= 400 (missing module, 404 asset).
//  4. Vite shows its error overlay (`vite-error-overlay`) for a transform error.
//  5. The renderer crashes (`crash` event).
//  6. A page never mounts Mesurer, so no interaction would reach the UI: the
//     toolbar is required on every page except the explicit registry harness.
//  7. An interaction step throws (selector missing, timeout) or does not change
//     what it claims to change (a selection never appears): recorded as failed
//     and fails the run.
//  8. A required interaction never ran on any page (for example Settings never
//     opened, or Edit never moved an element): checked from the artifact so a
//     silent no-op cannot pass.
//  9. The page list drifts: pages are discovered from examples/basic/*.html, so
//     a new fixture is covered without editing this file.
// 10. Messages are hidden by filtering: only Vite's own `[vite] connecting...`
//     and `[vite] connected.` lines are ignored, by exact text and only for the
//     debug/log console types.
// 11. The artifact is missing or reports messages that the process exit code
//     ignored: the artifact is written before the exit code is decided and the
//     exit code derives from the same arrays.

import assert from "node:assert/strict";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = (process.env.CONSOLE_DIAGNOSTICS_URL ?? "http://127.0.0.1:4174/").replace(/\/?$/, "/");

const output = process.env.CONSOLE_DIAGNOSTICS_OUT ?? "console-diagnostics-artifacts";

const mode = process.env.CONSOLE_DIAGNOSTICS_MODE ?? "dev";

const dprs = (process.env.CONSOLE_DIAGNOSTICS_DPRS ?? "1,1.25").split(",").map(Number);

const only = process.env.CONSOLE_DIAGNOSTICS_PAGES?.split(",").filter(Boolean);

const examples = fileURLToPath(new URL("../../examples/basic/", import.meta.url));

const discovered = (await readdir(examples)).filter((name) => name.endsWith(".html")).sort();

assert(discovered.length > 0, "No examples/basic fixture pages were discovered");

const pages = only ?? discovered;

// This fixture tests a plain module and never mounts Mesurer.
const WITHOUT_MESURER = new Set(["extension-active-tabs.html"]);

const IGNORED_VITE_LINES = new Set(["[vite] connecting...", "[vite] connected."]);

const FAILING_CONSOLE_TYPES = new Set(["warning", "error", "assert"]);

const TOOLBAR = "[data-mesurer-toolbar='true']";

const messages = [];

const visited = [];

const interactionFailures = [];

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const fail = (name, step, error) => interactionFailures.push({ page: name, step, error: String(error?.message ?? error) });

const exercise = async (page, name, state) => {
  const steps = [];

  const step = async (label, run) => {
    state.step = label;

    try {
      const result = await run();

      steps.push({ step: label, performed: result !== false });
    } catch (error) {
      steps.push({ step: label, performed: false, error: String(error?.message ?? error).split("\n").slice(0, 3).join(" | ") });
      fail(name, label, error);
    }
  };

  const toolbar = page.locator(TOOLBAR).first();

  await step("mount toolbar", async () => {
    await toolbar.waitFor({ state: "attached", timeout: 15_000 });
    await page.evaluate(() => window.__MESURER__?.ready?.());
  });

  // A short settle gives mount-time effects (and their diagnostics) time to run.
  await page.waitForTimeout(400);

  // A point on a visible page element that Mesurer UI does not cover.
  const pick = async () => page.evaluate((bar) => {
    const inMesurer = (element) => Boolean(element.closest("[data-mesurer-island],[data-mesurer-root],[data-mesurer-toolbar]"));

    // Text-level elements first: page-wide containers are not useful selection targets.
    const candidates = [
      ...document.querySelectorAll("h1, h2, h3, button, p, a"),
      ...document.querySelectorAll("article, section, div, span"),
    ];

    for (const element of candidates) {
      if (inMesurer(element)) continue;

      const rect = element.getBoundingClientRect();

      if (rect.width < 40 || rect.height < 16 || rect.left < 0 || rect.top < 0) continue;

      if (rect.right > innerWidth || rect.bottom > innerHeight) continue;

      for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.1, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * fy;

        // The toolbar lives in a shadow root, so its rect comes from Playwright.
        if (bar && x > bar.x - 8 && x < bar.x + bar.width + 8 && y > bar.y - 8 && y < bar.y + bar.height + 8) continue;

        // Tool overlays can sit on top of the page, so look at the page's own stack.
        const hit = document.elementsFromPoint(x, y).find((candidate) => !inMesurer(candidate));

        if (hit && (hit === element || element.contains(hit))) {
          window.__consoleDiagnosticsTarget = hit;

          return { x, y };
        }
      }
    }

    return null;
  }, await toolbar.boundingBox());

  const ensurePressed = async (button) => {
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  };

  const selectTool = page.locator("[data-mesurer-builtin='select'] button").first();

  const settingsButton = page.locator("[data-mesurer-builtin='settings'] button").first();

  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });

  await step("keyboard tools", async () => {
    await page.mouse.move(2, 2);

    for (const key of ["1", "s", "x", "x", "a", "a", "r", "r", "g", "Escape", "2", "Escape", "1", "Escape"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(40);
    }
  });

  let selectionMade = false;

  // Document-backed Mesurer controls sit under the protected interaction
  // overlay until a real pointer approaches them, so move before pressing.
  const pressMesurerControl = async (locator) => {
    await locator.waitFor({ state: "visible", timeout: 5000 });

    const rect = await locator.boundingBox();

    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await locator.click();
  };

  await step("hover and select", async () => {
    const point = await pick();

    if (!point) return false;

    await ensurePressed(selectTool);
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.waitForTimeout(80);
    await page.mouse.click(point.x, point.y);
    await page.locator("[data-mesurer-selected-measurement='true']").first().waitFor({ state: "attached", timeout: 5000 });
    selectionMade = true;
  });

  await step("context note", async () => {
    if (!selectionMade || !(await page.locator("[data-mesurer-tool-id='context.add-note']").count())) return false;

    await pressMesurerControl(page.locator("[data-mesurer-annotation-trigger='true']").first());

    const composer = page.locator("[data-mesurer-annotation-composer='true']").first();

    await composer.waitFor({ state: "visible", timeout: 5000 });
    await composer.locator("textarea").fill("Diagnostics contract note");
    await page.keyboard.press("Enter");
    await page.locator("[data-mesurer-annotation-marker='true']").first().waitFor({ state: "attached", timeout: 5000 });
  });

  await step("edit drag", async () => {
    if (!(await page.locator("[data-mesurer-tool-id='arrange']").count())) return false;

    const point = await pick();

    if (!point) return false;

    await page.keyboard.press("Escape");
    await page.keyboard.press("2");
    await page.waitForTimeout(200);

    // Edit moves the selected element, which may be an ancestor of the hit node.
    const rectOf = () => page.evaluate(() => {
      const rects = [];

      for (let node = window.__consoleDiagnosticsTarget; node && node !== document.documentElement; node = node.parentElement) {
        const rect = node.getBoundingClientRect();

        rects.push(`${rect.x},${rect.y}`);
      }

      return rects;
    });

    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(150);

    const before = await rectOf();

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 40, point.y + 24, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const after = await rectOf();

    const moved = after.some((position, index) => position !== before[index]);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Escape");
    await page.keyboard.press("1");

    // Hit-test stress fixtures intentionally contain targets Edit cannot drag;
    // the REQUIRED_STEPS check still demands a real drag somewhere.
    return moved;
  });

  await step("guides and rulers", async () => {
    await page.keyboard.press("g");
    await page.mouse.move(300, 220);
    await page.mouse.click(300, 220);
    await page.keyboard.press("Escape");
    await page.keyboard.press("r");
    await page.waitForTimeout(80);
    await page.keyboard.press("r");
    await page.keyboard.press("Delete");
  });

  await step("typography", async () => {
    const point = await pick();

    if (!point) return false;

    await page.keyboard.press("a");
    await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.keyboard.press("a");
    await page.keyboard.press("1");
  });

  await step("settings", async () => {
    if (!(await settingsButton.isVisible())) return false;

    await settingsButton.click();
    await dialog.waitFor({ state: "visible", timeout: 5000 });

    const switches = dialog.getByRole("switch");
    const count = await switches.count();

    for (let index = 0; index < count; index += 1) {
      const control = switches.nth(index);

      if (!(await control.isVisible())) continue;

      await control.click();
      await control.click();
    }

    for (const disclosure of await dialog.locator("[data-mesurer-plugin-settings-disclosure]").all()) {
      await disclosure.click();
    }

    await page.keyboard.press("Escape");

    if (await dialog.isVisible()) await settingsButton.click();

    await dialog.waitFor({ state: "hidden", timeout: 5000 });
  });

  await step("toolbar menus", async () => {
    const triggers = page.locator(`${TOOLBAR} button[aria-haspopup], ${TOOLBAR} button[aria-expanded]`);
    const count = await triggers.count();

    if (!count) return false;

    for (let index = 0; index < count; index += 1) {
      const trigger = triggers.nth(index);

      if (!(await trigger.isVisible())) continue;

      if ((await trigger.getAttribute("data-mesurer-builtin")) === "settings") continue;

      await trigger.click();
      await page.waitForTimeout(80);
      await page.keyboard.press("Escape");
    }
  });

  await step("disable and enable", async () => {
    await page.mouse.move(2, 2);
    await page.keyboard.press("m");
    await page.waitForTimeout(150);
    await page.keyboard.press("m");
    await page.waitForTimeout(150);
  });

  await step("resize", async () => {
    const size = page.viewportSize();

    await page.setViewportSize({ width: 640, height: 720 });
    await page.waitForTimeout(150);
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
  });

  await step("scroll", async () => {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(120);
  });

  return steps;
};

const pageSpecific = {
  async "screenshot-contract.html"(page) {
    await page.waitForFunction(() => Boolean(window.__MESURER_SCREENSHOT_TEST__));
    await page.locator("[data-mesurer-tool-id='screenshot'] button").first().click();
    await page.waitForFunction(() => window.__MESURER_SCREENSHOT_TEST__?.service.active() === true);
    await page.mouse.move(200, 200);
    await page.mouse.down();
    await page.mouse.move(500, 380, { steps: 8 });
    await page.mouse.up();
    await page.locator("[data-mesurer-screenshot-preview='true']").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("[data-mesurer-screenshot-preview-image='true']").click({ position: { x: 28, y: 40 } });
    await page.locator("[data-mesurer-screenshot-viewer='true']").waitFor({ state: "visible", timeout: 5000 });
    await page.keyboard.press("Escape");
  },

  async "recording-contract.html"(page) {
    await page.waitForFunction(() => Boolean(window.__MESURER_RECORDING_TEST__));
    await page.evaluate(() => window.__MESURER_RECORDING_TEST__.record({ left: 120, top: 110, width: 240, height: 140 }, 700));
  },

  async "motion-contract.html"(page) {
    await page.waitForFunction(() => Boolean(window.__MESURER_MOTION_TEST__));

    const selectTool = page.locator("[data-mesurer-builtin='select'] button").first();

    if ((await selectTool.getAttribute("aria-pressed")) !== "true") await selectTool.click();

    const target = page.locator("[data-testid='css-motion']");

    await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));

    const box = await target.boundingBox();

    assert(box, "Motion target has no geometry");
    await page.mouse.click(box.x + Math.max(8, box.width - 24), box.y + box.height / 2);

    const player = page.locator("[data-mesurer-motion-player='true']");

    await player.waitFor({ state: "visible", timeout: 5000 });

    const play = player.locator("[data-mesurer-motion-play='true']");

    await play.click();
    await play.click();

    const scrubber = player.locator("[data-mesurer-motion-scrubber='true']");
    const track = await scrubber.boundingBox();

    assert(track, "Motion scrubber has no geometry");
    await page.mouse.move(track.x + track.width * 0.3, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2, { steps: 5 });
    await page.mouse.up();

    const speed = player.locator("[data-mesurer-motion-speed='true']");

    await speed.first().click();
    await page.keyboard.press("Escape");
  },

  async "extension-active-tabs.html"(page) {
    await page.waitForFunction(() => Boolean(window.__MESURER_ACTIVE_TAB_TEST__?.createActiveTabRegistry));
  },
};

for (const dpr of dprs) {
  for (const name of pages) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const state = { step: "load" };
    const start = messages.length;

    page.on("console", (message) => {
      const text = message.text();

      if (IGNORED_VITE_LINES.has(text) && (message.type() === "debug" || message.type() === "log")) return;

      if (!FAILING_CONSOLE_TYPES.has(message.type())) return;

      const location = message.location();

      messages.push({
        page: name,
        dpr,
        step: state.step,
        kind: `console.${message.type()}`,
        text,
        location: location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : null,
      });
    });

    page.on("pageerror", (error) => messages.push({ page: name, dpr, step: state.step, kind: "pageerror", text: String(error?.stack ?? error) }));

    page.on("crash", () => messages.push({ page: name, dpr, step: state.step, kind: "crash", text: "renderer crashed" }));

    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText === "net::ERR_ABORTED") return;

      messages.push({ page: name, dpr, step: state.step, kind: "requestfailed", text: `${request.url()} ${request.failure()?.errorText}` });
    });

    page.on("response", (response) => {
      if (response.status() >= 400) messages.push({ page: name, dpr, step: state.step, kind: "http", text: `${response.status()} ${response.url()}` });
    });

    let steps = [];

    try {
      const response = await page.goto(new URL(name, base).href, { waitUntil: "domcontentloaded" });

      if (!response?.ok()) messages.push({ page: name, dpr, step: "load", kind: "http", text: `${response?.status()} ${name}` });

      if (!WITHOUT_MESURER.has(name)) steps = await exercise(page, name, state);

      const specific = pageSpecific[name];

      if (specific) {
        state.step = `${name} harness`;

        try {
          await specific(page);
          steps.push({ step: state.step, performed: true });
        } catch (error) {
          steps.push({ step: state.step, performed: false, error: String(error?.message ?? error).split("\n")[0] });
          fail(name, state.step, error);
        }
      }

      state.step = "reload";
      await page.reload({ waitUntil: "domcontentloaded" });

      if (!WITHOUT_MESURER.has(name)) await page.locator(TOOLBAR).first().waitFor({ state: "attached", timeout: 15_000 });

      await page.waitForTimeout(300);
      state.step = "vite overlay";

      if (await page.locator("vite-error-overlay").count()) {
        messages.push({ page: name, dpr, step: state.step, kind: "vite-error-overlay", text: await page.locator("vite-error-overlay").first().innerText().catch(() => "overlay") });
      }
    } catch (error) {
      fail(name, state.step, error);
    } finally {
      await context.close();
    }

    visited.push({ page: name, dpr, steps, messages: messages.length - start });
  }
}

await browser.close();

const performedAnywhere = (step) => visited.some((entry) => entry.steps.some((item) => item.step === step && item.performed));

const REQUIRED_STEPS = [
  "mount toolbar",
  "keyboard tools",
  "hover and select",
  "context note",
  "edit drag",
  "guides and rulers",
  "typography",
  "settings",
  "toolbar menus",
  "disable and enable",
  "resize",
  "scroll",
];

const missingSteps = only ? [] : REQUIRED_STEPS.filter((step) => !performedAnywhere(step));

await mkdir(output, { recursive: true });

await writeFile(
  join(output, "console-diagnostics.json"),
  `${JSON.stringify({ mode, base, dprs, pages, discovered, interactionFailures, missingSteps, visited, messages }, null, 2)}\n`,
);

const problems = [];

if (messages.length) problems.push(`${messages.length} console/page diagnostics`);

if (interactionFailures.length) problems.push(`${interactionFailures.length} interaction failures`);

if (missingSteps.length) problems.push(`steps never performed: ${missingSteps.join(", ")}`);

if (problems.length) {
  const grouped = new Map();

  for (const entry of messages) {
    const key = `[${entry.kind}] ${entry.text.split("\n")[0].replace(/\d+ of \d+/g, "N of N")}`;
    const group = grouped.get(key) ?? { count: 0, pages: new Set(), steps: new Set() };

    group.count += 1;
    group.pages.add(entry.page);
    group.steps.add(entry.step);
    grouped.set(key, group);
  }

  for (const [key, group] of grouped) {
    console.error(`${group.count}× ${key.slice(0, 400)}\n    pages: ${[...group.pages].join(", ")}\n    during: ${[...group.steps].join(", ")}`);
  }

  for (const failure of interactionFailures) console.error(`[interaction] ${failure.page} "${failure.step}": ${failure.error.split("\n")[0]}`);

  console.error(`Console diagnostics contract failed: ${problems.join("; ")}. Artifact: ${join(output, "console-diagnostics.json")}`);
  process.exit(1);
}

console.log(`Console diagnostics contract passed: ${visited.length} page loads (${pages.length} pages x ${dprs.length} DPRs, ${mode}), 0 messages.`);
