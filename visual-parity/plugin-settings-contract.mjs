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
const browserSnapshot = async () => page.evaluate(() => {
  const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
  const islandElement = document.querySelector("[data-mesurer-island='true']");
  const root = islandElement?.shadowRoot ?? islandElement;
  return {
    href: window.location.href,
    harness: Boolean(harness),
    plugins: harness?.subject.describe()?.plugins.map((plugin) => plugin.id) ?? [],
    services: harness?.subject.describe()?.services ?? [],
    visibleTools: [...(root?.querySelectorAll("[data-mesurer-tool-id]") ?? [])]
      .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0)
      .map((element) => element.getAttribute("data-mesurer-tool-id")),
    availability: window.localStorage.getItem("mesurer-plugin-settings:availability"),
    pluginState: window.localStorage.getItem("mesurer-plugin-settings"),
  };
});
const waitForHarness = async (label) => {
  try {
    await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__), undefined, { timeout: 8_000 });
  } catch (cause) {
    throw new Error(`Timed out waiting for plugin settings harness (${label}): ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
};
const waitForTool = async (id, visible) => {
  try {
    await page.waitForFunction(({ id, visible }) => {
      const islandElement = document.querySelector("[data-mesurer-island='true']");
      const root = islandElement?.shadowRoot ?? islandElement;
      const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
      const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
      return isVisible === visible;
    }, { id, visible }, { timeout: 8_000 });
  } catch (cause) {
    throw new Error(`Timed out waiting for tool ${id} to become ${visible ? "visible" : "hidden"}: ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
};
const pluginLoaded = async (id) => page.evaluate((pluginId) =>
  window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === pluginId) ?? false,
  id,
);
const waitForPlugin = async (id, loaded) => {
  try {
    await page.waitForFunction(({ id, loaded }) =>
      (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
      { id, loaded },
      { timeout: 8_000 },
    );
  } catch (cause) {
    throw new Error(`Timed out waiting for ${id} to become ${loaded ? "loaded" : "unloaded"}: ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
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
const pluginTrackX = async (dialog, id) => {
  const track = dialog.locator(`[data-mesurer-plugin-toggle='${id}'] .mesurer-switch-track`);
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error(`Plugin toggle track ${id} has no bounding box`);
  return box.x;
};
const switchTrackX = async (control, label) => {
  const track = control.locator(".mesurer-switch-track");
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error(`${label} toggle track has no bounding box`);
  return box.x;
};
const persistTrackX = async (dialog) => switchTrackX(
  dialog.getByRole("switch", { name: "Persist", exact: true }),
  "Persist",
);
const expectPluginsDisclosureAlignment = async (dialog) => {
  const disclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  const pluginsLabel = disclosure.locator("span").first();
  const chevron = disclosure.locator("svg");
  const persistLabel = dialog.getByText("Persist", { exact: true });
  const versionLabel = dialog.getByText("Version", { exact: true });
  const disclosureBox = await disclosure.boundingBox();
  const pluginsBox = await pluginsLabel.boundingBox();
  const chevronBox = await chevron.boundingBox();
  const persistBox = await persistLabel.boundingBox();
  const versionBox = await versionLabel.boundingBox();
  if (!disclosureBox || !pluginsBox || !chevronBox || !persistBox || !versionBox) {
    throw new Error("Plugins disclosure alignment controls have no bounding box");
  }
  const leftInset = pluginsBox.x - disclosureBox.x;
  const rightInset = disclosureBox.x + disclosureBox.width - (chevronBox.x + chevronBox.width);
  if (Math.abs(pluginsBox.x - persistBox.x) > 0.5 || Math.abs(pluginsBox.x - versionBox.x) > 0.5) {
    throw new Error(`Plugins label is not aligned with General labels: ${JSON.stringify({ plugins: pluginsBox.x, persist: persistBox.x, version: versionBox.x })}`);
  }
  if (Math.abs(leftInset - 8) > 0.5 || Math.abs(rightInset - 8) > 0.5) {
    throw new Error(`Plugins disclosure should have symmetric 8px content insets: ${JSON.stringify({ leftInset, rightInset })}`);
  }
};
const leftX = async (locator, label) => {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box.x;
};
const expectNestedLabelHierarchy = async (dialog, pluginId, controlLabels, label) => {
  const pluginX = await leftX(dialog.locator(`[data-mesurer-plugin-label='${pluginId}']`), `${label} plugin label`);
  const controls = controlLabels.map((controlLabel) => dialog.getByRole("switch", { name: controlLabel, exact: true }).locator(".mesurer-plugin-setting-label"));
  const positions = await Promise.all(controls.map((control, index) => leftX(control, `${label} setting ${controlLabels[index]}`)));
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} nested labels are not aligned: ${JSON.stringify(positions)}`);
  const indent = positions[0] - pluginX;
  if (Math.abs(indent - 16) > 0.5) throw new Error(`${label} nested labels should be indented 16px from the plugin label: ${JSON.stringify({ pluginX, nestedX: positions[0], indent })}`);
};
const expectToggleAlignment = async (dialog, ids, label) => {
  const persist = await persistTrackX(dialog);
  const plugins = await Promise.all(ids.map((id) => pluginTrackX(dialog, id)));
  const positions = [persist, ...plugins];
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} Persist/plugin toggles are misaligned: ${JSON.stringify(positions)}`);
};
const expectChecked = async (control, expected, label) => {
  const actual = await checked(control);
  if (actual !== expected) throw new Error(`${label} expected ${expected ? "on" : "off"}, got ${actual ? "on" : "off"}`);
};
const expectNoDisclosure = async (dialog, id, label) => {
  const disclosure = dialog.locator(`[data-mesurer-plugin-settings-disclosure='${id}']`);
  if ((await disclosure.count()) !== 0) throw new Error(`${label} unexpectedly exposed a settings chevron`);
};
const expandPlugin = async (dialog, id) => {
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
  await waitForHarness("initial mount");
  await waitForTool("context.copy", true);
  await waitForTool("screenshot", true);
  if (await pluginLoaded("mesurer.arrange")) throw new Error("Arrange should begin unloaded in the fixture");

  let dialog = await openSettings();
  const releaseMetadata = await assertReleaseMetadata(dialog);
  await expectPluginsDisclosureAlignment(dialog);
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
  await expectToggleAlignment(dialog, ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"], "Initial");
  await expectNoDisclosure(dialog, "mesurer.context", "Context");
  await expectNoDisclosure(dialog, "mesurer.arrange", "Disabled Arrange");
  if ((await settingSwitch(dialog, "Context tools").count()) !== 0) throw new Error("Context tools redundant nested toggle is still visible");
  if ((await settingSwitch(dialog, "Screenshot tool").count()) !== 0) throw new Error("Screenshot tool redundant nested toggle is still visible");

  // A first-party plugin that was never supplied to mountMesurer is discoverable and loadable from Settings.
  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await waitForTool("arrange", true);
  await expectChecked(arrangeToggle, true, "Arrange plugin after Settings enable");
  await expectToggleAlignment(dialog, ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"], "Arrange enabled");
  await expandPlugin(dialog, "mesurer.arrange", "Arrange");
  const arrangeSnapping = settingSwitch(dialog, "Snapping");
  await arrangeSnapping.waitFor({ state: "visible" });
  await expectNestedLabelHierarchy(
    dialog,
    "mesurer.arrange",
    ["Snapping", "Element edges", "Element centers", "Guides", "Prefer X-ray edges", "Alignment rulers"],
    "Arrange",
  );
  const persistX = await persistTrackX(dialog);
  const snappingX = await switchTrackX(arrangeSnapping, "Arrange snapping");
  if (Math.abs(persistX - snappingX) > 0.5) {
    throw new Error(`Expanded Arrange setting is not aligned with Persist: ${JSON.stringify({ persistX, snappingX })}`);
  }
  await expectChecked(arrangeSnapping, true, "Arrange snapping default");
  await arrangeSnapping.click();
  await expectChecked(arrangeSnapping, false, "Arrange snapping before unload");

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
  await expectNestedLabelHierarchy(
    dialog,
    "mesurer.screenshot",
    ["Auto-copy", "Auto-download", "Include measurements"],
    "Screenshot",
  );
  const autoCopyX = await switchTrackX(autoCopy, "Screenshot Auto-copy");
  const screenshotPersistX = await persistTrackX(dialog);
  if (Math.abs(screenshotPersistX - autoCopyX) > 0.5) {
    throw new Error(`Expanded Screenshot setting is not aligned with Persist: ${JSON.stringify({ persistX: screenshotPersistX, autoCopyX })}`);
  }
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
  const restoredArrangeDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='mesurer.arrange']");
  await restoredArrangeDisclosure.waitFor({ state: "visible" });
  if ((await restoredArrangeDisclosure.getAttribute("aria-expanded")) !== "true") {
    throw new Error("Arrange disclosure state did not survive plugin disable/re-enable");
  }
  await dialog.locator("[data-mesurer-plugin-settings-controls='mesurer.arrange']").waitFor({ state: "visible" });
  await screenshotToggle.click();
  await waitForPlugin("mesurer.screenshot", false);
  await page.waitForTimeout(100);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForHarness("availability reload");
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

  const resetAvailability = await page.evaluate(() => {
    const stored = window.localStorage.getItem("mesurer-plugin-settings:availability");
    return stored ? JSON.parse(stored) : null;
  });
  const expectedAvailability = {
    "mesurer.context": true,
    "mesurer.arrange": false,
    "mesurer.screenshot": true,
  };
  const actualAvailability = resetAvailability?.enabled ?? {};
  const expectedEntries = Object.entries(expectedAvailability).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = Object.entries(actualAvailability).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`Use defaults persisted the wrong plugin availability: ${JSON.stringify(resetAvailability)}`);
  }
  if (resetAvailability?.state?.["mesurer.screenshot"]) {
    throw new Error("Enabled Screenshot kept a stale retained-state snapshot after defaults reset");
  }

  // Reload immediately after the reset and prove the final availability/settings snapshot is durable.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForHarness("defaults reload");
  dialog = await openSettings();
  await expectChecked(pluginToggle(dialog, "Context"), true, "Reloaded default Context plugin");
  await expectChecked(pluginToggle(dialog, "Arrange"), false, "Reloaded default Arrange plugin");
  await expectChecked(pluginToggle(dialog, "Screenshot"), true, "Reloaded default Screenshot plugin");
  await expandPlugin(dialog, "mesurer.screenshot");
  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Reloaded default Auto-copy");

  // A plugin that defaults off also gets its settings reset while preserving the off state.
  const reloadedArrangeToggle = pluginToggle(dialog, "Arrange");
  await reloadedArrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await expandPlugin(dialog, "mesurer.arrange");
  await expectChecked(settingSwitch(dialog, "Snapping"), true, "Arrange snapping after defaults reset");
  await reloadedArrangeToggle.click();
  await waitForPlugin("mesurer.arrange", false);

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
