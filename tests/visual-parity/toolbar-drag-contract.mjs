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

  await page.goto(process.env.TOOLBAR_RESPONSIVE_URL ?? "http://127.0.0.1:4192/responsive-preview.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  const responsiveToolbar = page.locator("[data-mesurer-toolbar='true']").first();
  const responsiveButton = page.locator("button[data-mesurer-builtin='responsive']").first();
  await responsiveButton.click();
  const preview = page.locator("iframe[data-mesurer-responsive-frame]").first();
  await preview.waitFor();

  const dragResponsiveToolbar = async (locator, label, overPreview) => {
    const before = await box(responsiveToolbar, `${label} toolbar before`);
    const target = await box(locator, `${label} target`);

    const startPoint = overPreview
      ? await locator.evaluate((surface) => {
        const rect = surface.getBoundingClientRect();
        const root = surface.getRootNode();
        const elementFromPoint = root.elementFromPoint?.bind(root) ?? document.elementFromPoint.bind(document);

        for (let inset = 1; inset <= 6; inset += 1) {
          for (const [x, y] of [
            [rect.left + inset, rect.top + inset],
            [rect.right - inset, rect.top + inset],
            [rect.left + inset, rect.bottom - inset],
            [rect.right - inset, rect.bottom - inset],
          ]) {
            if (elementFromPoint(x, y) === surface) return { x, y };
          }
        }

        return null;
      })
      : { x: target.x + target.width / 2, y: target.y + target.height / 2 };

    assert(startPoint, `${label}: expected an exposed empty point on the toolbar surface`);
    const startX = startPoint.x;
    const startY = startPoint.y;
    const previewBox = await box(preview, `${label} preview`);
    const endX = overPreview ? previewBox.x + previewBox.width - 20 : startX + 240;
    const endY = overPreview ? previewBox.y + previewBox.height - 20 : startY + 240;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 12 });
    await page.mouse.up();

    const after = await box(responsiveToolbar, `${label} toolbar after`);
    assert(
      movement(before, after) > 100,
      `${label}: toolbar should follow the pointer across Responsive (${before.x},${before.y} -> ${after.x},${after.y}, pointer ${startX},${startY} -> ${endX},${endY})`,
    );
    assert.equal(await page.locator("iframe[data-mesurer-responsive-frame]").count(), 1,
      `${label}: dropping toolbar must not close Responsive`);
    await responsiveButton.click();
    assert.equal(await page.locator("iframe[data-mesurer-responsive-frame]").count(), 0,
      `${label}: a click after drag must still toggle Responsive`);
    await responsiveButton.click();
    await preview.waitFor();
  };

  const selectButton = page.locator("button[data-mesurer-builtin='select']").first();
  await dragResponsiveToolbar(selectButton, "Button drag over stage", false);
  const toolbarSurface = page.locator(".mesurer-toolbar-surface").first();
  await dragResponsiveToolbar(toolbarSurface, "Empty-surface drag over preview", true);

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
