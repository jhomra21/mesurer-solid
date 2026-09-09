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

    window.setTimeout = (handler, timeout, ...args) => {
      if (timeout === 50) return blockedTimerId;
      return nativeSetTimeout(handler, timeout, ...args);
    };
    window.clearTimeout = (timerId) => {
      if (timerId === blockedTimerId) return;
      nativeClearTimeout(timerId);
    };

    screenshot.setSettings({ copy: true });
    return {
      liveCopy: screenshot.settings().copy,
      stored: window.localStorage.getItem("mesurer-plugin-settings"),
    };
  });

  if (beforeReload.liveCopy !== true) {
    throw new Error(`Screenshot Auto-copy did not update before reload: ${JSON.stringify(beforeReload)}`);
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
    return {
      liveCopy: screenshot.settings().copy,
      stored: stored ? JSON.parse(stored) : null,
    };
  });

  if (afterReload.liveCopy !== true) {
    throw new Error(`Screenshot Auto-copy reverted after immediate reload: ${JSON.stringify(afterReload)}`);
  }
  if (afterReload.stored?.["mesurer.screenshot.settings"]?.copy !== true) {
    throw new Error(`Default plugin storage missed Screenshot Auto-copy: ${JSON.stringify(afterReload.stored)}`);
  }
  if (errors.length) throw new Error(`Browser diagnostics were not clean:\n${errors.join("\n")}`);

  console.log("Plugin immediate-reload persistence contract: PASS");
  console.log(JSON.stringify(afterReload, null, 2));
} finally {
  await page.close();
  await browser.close();
}
