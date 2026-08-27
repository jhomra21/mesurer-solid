import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const url = process.env.SOLID1_URL ?? "http://127.0.0.1:4180";
const injectPath = resolve("packages/mesurer/dist/inject-script.js");
const injectSource = await readFile(injectPath, "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "networkidle" });

  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  await page.evaluate(async () => {
    const instance = window.__MESURER_INSTANCE__;
    if (!instance?.pluginHost) throw new Error("Expected injected Mesurer plugin host.");
    instance.element.dataset.reuseProbe = "human-state";
    await instance.pluginHost.load({
      id: "test.human-state",
      version: "1.0.0",
      setup(ctx) {
        ctx.state.register({
          id: "test.human-state.value",
          initial: { marker: 42 },
        });
      },
    });
  });

  const before = await page.evaluate(() => ({
    element: window.__MESURER_INSTANCE__?.element,
    agent: window.__MESURER__,
  }));

  // This models an agent evaluating its bundled injector after a human has
  // already selected/measured/annotated the page. Default injection must reuse
  // the live instance instead of destroying that shared review state.
  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  const reused = await page.evaluate(() => {
    const instance = window.__MESURER_INSTANCE__;
    return {
      marker: instance?.element.dataset.reuseProbe ?? null,
      pluginState: window.__MESURER__.state()["test.human-state.value"] ?? null,
      islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
      sameElement: instance?.element === window.__MESURER_REUSE_BEFORE_ELEMENT__,
      sameAgent: window.__MESURER__ === window.__MESURER_REUSE_BEFORE_AGENT__,
    };
  });

  // Object identity cannot cross the Playwright serialization boundary, so keep
  // the original live references in the page and compare them there as well.
  await page.evaluate(({ element, agent }) => {
    window.__MESURER_REUSE_BEFORE_ELEMENT__ = element;
    window.__MESURER_REUSE_BEFORE_AGENT__ = agent;
  }, before);

  // Re-run once after storing page-local references so identity itself is proven.
  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());
  const identity = await page.evaluate(() => ({
    sameElement: window.__MESURER_INSTANCE__?.element === window.__MESURER_REUSE_BEFORE_ELEMENT__,
    sameAgent: window.__MESURER__ === window.__MESURER_REUSE_BEFORE_AGENT__,
    marker: window.__MESURER_INSTANCE__?.element.dataset.reuseProbe ?? null,
    pluginState: window.__MESURER__.state()["test.human-state.value"] ?? null,
    islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
  }));

  if (reused.marker !== "human-state" || identity.marker !== "human-state") {
    throw new Error(`Agent reinjection destroyed human instance state: ${JSON.stringify({ reused, identity })}`);
  }
  if (identity.pluginState?.marker !== 42) {
    throw new Error(`Agent reinjection destroyed plugin state: ${JSON.stringify(identity.pluginState)}`);
  }
  if (!identity.sameElement || !identity.sameAgent || identity.islandCount !== 1) {
    throw new Error(`Agent reinjection did not reuse exactly one live Mesurer instance: ${JSON.stringify(identity)}`);
  }

  await page.evaluate(() => {
    window.__MESURER_CONFIG__ = { reuseExisting: false };
  });
  await page.evaluate(injectSource);
  await page.evaluate(() => window.__MESURER__.ready());

  const replaced = await page.evaluate(() => ({
    sameElement: window.__MESURER_INSTANCE__?.element === window.__MESURER_REUSE_BEFORE_ELEMENT__,
    marker: window.__MESURER_INSTANCE__?.element.dataset.reuseProbe ?? null,
    pluginState: window.__MESURER__.state()["test.human-state.value"] ?? null,
    islandCount: document.querySelectorAll("[data-mesurer-island='true']").length,
  }));
  if (replaced.sameElement || replaced.marker !== null || replaced.pluginState !== null || replaced.islandCount !== 1) {
    throw new Error(`reuseExisting:false did not deliberately replace the injected instance: ${JSON.stringify(replaced)}`);
  }

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join("\n")}`);
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join("\n")}`);
  console.log("Agent injection reuses live human Mesurer state and supports explicit replacement: PASS");
} finally {
  await browser.close();
}
