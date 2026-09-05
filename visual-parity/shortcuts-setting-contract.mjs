import { chromium } from "playwright";

const baseUrl = process.env.SHORTCUTS_SETTING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const island = () => page.locator("[data-mesurer-island='true']");
const settingsButton = () => island().locator("[data-mesurer-builtin='settings'] button").first();
const selectButton = () => island().locator("[data-mesurer-builtin='select'] button").first();
const arrangeButton = () => island().locator("[data-mesurer-tool-id='arrange'] button").first();
const settingsDialog = () => island().getByRole("dialog", { name: "Settings" });

const openGeneralSettings = async () => {
  await settingsButton().waitFor({ state: "visible" });
  if (!(await settingsDialog().isVisible())) await settingsButton().click();
  const dialog = settingsDialog();
  await dialog.waitFor({ state: "visible" });
  const general = dialog.getByRole("tab", { name: "General" });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  return dialog;
};

const pressed = async (button) => (await button.getAttribute("aria-pressed")) === "true";
const expectPressed = async (button, expected, label) => {
  const actual = await pressed(button);
  if (actual !== expected) {
    throw new Error(`${label} expected aria-pressed=${expected}, got ${actual}`);
  }
};
const expectChecked = async (control, expected, label) => {
  const actual = (await control.getAttribute("aria-checked")) === "true";
  if (actual !== expected) {
    throw new Error(`${label} expected aria-checked=${expected}, got ${actual}`);
  }
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await settingsButton().waitFor({ state: "visible" });
  await selectButton().waitFor({ state: "visible" });
  await arrangeButton().waitFor({ state: "visible" });
  await expectPressed(selectButton(), false, "Initial Select");
  await expectPressed(arrangeButton(), false, "Initial Arrange");

  let dialog = await openGeneralSettings();
  let shortcuts = dialog.getByRole("switch", { name: "Shortcuts", exact: true });
  await shortcuts.waitFor({ state: "visible" });
  await expectChecked(shortcuts, true, "Default Shortcuts setting");

  await shortcuts.click();
  await expectChecked(shortcuts, false, "Disabled Shortcuts setting");

  // Escape is lifecycle/cancel behavior, not a configurable global shortcut.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.keyboard.press("s");
  await page.waitForTimeout(50);
  await expectPressed(selectButton(), false, "Select while shortcuts disabled");

  await page.keyboard.press("Shift+a");
  await page.waitForTimeout(50);
  await expectPressed(arrangeButton(), false, "Arrange while shortcuts disabled");

  // Disabling shortcuts never disables direct toolbar controls.
  await selectButton().click();
  await expectPressed(selectButton(), true, "Select toolbar action while shortcuts disabled");
  await selectButton().click();
  await expectPressed(selectButton(), false, "Select toolbar toggle while shortcuts disabled");

  // The preference persists independently of workspace persistence.
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settingsButton().waitFor({ state: "visible" });
  await selectButton().waitFor({ state: "visible" });
  await page.keyboard.press("s");
  await page.waitForTimeout(50);
  await expectPressed(selectButton(), false, "Select after reload with shortcuts disabled");

  dialog = await openGeneralSettings();
  shortcuts = dialog.getByRole("switch", { name: "Shortcuts", exact: true });
  await shortcuts.waitFor({ state: "visible" });
  await expectChecked(shortcuts, false, "Persisted Shortcuts setting");

  await shortcuts.click();
  await expectChecked(shortcuts, true, "Re-enabled Shortcuts setting");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await page.keyboard.press("s");
  await expectPressed(selectButton(), true, "Select after shortcuts re-enabled");

  if (errors.length) throw new Error(`Browser diagnostics were not clean: ${errors.join("\n")}`);
  console.log("Global Shortcuts setting contract passed: persisted on/off gate, toolbar independence, plugin gate, and Escape lifecycle behavior.");
} finally {
  await browser.close();
}
