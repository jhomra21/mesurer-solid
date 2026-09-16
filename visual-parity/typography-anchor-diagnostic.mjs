import { chromium } from "playwright";

const rootUrl = process.env.TYPOGRAPHY_ANCHOR_URL ?? "http://127.0.0.1:4174/";
const url = new URL("multi-spacing.html", rootUrl).toString();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];

page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
page.on("requestfailed", (request) => failedRequests.push({
  url: request.url(),
  failure: request.failure()?.errorText ?? "unknown",
}));

const snapshot = (label) => page.evaluate((stage) => ({
  label: stage,
  readyState: document.readyState,
  title: document.title,
  harness: Boolean(globalThis.__MESURER_MULTI_SPACING_FIXTURE__?.mesurer),
  mesurerRoots: document.querySelectorAll("[data-mesurer-root='true']").length,
  toolbar: Boolean(document.querySelector("[data-mesurer-toolbar='true']")),
  scripts: [...document.scripts].map((script) => ({ src: script.src, type: script.type })),
  bodyText: document.body?.innerText.slice(0, 500) ?? "",
}), label);

try {
  const response = await page.goto(url, { waitUntil: "networkidle" });
  const states = [await snapshot("after-navigation")];

  let fixtureReady = false;
  try {
    await page.waitForFunction(() => Boolean(globalThis.__MESURER_MULTI_SPACING_FIXTURE__?.mesurer), null, { timeout: 5000 });
    fixtureReady = true;
  } catch {
    states.push(await snapshot("fixture-timeout"));
  }

  if (fixtureReady) {
    states.push(await snapshot("fixture-ready"));
    await page.evaluate(async () => {
      await globalThis.__MESURER_MULTI_SPACING_FIXTURE__.mesurer.agent.command("builtin.select");
    });
    states.push(await snapshot("select-command"));

    const clickCard = async (id, shift = false) => {
      const locator = page.locator(`[data-spacing-card='${id}']`);
      if (shift) await page.keyboard.down("Shift");
      try {
        await locator.click({ position: { x: 60, y: 36 } });
      } finally {
        if (shift) await page.keyboard.up("Shift");
      }
    };
    await clickCard("a");
    await clickCard("c", true);
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('[data-mesurer-selection-spacing-target="true"]').length === 2
        && document.querySelectorAll('[data-mesurer-distance-kind="selection-spacing"]').length === 1,
        null,
        { timeout: 5000 },
      );
      states.push(await snapshot("sparse-ready"));
    } catch {
      states.push(await snapshot("sparse-timeout"));
    }
  }

  console.log(JSON.stringify({
    response: {
      status: response?.status() ?? null,
      url: response?.url() ?? null,
    },
    states,
    consoleMessages,
    pageErrors,
    failedRequests,
  }, null, 2));

  if (!fixtureReady) process.exitCode = 1;
} finally {
  await browser.close();
}
