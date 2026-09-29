import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.PRESENTATION_SETTINGS_URL ?? "http://127.0.0.1:4174/";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settingsButton = () => page.locator("button[data-mesurer-builtin='settings']").first();

const settingsDialog = () => page.getByRole("dialog", { name: "Settings" });

const openGeneral = async () => {
  await settingsButton().waitFor({ state: "visible" });

  if (!(await settingsDialog().isVisible())) await settingsButton().click();
  await settingsDialog().waitFor({ state: "visible" });
  const general = settingsDialog().getByRole("tab", { name: "General", exact: true });

  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  const section = settingsDialog().locator("section[aria-label='General settings']");
  await section.waitFor({ state: "visible" });

  return section;
};

const presentationSwitch = (section, label) => section.getByRole("switch", { name: label, exact: true });

const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";

const expectChecked = async (control, expected, label) => {
  assert.equal(await checked(control), expected, `${label} expected ${expected ? "on" : "off"}`);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  let general = await openGeneral();
  let keepText = presentationSwitch(general, "Keep text changes");
  let keepEdit = presentationSwitch(general, "Keep Edit changes");

  await keepText.waitFor({ state: "visible" });
  await keepEdit.waitFor({ state: "visible" });
  assert.equal(await keepText.count(), 1, "General must expose exactly one Keep text changes switch");
  assert.equal(await keepEdit.count(), 1, "General must expose exactly one Keep Edit changes switch");
  assert.equal(await keepText.getAttribute("data-mesurer-presentation-setting"), "keep-text-changes");
  assert.equal(await keepEdit.getAttribute("data-mesurer-presentation-setting"), "keep-arrange-changes");
  await expectChecked(keepText, false, "Keep text changes default");
  await expectChecked(keepEdit, false, "Keep Edit changes default");

  await keepText.click();
  await keepEdit.click();
  await expectChecked(keepText, true, "Keep text changes after enable");
  await expectChecked(keepEdit, true, "Keep Edit changes after enable");

  // These are persisted presentation-policy bits, not one-panel transient state.
  // Reload and prove the user can rely on the switches as the durable control for
  // Original vs Desired presentation outside Edit.
  await page.reload({ waitUntil: "networkidle" });
  general = await openGeneral();
  keepText = presentationSwitch(general, "Keep text changes");
  keepEdit = presentationSwitch(general, "Keep Edit changes");
  await keepText.waitFor({ state: "visible" });
  await keepEdit.waitFor({ state: "visible" });
  await expectChecked(keepText, true, "Persisted Keep text changes");
  await expectChecked(keepEdit, true, "Persisted Keep Edit changes");

  // Restore defaults so this contract leaves its browser profile deterministic.
  await keepText.click();
  await keepEdit.click();
  await expectChecked(keepText, false, "Restored Keep text changes default");
  await expectChecked(keepEdit, false, "Restored Keep Edit changes default");

  assert.deepEqual(errors, [], `Browser errors: ${errors.join("\n")}`);
  console.log("General presentation settings are visible, default-off, and persist across reload: PASS");
} finally {
  await page.close();
  await browser.close();
}
