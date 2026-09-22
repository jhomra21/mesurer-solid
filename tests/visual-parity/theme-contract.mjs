import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.THEME_URL ?? "http://127.0.0.1:4174/plugin-settings.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const island = () => page.locator("[data-mesurer-island='true']");

const rendererRoot = () => page.locator("[data-mesurer-root='true']").first();

const toolbar = () => page.locator(".mesurer-toolbar-surface").first();

const contextRoot = () => page.locator("[data-mesurer-context-root='true']").first();

const waitForHarness = () =>
  page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));

const openGeneralSettings = async () => {
  const button = island().locator("[data-mesurer-builtin='settings'] button").first();
  await button.waitFor({ state: "visible" });

  const dialog = island().getByRole("dialog", { name: "Settings" });

  if (!await dialog.isVisible()) await button.click();
  await dialog.waitFor({ state: "visible" });

  const general = dialog.getByRole("tab", { name: "General" });

  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();

  return dialog;
};

const surfaceColor = (locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

const textColor = (locator) =>
  locator.evaluate((element) => getComputedStyle(element).color);

const expectTheme = async (theme) => {
  assert.equal(await rendererRoot().getAttribute("data-theme"), theme, "renderer root theme");
  assert.equal(await contextRoot().getAttribute("data-theme"), theme, "document Context theme");
};

const expectToolbarColor = async (expected, label) => {
  const actual = await surfaceColor(toolbar());
  assert.equal(actual, expected, label);
};

try {
  await page.goto(`${url}?reset=1`, { waitUntil: "domcontentloaded" });
  await waitForHarness();
  await contextRoot().waitFor({ state: "attached" });

  let dialog = await openGeneralSettings();
  const appearance = dialog.getByRole("combobox", { name: "Appearance" });

  assert.equal(await appearance.inputValue(), "system", "default appearance should follow the system");
  await expectTheme("system");

  await appearance.selectOption("dark");
  await expectTheme("dark");
  await expectToolbarColor("rgb(50, 50, 50)", "dark toolbar surface");
  assert.equal(await textColor(dialog), "rgb(245, 245, 245)", "dark Settings text");

  const typographyButton = island().locator("[data-mesurer-builtin='text-inspector'] button").first();
  await typographyButton.click();
  const target = page.locator("#settings-target");
  const targetBox = await target.boundingBox();
  assert(targetBox, "Typography target should render");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const typographyCard = page.locator(".mesurer-ti-card").first();
  await typographyCard.waitFor({ state: "visible" });
  const typographyRoot = typographyCard.locator("xpath=ancestor-or-self::*[@data-mesurer-inspector-ui='true'][1]");
  assert.equal(await typographyRoot.getAttribute("data-theme"), "dark", "document Typography theme");
  assert.equal(await surfaceColor(typographyCard), "rgb(58, 58, 58)", "dark Typography surface");

  await typographyButton.click();
  dialog = await openGeneralSettings();
  const appearanceAgain = dialog.getByRole("combobox", { name: "Appearance" });
  await appearanceAgain.selectOption("light");
  await expectTheme("light");
  await expectToolbarColor("rgb(255, 255, 255)", "light toolbar surface");

  await appearanceAgain.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme("system");
  await expectToolbarColor("rgb(50, 50, 50)", "system dark toolbar surface");
  await page.emulateMedia({ colorScheme: "light" });
  await expectToolbarColor("rgb(255, 255, 255)", "system light toolbar surface");

  await appearanceAgain.selectOption("dark");
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem("mesurer-settings");

    return raw?.includes('"theme":"dark"') ?? false;
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForHarness();
  await contextRoot().waitFor({ state: "attached" });
  await expectTheme("dark");
  await expectToolbarColor("rgb(50, 50, 50)", "persisted dark toolbar surface");

  dialog = await openGeneralSettings();
  assert.equal(
    await dialog.getByRole("combobox", { name: "Appearance" }).inputValue(),
    "dark",
    "Appearance should restore from persisted settings",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Theme contract: PASS", {
    system: true,
    light: true,
    dark: true,
    contextDocumentMount: true,
    typographyDocumentMount: true,
    persisted: true,
  });
} finally {
  await browser.close();
}
