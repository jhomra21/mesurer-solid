import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TOOLBAR_DRAG_URL ?? "http://127.0.0.1:4174/";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const box = async (locator, label) => {
  const value = await locator.boundingBox();

  assert(value, `${label}: expected rendered geometry`);

  return value;
};

const movement = (before, after) => Math.max(
  Math.abs(after.x - before.x),
  Math.abs(after.y - before.y),
);

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const toolbar = page.locator("[data-mesurer-toolbar='true']").first();
  const settings = page.getByRole("button", { name: /^Settings/ }).first();
  const guideMenuButton = page.getByRole("button", { name: "Guide orientation menu", exact: true }).first();

  await toolbar.waitFor({ state: "visible" });
  await settings.waitFor({ state: "visible" });
  await guideMenuButton.waitFor({ state: "visible" });

  await settings.click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "visible" });
  await settings.click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "hidden" });

  await guideMenuButton.click();
  const guideMenu = page.getByRole("menu").last();

  await guideMenu.waitFor({ state: "visible" });
  assert.equal(await guideMenuButton.getAttribute("aria-expanded"), "true");
  await guideMenuButton.click();
  await guideMenu.waitFor({ state: "hidden" });
  assert.equal(await guideMenuButton.getAttribute("aria-expanded"), "false");

  const dragFrom = async (locator, label) => {
    const before = await box(toolbar, `${label} toolbar before`);
    const target = await box(locator, `${label} target`);
    const startX = target.x + target.width / 2;
    const startY = target.y + target.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 54, startY + 38, { steps: 8 });
    await page.mouse.up();

    const after = await box(toolbar, `${label} toolbar after`);

    assert(
      movement(before, after) > 20,
      `${label}: toolbar should move after crossing drag slop`,
    );

    return after;
  };

  await settings.click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "visible" });
  await dragFrom(settings, "Settings trigger");
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "hidden" });

  await guideMenuButton.click();
  await guideMenu.waitFor({ state: "visible" });
  await dragFrom(guideMenuButton, "Guide menu trigger");
  await guideMenu.waitFor({ state: "hidden" });
  assert.equal(await guideMenuButton.getAttribute("aria-expanded"), "false");

  await guideMenuButton.click();
  await guideMenu.waitFor({ state: "visible" });
  const menuItem = guideMenu.locator("button").first();
  const beforeMenuDrag = await box(toolbar, "menu-owned toolbar before");
  const item = await box(menuItem, "guide menu item");
  const itemX = item.x + item.width / 2;
  const itemY = item.y + item.height / 2;

  await page.mouse.move(itemX, itemY);
  await page.mouse.down();
  await page.mouse.move(itemX + 40, itemY + 18, { steps: 6 });
  await page.mouse.up();

  const afterMenuDrag = await box(toolbar, "menu-owned toolbar after");

  assert(
    movement(beforeMenuDrag, afterMenuDrag) <= 1,
    "Dragging inside an open menu must not move the toolbar",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);

  console.log("Toolbar drag ownership contract: PASS", {
    settingsReclick: true,
    guideMenuReclick: true,
    settingsTriggerDrag: true,
    guideTriggerDrag: true,
    menuOwnsPointer: true,
  });
} finally {
  await browser.close();
}
