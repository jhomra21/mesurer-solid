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
const waitForTool = async (id, visible) => {
  await page.waitForFunction(({ id, visible }) => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
    const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
    return isVisible === visible;
  }, { id, visible });
};
const pluginLoaded = async (id) => page.evaluate((pluginId) =>
  window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === pluginId) ?? false,
  id,
);
const waitForPlugin = async (id, loaded) => {
  await page.waitForFunction(({ id, loaded }) =>
    (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
    { id, loaded },
  );
};
const openSettings = async () => {
  const settingsButton = island().locator("[data-mesurer-builtin='settings'] button").first();
  await settingsButton.waitFor({ state: "visible" });
  if (!(await island().getByRole("dialog", { name: "Settings" }).isVisible())) await settingsButton.click();
  const dialog = island().getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  const generalTab = dialog.getByRole("tab", { name: "General" });
  if ((await generalTab.getAttribute("aria-selected")) !== "true") await generalTab.click();
  const pluginsDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await pluginsDisclosure.getAttribute("aria-expanded")) !== "true") await pluginsDisclosure.click();
  return dialog;
};
const pluginToggle = (dialog, label) => dialog.getByRole("switch", { name: label, exact: true });
const settingSwitch = (dialog, label) => dialog.getByRole("switch", { name: label, exact: true });
const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";
const expectChecked = async (control, expected, label) => {
  const actual = await checked(control);
  if (actual !== expected) throw new Error(`${label} expected ${expected ? "on" : "off"}, got ${actual ? "on" : "off"}`);
};
const expectNoDisclosure = async (dialog, id, label) => {
  const disclosure = dialog.locator(`[data-mesurer-plugin-settings-disclosure='${id}']`);
  if ((await disclosure.count()) !== 0) throw new Error(`${label} unexpectedly exposed a settings chevron`);
};
const expandPlugin = async (dialog, id, _label) => {
  const disclosure = dialog.locator(`[data-mesurer-plugin-settings-disclosure='${id}']`);
  await disclosure.waitFor({ state: "visible" });
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  await dialog.locator(`[data-mesurer-plugin-settings-controls='${id}']`).waitFor({ state: "visible" });
  return disclosure;
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
  if (mismatches.length) throw new Error(`Official plugin versions did not match ${metadata.expected}: ${JSON.stringify(mismatches)}`);
  return metadata;
};

