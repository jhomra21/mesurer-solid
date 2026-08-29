import { chromium } from "playwright";

const baseUrl = process.env.PLUGIN_SETTINGS_URL ?? "http://127.0.0.1:4174/plugin-settings.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const island = () => page.locator("[data-mesurer-island='true']");
const tool = (id) => island().locator(`[data-mesurer-tool-id='${id}'] button`);
const openSettings = async () => {
  const settingsButton = island().locator("[data-mesurer-builtin='settings'] button").first();
  await settingsButton.waitFor({ state: "visible" });
  if (!(await island().getByRole("dialog", { name: "Settings" }).isVisible())) {
    await settingsButton.click();
  }
  const dialog = island().getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  const generalTab = dialog.getByRole("tab", { name: "General" });
  if ((await generalTab.getAttribute("aria-selected")) !== "true") await generalTab.click();
  return dialog;
};
const switchByName = (dialog, name) => dialog.getByRole("switch", { name: new RegExp(`^${name}(?:\\s|$)`) });
const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";
const expectChecked = async (control, expected, label) => {
  const actual = await checked(control);
  if (actual !== expected) throw new Error(`${label} expected ${expected ? "on" : "off"}, got ${actual ? "on" : "off"}`);
};
const waitForTool = async (id, visible) => {
  await page.waitForFunction(({ id, visible }) => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
    const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
    return isVisible === visible;
  }, { id, visible });
};
const assertReleaseMetadata = async (dialog) => {
  const metadata = await page.evaluate(() => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) return null;
    return {
      expected: harness.version,
      officialPlugins: harness.subject.describe()?.plugins
        .filter((plugin) => plugin.id.startsWith("mesurer."))
        .map((plugin) => ({ id: plugin.id, version: plugin.version })) ?? [],
    };
  });
  if (!metadata) throw new Error("Plugin settings release metadata unavailable");
  await dialog.getByText(metadata.expected, { exact: true }).waitFor({ state: "visible" });
  const mismatches = metadata.officialPlugins.filter((plugin) => plugin.version !== metadata.expected);
  if (mismatches.length) {
    throw new Error(`Official plugin versions did not match ${metadata.expected}: ${JSON.stringify(mismatches)}`);
  }
  return metadata;
};

