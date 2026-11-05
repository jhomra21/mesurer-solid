import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.SETTINGS_INTERACTIONS_URL ?? "http://127.0.0.1:4174/";

const output = process.env.SETTINGS_INTERACTIONS_OUT ?? "settings-interactions-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const errors = [];

const evidence = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settingsButton = page.locator("button[data-mesurer-builtin='settings']").first();

const dialog = page.getByRole("dialog", { name: "Settings", exact: true });

const toolbar = page.locator("[data-mesurer-toolbar='true']").first();

const guideLines = page.locator("[data-mesurer-guide='true'] > div");

const region = (name) => dialog.getByRole("region", { name, exact: true });

const openSettings = async () => {
  await settingsButton.waitFor({ state: "visible" });

  if (!(await dialog.isVisible())) await settingsButton.click();
  await dialog.waitFor({ state: "visible" });
};

const closeSettings = async () => {
  if (await dialog.isVisible()) await settingsButton.click();
  await dialog.waitFor({ state: "hidden" });
};

const storedRaw = () => page.evaluate(() => JSON.parse(localStorage.getItem("mesurer-settings") ?? "null"));

// Persistence writes settle after the interaction, so poll the stored value instead of reading once.
const expectStored = async (read, expected, label) => {
  let actual;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    actual = await read(await storedRaw());

    if (JSON.stringify(actual) === JSON.stringify(expected)) return;
    await page.waitForTimeout(50);
  }

  assert.deepEqual(actual, expected, `${label}: persisted state`);
};

// The playground host persists the page workspace under its own key, apart from the "mesurer-settings" record.
const storedGuideCount = () => page.evaluate(() => {
  const keys = Object.keys(localStorage).filter((key) => key === "mesurer-parity-playground");

  return keys.reduce((total, key) => {
    const record = JSON.parse(localStorage.getItem(key) ?? "null");
    const pages = record?.pages ? Object.values(record.pages) : record?.workspace ? [record.workspace] : [];

    return total + pages.reduce((count, workspace) => count + (workspace.guides?.length ?? 0), 0);
  }, 0);
});

const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";

const toggle = async (section, label, expected, key, read) => {
  await openSettings();
  const control = region(section).getByRole("switch", { name: label, exact: true });
  await control.waitFor({ state: "visible" });
  await control.click();
  assert.equal(await checked(control), expected, `${label} switch reflects the click`);
  await expectStored(read, expected, `${label}`);
  evidence.push({ toggled: label, key, value: expected });
};

const settingsOf = (raw) => raw?.settings ?? {};

const guideStyleOf = async (index = 0) => guideLines.nth(index).evaluate((element) => {
  const style = getComputedStyle(element);

  return { backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor };
});

