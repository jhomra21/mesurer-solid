import { chromium } from "playwright";

const baseUrl = process.env.PLUGIN_RELOAD_URL ?? "http://127.0.0.1:4174/plugin-settings.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const waitForHarness = async (label) => {
  try {
    await page.waitForFunction(
      () => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__),
      undefined,
      { timeout: 8_000 },
    );
  } catch (cause) {
    throw new Error(`Timed out waiting for plugin settings harness (${label})`, { cause });
  }
};

try {
  await page.goto(`${baseUrl}?reset=1`, { waitUntil: "domcontentloaded" });
  await waitForHarness("initial mount");

  const beforeReload = await page.evaluate(() => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable before reload");
    if (screenshot.settings().copy !== false) {
      throw new Error(`Expected fixture Auto-copy default to be off, got ${screenshot.settings().copy}`);
    }

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const blockedTimerId = 2_147_483_000;
    let blockedWrites = 0;

    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === 50) {
        blockedWrites += 1;
        return blockedTimerId;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    };
    window.clearTimeout = (timerId) => {
      if (timerId === blockedTimerId) return;
      nativeClearTimeout(timerId);
    };

    window.addEventListener("beforeunload", () => {
      window.localStorage.setItem("mesurer-plugin-reload:beforeunload", JSON.stringify({
        copy: screenshot.settings().copy,
        pluginState: window.localStorage.getItem("mesurer-plugin-settings"),
      }));
    }, { once: true });
    window.addEventListener("pagehide", () => {
      window.localStorage.setItem("mesurer-plugin-reload:pagehide", JSON.stringify({
        copy: screenshot.settings().copy,
        pluginState: window.localStorage.getItem("mesurer-plugin-settings"),
      }));
    }, { once: true });

    screenshot.setSettings({ copy: true });
    return {
      liveCopy: screenshot.settings().copy,
      blockedWrites,
      stored: window.localStorage.getItem("mesurer-plugin-settings"),
    };
  });

  if (beforeReload.liveCopy !== true) {
    throw new Error(`Screenshot Auto-copy did not update before reload: ${JSON.stringify(beforeReload)}`);
  }
  if (beforeReload.blockedWrites < 1) {
    throw new Error(`Plugin persistence did not schedule its 50ms write in the state-change turn: ${JSON.stringify(beforeReload)}`);
  }

  const storedBeforeReload = beforeReload.stored ? JSON.parse(beforeReload.stored) : {};
  if (storedBeforeReload["mesurer.screenshot.settings"]?.copy === true) {
    throw new Error("Change detector invalid: Screenshot state persisted before the blocked 50ms write");
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHarness("reload");

  const afterReload = await page.evaluate(() => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable after reload");
    const stored = window.localStorage.getItem("mesurer-plugin-settings");
    const beforeunload = window.localStorage.getItem("mesurer-plugin-reload:beforeunload");
    const pagehide = window.localStorage.getItem("mesurer-plugin-reload:pagehide");
    return {
      liveCopy: screenshot.settings().copy,
      stored: stored ? JSON.parse(stored) : null,
      beforeunload: beforeunload ? JSON.parse(beforeunload) : null,
      pagehide: pagehide ? JSON.parse(pagehide) : null,
    };
  });

  if (afterReload.liveCopy !== true) {
    throw new Error(`Screenshot Auto-copy reverted after immediate reload: ${JSON.stringify(afterReload)}`);
  }
  if (afterReload.stored?.["mesurer.screenshot.settings"]?.copy !== true) {
    throw new Error(`Default plugin storage missed Screenshot Auto-copy: ${JSON.stringify(afterReload)}`);
  }
  if (errors.length) throw new Error(`Browser diagnostics were not clean:\n${errors.join("\n")}`);

  console.log("Plugin immediate-reload persistence contract: PASS");
  console.log(JSON.stringify(afterReload, null, 2));
} finally {
  await page.close();
  await browser.close();
}