try {
  await page.goto(`${baseUrl}?reset=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));

  await waitForTool("screenshot", true);
  await waitForTool("context.copy", true);

  const selectionResult = await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) throw new Error("Plugin settings harness unavailable");
    await harness.subject.select("#settings-target");
    return harness.subject.describe()?.services.includes("context:v1") ?? false;
  });
  if (!selectionResult) throw new Error("Context service was not registered before toggling Context tools");
  await page.waitForFunction(() => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    return Boolean(root?.querySelector("[data-mesurer-measurement='true']"));
  });

  let dialog = await openSettings();
  const releaseMetadata = await assertReleaseMetadata(dialog);
  const contextSection = dialog.locator("[data-mesurer-plugin-settings-section='context']");
  const screenshotSection = dialog.locator("[data-mesurer-plugin-settings-section='screenshot']");
  await contextSection.waitFor({ state: "visible" });
  await screenshotSection.waitFor({ state: "visible" });

  const contextTools = switchByName(dialog, "Context tools");
  const screenshotTool = switchByName(dialog, "Screenshot tool");
  const autoCopy = switchByName(dialog, "Auto-copy");
  const autoDownload = switchByName(dialog, "Auto-download");
  const includeMeasurements = switchByName(dialog, "Include measurements");
  await expectChecked(contextTools, true, "Context tools");
  await expectChecked(screenshotTool, true, "Screenshot tool");
  await expectChecked(autoCopy, false, "Auto-copy");
  await expectChecked(autoDownload, false, "Auto-download");
  await expectChecked(includeMeasurements, false, "Include measurements");

  await contextTools.click();
  await expectChecked(contextTools, false, "Context tools after disable");
  await waitForTool("context.copy", false);
  const contextStillAvailable = await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) return false;
    await harness.subject.context({ scope: "selection" });
    return harness.subject.describe()?.services.includes("context:v1") ?? false;
  });
  if (!contextStillAvailable) throw new Error("Disabling Context tools removed the context:v1 service");

  await screenshotTool.click();
  await expectChecked(screenshotTool, false, "Screenshot tool after disable");
  await waitForTool("screenshot", false);
  const disabledScreenshotSettings = await page.evaluate(() => window.__MESURER_PLUGIN_SETTINGS_TEST__?.screenshot.settings());
  if (disabledScreenshotSettings?.toolEnabled !== false) {
    throw new Error(`Screenshot service did not observe tool disable: ${JSON.stringify(disabledScreenshotSettings)}`);
  }

  await autoCopy.click();
  await autoDownload.click();
  await expectChecked(autoCopy, true, "Auto-copy after enable");
  await expectChecked(autoDownload, true, "Auto-download after enable");
  await autoCopy.click();
  await autoDownload.click();

  const cleanCapture = await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) throw new Error("Plugin settings harness unavailable");
    harness.screenshot.setSettings({ includeMeasurements: false, copy: false, download: false });
    await harness.screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
    return {
      capture: harness.captures.at(-1),
      measurementRestored: Boolean(harness.subject.root.querySelector("[data-mesurer-measurement='true']")?.getClientRects().length),
    };
  });
  if (cleanCapture.capture?.measurementVisible !== false) {
    throw new Error(`Clean screenshot kept measurement presentation: ${JSON.stringify(cleanCapture)}`);
  }
  if (!cleanCapture.measurementRestored) {
    throw new Error("Measurement presentation was not restored after clean screenshot capture");
  }

  await includeMeasurements.click();
  await expectChecked(includeMeasurements, true, "Include measurements after enable");
  const evidenceCapture = await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) throw new Error("Plugin settings harness unavailable");
    await harness.screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
    return harness.captures.at(-1);
  });
  if (evidenceCapture?.measurementVisible !== true) {
    throw new Error(`Evidence screenshot hid measurement presentation: ${JSON.stringify(evidenceCapture)}`);
  }
  if (evidenceCapture?.screenshotSelectionVisible !== false) {
    throw new Error(`Screenshot selection chrome leaked into programmatic capture: ${JSON.stringify(evidenceCapture)}`);
  }

  // Persist a non-default combination with no explicit persistKey and prove runtime behavior is re-applied after reload.
  await autoCopy.click();
  await autoDownload.click();
  await page.waitForTimeout(100);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));

  dialog = await openSettings();
  await assertReleaseMetadata(dialog);
  const persistedContextTools = switchByName(dialog, "Context tools");
  const persistedScreenshotTool = switchByName(dialog, "Screenshot tool");
  const persistedAutoCopy = switchByName(dialog, "Auto-copy");
  const persistedAutoDownload = switchByName(dialog, "Auto-download");
  const persistedMeasurements = switchByName(dialog, "Include measurements");
  await expectChecked(persistedContextTools, false, "Persisted Context tools");
  await expectChecked(persistedScreenshotTool, false, "Persisted Screenshot tool");
  await expectChecked(persistedAutoCopy, true, "Persisted Auto-copy");
  await expectChecked(persistedAutoDownload, true, "Persisted Auto-download");
  await expectChecked(persistedMeasurements, true, "Persisted Include measurements");
  await waitForTool("context.copy", false);
  await waitForTool("screenshot", false);

  const servicesAfterReload = await page.evaluate(() => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    if (!harness) return { context: false, screenshot: false };
    const description = harness.subject.describe();
    return {
      context: description?.services.includes("context:v1") ?? false,
      screenshot: description?.services.includes("screenshot") ?? false,
    };
  });
  if (!servicesAfterReload.context || !servicesAfterReload.screenshot) {
    throw new Error(`Plugin services did not survive persisted UI disable: ${JSON.stringify(servicesAfterReload)}`);
  }

  // Reset both renderer and plugin-contributed settings, then prove the plugin defaults survive another reload.
  await dialog.getByRole("button", { name: "Reset settings to defaults" }).click();
  await expectChecked(persistedContextTools, true, "Default Context tools");
  await expectChecked(persistedScreenshotTool, true, "Default Screenshot tool");
  await expectChecked(persistedAutoCopy, false, "Default Auto-copy");
  await expectChecked(persistedAutoDownload, false, "Default Auto-download");
  await expectChecked(persistedMeasurements, false, "Default Include measurements");
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  await page.waitForTimeout(100);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));
  dialog = await openSettings();
  await expectChecked(switchByName(dialog, "Context tools"), true, "Reset Context tools after reload");
  await expectChecked(switchByName(dialog, "Screenshot tool"), true, "Reset Screenshot tool after reload");
  await expectChecked(switchByName(dialog, "Auto-copy"), false, "Reset Auto-copy after reload");
  await expectChecked(switchByName(dialog, "Auto-download"), false, "Reset Auto-download after reload");
  await expectChecked(switchByName(dialog, "Include measurements"), false, "Reset Include measurements after reload");
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);

  if (errors.length) throw new Error(`Plugin settings browser errors:\n${errors.join("\n")}`);
  console.log("Plugin settings browser contract: PASS");
  console.log(JSON.stringify({ cleanCapture, evidenceCapture, servicesAfterReload, releaseMetadata }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