try {
  await page.goto(`${baseUrl}?reset=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  if (await pluginLoaded("mesurer.arrange")) throw new Error("Arrange should begin unloaded in the fixture");

  let dialog = await openSettings();
  const releaseMetadata = await assertReleaseMetadata(dialog);
  const pluginList = dialog.locator("[data-mesurer-plugin-settings-list='true']");
  for (const id of ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"]) {
    await pluginList.locator(`[data-mesurer-plugin-settings-section='${id}']`).waitFor({ state: "visible" });
  }

  const contextToggle = pluginToggle(dialog, "Context");
  const arrangeToggle = pluginToggle(dialog, "Arrange");
  const screenshotToggle = pluginToggle(dialog, "Screenshot");
  await expectChecked(contextToggle, true, "Context plugin");
  await expectChecked(arrangeToggle, false, "Arrange plugin");
  await expectChecked(screenshotToggle, true, "Screenshot plugin");
  await expectNoDisclosure(dialog, "mesurer.context", "Context");
  await expectNoDisclosure(dialog, "mesurer.arrange", "Disabled Arrange");
  if ((await settingSwitch(dialog, "Context tools").count()) !== 0) throw new Error("Context tools redundant nested toggle is still visible");
  if ((await settingSwitch(dialog, "Screenshot tool").count()) !== 0) throw new Error("Screenshot tool redundant nested toggle is still visible");

  // A first-party plugin that was never supplied to mountMesurer is discoverable and loadable from Settings.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await waitForTool("arrange", true);
  await expectChecked(arrangeToggle, true, "Arrange plugin after Settings enable");
  await expandPlugin(dialog, "mesurer.arrange", "Arrange");
  await settingSwitch(dialog, "Snapping").waitFor({ state: "visible" });

  // Disabling unloads the actual plugin and removes its settings chevron, while the row remains available.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", false);
  await waitForTool("arrange", false);
  await expectChecked(arrangeToggle, false, "Arrange plugin after disable");
  await expectNoDisclosure(dialog, "mesurer.arrange", "Disabled Arrange");

  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  const autoCopy = settingSwitch(dialog, "Auto-copy");
  const autoDownload = settingSwitch(dialog, "Auto-download");
  const includeMeasurements = settingSwitch(dialog, "Include measurements");
  await expectChecked(autoCopy, false, "Auto-copy default");
  await expectChecked(autoDownload, false, "Auto-download default");
  await expectChecked(includeMeasurements, false, "Include measurements default");

  // Plugin-local persisted settings survive an unload/reload cycle.
  await autoCopy.click();
  await expectChecked(autoCopy, true, "Auto-copy before unload");
  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", false);
  await waitForTool("screenshot", false);
  await expectNoDisclosure(dialog, "mesurer.screenshot", "Disabled Screenshot");
  const screenshotServiceRemoved = await page.evaluate(() =>
    window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.services.includes("screenshot") ?? false,
  );
  if (screenshotServiceRemoved) throw new Error("Disabling Screenshot left its service registered");

  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", true);
  await waitForTool("screenshot", true);
  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  await expectChecked(settingSwitch(dialog, "Auto-copy"), true, "Auto-copy restored after plugin reload");

  // Context uses the same lifecycle toggle: off means its service is actually gone, not merely hidden.
  await contextToggle.click();
  await waitForPlugin("mesurer.context", false);
  await waitForTool("context.copy", false);
  const contextServiceRemoved = await page.evaluate(() =>
    window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.services.includes("context:v1") ?? false,
  );
  if (contextServiceRemoved) throw new Error("Disabling Context left context:v1 registered");
  await contextToggle.click();
  await waitForPlugin("mesurer.context", true);
  await waitForTool("context.copy", true);

  // Keep Arrange enabled and Screenshot disabled, then prove availability itself survives reload.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", false);
  await page.waitForTimeout(100);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));
  dialog = await openSettings();
  await expectChecked(pluginToggle(dialog, "Context"), true, "Persisted Context plugin");
  await expectChecked(pluginToggle(dialog, "Arrange"), true, "Persisted Arrange plugin");
  await expectChecked(pluginToggle(dialog, "Screenshot"), false, "Persisted Screenshot plugin");
  await waitForTool("context.copy", true);
  await waitForTool("arrange", true);
  await waitForTool("screenshot", false);

  // Reset returns plugin availability to the fixture's mount defaults: Context + Screenshot on, Arrange off.
  await dialog.getByRole("button", { name: "Reset settings to defaults" }).click();
  await waitForPlugin("mesurer.arrange", false);
  await waitForPlugin("mesurer.screenshot", true);
  await waitForPlugin("mesurer.context", true);
  await expectChecked(pluginToggle(dialog, "Context"), true, "Default Context plugin");
  await expectChecked(pluginToggle(dialog, "Arrange"), false, "Default Arrange plugin");
  await expectChecked(pluginToggle(dialog, "Screenshot"), true, "Default Screenshot plugin");
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  await waitForTool("arrange", false);
  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");
  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Default Auto-copy");

  // The reloaded Screenshot plugin still uses the caller-provided capture provider.
  await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable after plugin reload");
    await harness.subject.select("#settings-target");
    screenshot.setSettings({ includeMeasurements: false, copy: false, download: false });
    await screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
  });
  const cleanCapture = await page.evaluate(() => window.__MESURER_PLUGIN_SETTINGS_TEST__?.captures.at(-1));
  if (cleanCapture?.measurementVisible !== false) throw new Error(`Clean screenshot kept measurements: ${JSON.stringify(cleanCapture)}`);

  await settingSwitch(dialog, "Include measurements").click();
  await page.evaluate(async () => {
    const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
    const screenshot = harness?.screenshot();
    if (!harness || !screenshot) throw new Error("Screenshot service unavailable for evidence capture");
    await screenshot.capture({ left: 80, top: 80, width: 360, height: 220 });
  });
  const evidenceCapture = await page.evaluate(() => window.__MESURER_PLUGIN_SETTINGS_TEST__?.captures.at(-1));
  if (evidenceCapture?.measurementVisible !== true) throw new Error(`Evidence screenshot hid measurements: ${JSON.stringify(evidenceCapture)}`);

  if (errors.length) throw new Error(`Plugin settings browser errors:\n${errors.join("\n")}`);
  console.log("Plugin settings browser contract: PASS");
  console.log(JSON.stringify({ cleanCapture, evidenceCapture, releaseMetadata }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
