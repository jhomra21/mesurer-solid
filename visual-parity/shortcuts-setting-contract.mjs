import { chromium } from "playwright";

const baseUrl = process.env.SHORTCUTS_SETTING_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settingsButton = () => page.locator("button[data-mesurer-builtin='settings']").first();
const selectButton = () => page.locator("[data-mesurer-builtin='select'] button").first();
const arrangeButton = () => page.locator("button[data-mesurer-tool-id='arrange']").first();
const settingsDialog = () => page.getByRole("dialog", { name: "Settings" });

const openSettingsTab = async (name) => {
  await settingsButton().waitFor({ state: "visible" });
  if (!(await settingsDialog().isVisible())) await settingsButton().click();
  const dialog = settingsDialog();
  await dialog.waitFor({ state: "visible" });
  const tab = dialog.getByRole("tab", { name });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  return dialog;
};
const openGeneralSettings = () => openSettingsTab("General");

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

  // Host-page editors keep keyboard ownership even when focus is nested in Shadow DOM.
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "shortcuts-shadow-host";
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    input.id = "shortcuts-shadow-input";
    shadow.append(input);
    document.body.append(host);
    input.focus();
  });
  await page.keyboard.type("s");
  await page.waitForTimeout(50);
  await expectPressed(selectButton(), false, "Select while typing in a host Shadow DOM input");
  const hostInputValue = await page.evaluate(() =>
    document.querySelector("#shortcuts-shadow-host")?.shadowRoot?.querySelector("#shortcuts-shadow-input")?.value ?? "",
  );
  if (hostInputValue !== "s") throw new Error(`Host Shadow DOM input lost normal typing: ${JSON.stringify(hostInputValue)}`);

  // Mesurer-owned editors also keep normal typing, while Escape remains lifecycle handling.
  let dialog = await openSettingsTab("Guides");
  const guideHexInput = dialog.getByRole("textbox", { name: "Color hex value" });
  await guideHexInput.waitFor({ state: "visible" });
  await guideHexInput.focus();
  await page.keyboard.type("s");
  await page.waitForTimeout(50);
  await expectPressed(selectButton(), false, "Select while typing inside Mesurer");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  dialog = await openGeneralSettings();
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
  console.log("Global Shortcuts setting contract passed: host/Mesurer keyboard ownership, Shadow DOM focus, persisted on/off gate, toolbar independence, plugin gate, and Escape lifecycle behavior.");
} finally {
  await browser.close();
}