const createGuide = async (x) => {
  await closeSettings();
  await page.getByRole("button", { name: /^Guides/ }).first().click();
  await page.mouse.move(x, 400);
  await page.mouse.click(x, 400);
  await page.getByRole("button", { name: /^Guides/ }).first().click();
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__MESURER__.ready());
  await openSettings();

  // Arrow keys in a numeric input update the draft and the setting together: Tab must not revert them.
  const weight = region("Guide settings").getByRole("textbox", { name: "Weight value", exact: true });
  await weight.focus();
  assert.equal(await weight.inputValue(), "1px", "Guide Weight starts at 1px");
  await page.keyboard.press("ArrowUp");
  assert.equal(await weight.inputValue(), "2px", "ArrowUp updates the visible draft");
  await page.keyboard.press("Tab");
  assert.equal(await weight.inputValue(), "2px", "Blur keeps the arrow-key value");
  await expectStored((raw) => settingsOf(raw).guideStyle?.width, 2, "Guide Weight after ArrowUp, Tab");
  assert.equal(await region("Guide settings").getByRole("slider", { name: "Weight" }).getAttribute("aria-valuenow"), "2");
  await weight.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expectStored((raw) => settingsOf(raw).guideStyle?.width, 1, "Guide Weight after ArrowDown, Tab");
  evidence.push({ weightArrowKeys: "1px -> 2px -> 1px, persisted after Tab" });

  // Guide pattern: radio state, persisted pattern, Length/Gap rows, and the rendered guide line.
  await createGuide(420);
  await openSettings();
  await guideLines.first().waitFor({ state: "attached" });
  assert.equal((await guideStyleOf()).backgroundImage, "none", "Solid guide has no gradient");

  for (const [pattern, label, gradient] of [["dashed", "Dashed guide pattern", "repeating-linear-gradient"], ["dotted", "Dotted guide pattern", "radial-gradient"]]) {
    const radio = region("Guide settings").getByRole("radio", { name: label, exact: true });
    await radio.click();
    assert.equal(await checked(radio), true, `${label} becomes checked`);
    assert.equal(await region("Guide settings").getByRole("radio", { name: "Solid guide pattern", exact: true }).getAttribute("aria-checked"), "false");
    await expectStored((raw) => settingsOf(raw).guideStyle?.pattern, pattern, label);
    assert.equal(await region("Guide settings").getByRole("slider", { name: "Length" }).count(), 1, `${pattern} exposes Length`);
    assert.equal(await region("Guide settings").getByRole("slider", { name: "Gap" }).count(), 1, `${pattern} exposes Gap`);
    assert((await guideStyleOf()).backgroundImage.includes(gradient), `${pattern} guide renders ${gradient}`);
  }

  await region("Guide settings").getByRole("radio", { name: "Solid guide pattern", exact: true }).click();
  await expectStored((raw) => settingsOf(raw).guideStyle?.pattern, "solid", "Solid guide pattern");
  assert.equal(await region("Guide settings").getByRole("slider", { name: "Length" }).count(), 0, "Solid hides Length");
  assert.equal((await guideStyleOf()).backgroundImage, "none", "Solid guide returns to a plain line");

  // Switches: default value, click, persisted model value.
  await toggle("Guide settings", "Snap", false, "snapGuidesEnabled", (raw) => settingsOf(raw).snapGuidesEnabled);
  await toggle("Guide settings", "Highlight", false, "selectNewGuideEnabled", (raw) => settingsOf(raw).selectNewGuideEnabled);
  await toggle("Inspect settings", "Hover", false, "hoverHighlightEnabled", (raw) => settingsOf(raw).hoverHighlightEnabled);
  await toggle("Inspect settings", "Element snap", false, "snapEnabled", (raw) => settingsOf(raw).snapEnabled);
  await toggle("Inspect settings", "Stack", true, "multiMeasureEnabled", (raw) => settingsOf(raw).multiMeasureEnabled);
  await toggle("Ruler settings", "Edge reveal", true, "rulerSettings.edgeReveal", (raw) => settingsOf(raw).rulerSettings?.edgeReveal);

  // Color picker format popup: real listbox, multi-select, and the last selected format cannot be removed.
  await openSettings();
  const formats = region("Color settings").getByRole("combobox", { name: "Color formats", exact: true });
  await formats.click();
  const listbox = region("Color settings").getByRole("listbox", { name: "Color formats" });
  await listbox.waitFor({ state: "visible" });
  assert.equal(await formats.getAttribute("aria-expanded"), "true");
  const option = (name) => listbox.getByRole("option", { name, exact: true });
  assert.deepEqual(await listbox.getByRole("option").allTextContents(), ["hex", "rgb", "hsl", "oklch"]);
  assert.equal(await option("hsl").getAttribute("aria-selected"), "false");
  await option("hsl").click();
  assert.equal(await option("hsl").getAttribute("aria-selected"), "true");
  await expectStored((raw) => [...(settingsOf(raw).colorPickerFormats ?? [])].sort(), ["hex", "hsl", "oklch", "rgb"], "Format hsl added");

  for (const name of ["hex", "rgb", "oklch"]) {
    await option(name).click();
    assert.equal(await option(name).getAttribute("aria-selected"), "false", `${name} removed`);
  }

  await expectStored((raw) => settingsOf(raw).colorPickerFormats, ["hsl"], "Only hsl left");
  assert.equal((await formats.textContent())?.trim(), "hsl", "Trigger shows the remaining format");
  await option("hsl").click();
  assert.equal(await option("hsl").getAttribute("aria-selected"), "true", "The last selected format is not removed");
  await expectStored((raw) => settingsOf(raw).colorPickerFormats, ["hsl"], "Last format refused");
  await page.keyboard.press("Escape");
  await listbox.waitFor({ state: "hidden" });
  await openSettings();
  const copy = region("Color settings").getByRole("combobox", { name: "Copy", exact: true });
  await copy.selectOption("hsl");
  await expectStored((raw) => settingsOf(raw).colorPickerClickFormat, "hsl", "Copy format");

  // Dock and Auto-hide: Snap reveals Auto-hide, the toolbar docks, tucks away, and reveals under the pointer.
  const dock = region("General settings").getByRole("combobox", { name: "Toolbar dock", exact: true });
  assert.equal(await region("General settings").getByRole("switch", { name: "Auto-hide", exact: true }).count(), 0, "Free dock has no Auto-hide row");
  await dock.selectOption("snap");
  await expectStored((raw) => settingsOf(raw).toolbarDock, "snap", "Dock Snap");
  const autoHide = region("General settings").getByRole("switch", { name: "Auto-hide", exact: true });
  await autoHide.waitFor({ state: "visible" });
  assert.equal(await checked(autoHide), false);
  await closeSettings();
  const start = await toolbar.boundingBox();
  assert(start);
  await page.mouse.move(start.x + 8, start.y + 8);
  await page.mouse.down();
  await page.mouse.move(640, 500, { steps: 8 });
  await page.mouse.move(640, 24, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await toolbar.getAttribute("data-dock-edge"), "top", "Snap docks the toolbar to an edge");
  await openSettings();
  await autoHide.click();
  assert.equal(await checked(autoHide), true);
  await expectStored((raw) => settingsOf(raw).toolbarAutoHide, true, "Auto-hide on");
  await closeSettings();
  await page.mouse.move(900, 900);
  await page.waitForTimeout(1000);
  assert.equal(await toolbar.getAttribute("data-tucked"), "true", "Auto-hide tucks the docked toolbar");
  const tucked = await toolbar.boundingBox();
  assert(tucked);
  await page.mouse.move(tucked.x + tucked.width / 2, Math.max(1, tucked.y + 1));
  await page.waitForTimeout(450);
  assert.notEqual(await toolbar.getAttribute("data-tucked"), "true", "Pointer reveals the tucked toolbar");
  await openSettings();
  await autoHide.click();
  await expectStored((raw) => settingsOf(raw).toolbarAutoHide, false, "Auto-hide off");
  await dock.selectOption("free");
  await expectStored((raw) => settingsOf(raw).toolbarDock, "free", "Dock Free");
  assert.equal(await region("General settings").getByRole("switch", { name: "Auto-hide", exact: true }).count(), 0, "Free dock removes Auto-hide again");
  assert.equal(await toolbar.getAttribute("data-dock-edge"), null, "Free dock releases the toolbar edge");
  evidence.push({ dock: "free -> snap(top) -> auto-hide tuck/reveal -> free" });

  // Persist: the workspace survives reload only while Persist is on.
  const persist = region("General settings").getByRole("switch", { name: "Persist", exact: true });
  assert.equal(await checked(persist), false, "Persist defaults off");
  await persist.click();
  await expectStored((raw) => settingsOf(raw).persistOnReload, true, "Persist on");
  await createGuide(560);
  assert.equal(await guideLines.count(), 2, "A second guide is created while Persist is on");
  await expectStored(storedGuideCount, 2, "Persisted workspace holds both guides");
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => window.__MESURER__.ready());
  await guideLines.first().waitFor({ state: "attached" });
  assert.equal(await guideLines.count(), 2, "Persisted guides are restored after reload");
  await openSettings();
  assert.equal(await checked(region("General settings").getByRole("switch", { name: "Persist", exact: true })), true, "Persist restored");

  // Use defaults restores every changed setting, and Clear workspace removes the guide for good.
  await region("General settings").getByRole("button", { name: "Reset settings to defaults", exact: true }).click();

  const defaults = [
    ["Guide settings", "Snap", true], ["Guide settings", "Highlight", true], ["Inspect settings", "Hover", true],
    ["Inspect settings", "Element snap", true], ["Inspect settings", "Stack", false], ["Ruler settings", "Edge reveal", false],
    ["General settings", "Persist", false],
  ];

  for (const [section, label, expected] of defaults) {
    assert.equal(await checked(region(section).getByRole("switch", { name: label, exact: true })), expected, `${label} back to its default`);
  }

  assert.equal((await region("Color settings").getByRole("combobox", { name: "Color formats" }).textContent())?.trim(), "hex, rgb, oklch", "Formats back to default");
  assert.equal(await region("Color settings").getByRole("combobox", { name: "Copy" }).inputValue(), "hex");
  assert.equal(await region("General settings").getByRole("combobox", { name: "Toolbar dock" }).inputValue(), "free");
  await expectStored((raw) => {
    const settings = settingsOf(raw);

    return [settings.persistOnReload ?? false, settings.snapGuidesEnabled ?? true, settings.multiMeasureEnabled ?? false, settings.colorPickerFormats?.join(",") ?? "hex,rgb,oklch"];
  }, [false, true, false, "hex,rgb,oklch"], "Use defaults");

  assert.equal(await guideLines.count(), 2, "Use defaults leaves the workspace guides alone");
  await region("General settings").getByRole("button", { name: "Clear workspace", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-mesurer-guide='true']").length === 0
    || [...document.querySelectorAll("*")].every((element) => !element.shadowRoot || element.shadowRoot.querySelectorAll("[data-mesurer-guide='true']").length === 0));
  assert.equal(await guideLines.count(), 0, "Clear workspace removes every guide");
  await expectStored(storedGuideCount, 0, "Clear workspace");
  await page.screenshot({ path: join(output, "settings-after-clear-workspace.png") });

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "result.json"), JSON.stringify({ passed: true, evidence }, null, 2));
  console.log("Settings interactions contract: PASS", evidence.length, "checks");
} finally {
  await page.close();
  await browser.close();
}
