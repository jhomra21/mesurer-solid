import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.env.TOOLBAR_VERTICAL_URL ?? "http://127.0.0.1:4174/";

const output = process.env.TOOLBAR_VERTICAL_OUT ?? "vertical-toolbar-artifacts";

const dprs = process.env.TOOLBAR_VERTICAL_DPRS
  ? process.env.TOOLBAR_VERTICAL_DPRS.split(",").map(Number)
  : [1, 1.25];

const edges = ["left", "right"];

const modes = ["select", "edit"];

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const evidence = [];

const errors = [];

const inventory = async (toolbar) => toolbar.evaluate((element) => {
  const visible = (node) => {
    const rect = node.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
  };

  const buttons = [...element.querySelectorAll("button")].filter(visible);

  return buttons.map((button, order) => {
    const rect = button.getBoundingClientRect();
    const group = button.closest('[role="group"]');
    const pluginMenu = button.closest("[data-mesurer-plugin-menu-root]");
    const guideMenu = button.closest("[data-mesurer-builtin='guides-menu']");
    const mode = button.getAttribute("data-mesurer-toolbar-mode");

    return {
      order,
      role: button.getAttribute("role") ?? "button",
      label: button.getAttribute("aria-label") ?? button.getAttribute("title") ?? "",
      group: group?.getAttribute("aria-label") ?? (mode ? "Toolbar mode" : "Ungrouped"),
      menu: button.hasAttribute("aria-haspopup")
        || button.hasAttribute("data-mesurer-tool-menu-trigger")
        || button.hasAttribute("data-mesurer-plugin-menu-trigger")
        || button.hasAttribute("data-mesurer-builtin") && button.getAttribute("data-mesurer-builtin") === "guides-menu",
      expanded: button.getAttribute("aria-expanded"),
      active: button.getAttribute("aria-pressed"),
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      splitOwner: pluginMenu?.getAttribute("data-mesurer-tool-menu-root")
        ?? (guideMenu ? "guides" : null),
    };
  });
});

const primaryIconCenters = async (toolbar) => toolbar.evaluate((element) => {
  const isControl = (button) =>
    button.matches("[data-mesurer-toolbar-mode], [data-mesurer-builtin]:not([data-mesurer-builtin='guides-menu']), [data-mesurer-tool-id]");

  return [...element.querySelectorAll("button")].flatMap((button) => {
      const rect = button.getBoundingClientRect();

      if (!(rect.width > 0 && rect.height > 0
        && getComputedStyle(button).visibility !== "hidden"
        && isControl(button)
        && !button.hasAttribute("data-mesurer-tool-menu-trigger"))) return [];

      return {
        label: button.getAttribute("aria-label"),
        centerX: rect.left + rect.width / 2,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
});

const menuTriggerPairs = async (toolbar) => toolbar.evaluate((element) => {
  return [...element.querySelectorAll("button[aria-haspopup='menu'], button[data-mesurer-tool-menu-trigger]")].flatMap((trigger) => {
      const rect = trigger.getBoundingClientRect();

      if (!(rect.width > 0 && rect.height > 0 && getComputedStyle(trigger).visibility !== "hidden")) return [];

      const pluginRoot = trigger.closest("[data-mesurer-plugin-menu-root]");
      const guideRoot = trigger.closest("[data-mesurer-builtin='guides-menu']");
      const modeRoot = trigger.closest("[data-mesurer-toolbar-edit-control]");

      const owner = pluginRoot
        ? pluginRoot.querySelector("button:not([data-mesurer-tool-menu-trigger])")
        : guideRoot
          ? element.querySelector("button[data-mesurer-builtin='guides']")
          : modeRoot
            ? modeRoot.querySelector("button[data-mesurer-toolbar-mode='edit']")
            : null;

      const triggerRect = trigger.getBoundingClientRect();
      const ownerRect = owner?.getBoundingClientRect();

      return [{
        label: trigger.getAttribute("aria-label"),
        triggerCenterX: triggerRect.left + triggerRect.width / 2,
        ownerCenterX: ownerRect ? ownerRect.left + ownerRect.width / 2 : null,
        triggerBounds: { x: triggerRect.x, y: triggerRect.y, width: triggerRect.width, height: triggerRect.height },
        ownerBounds: ownerRect ? { x: ownerRect.x, y: ownerRect.y, width: ownerRect.width, height: ownerRect.height } : null,
        ownerFound: Boolean(owner),
      }];
    });
});

const modePillGeometry = async (toolbar, mode) => toolbar.evaluate((element, selectedMode) => {
  const pill = element.querySelector(".mesurer-toolbar-mode-switch-pill");
  const button = element.querySelector(`[data-mesurer-toolbar-mode="${selectedMode}"]`);
  const pillRect = pill?.getBoundingClientRect();
  const buttonRect = button?.getBoundingClientRect();

  return pillRect && buttonRect
    ? {
        pillCenterX: pillRect.left + pillRect.width / 2,
        buttonCenterX: buttonRect.left + buttonRect.width / 2,
        pillBounds: { x: pillRect.x, y: pillRect.y, width: pillRect.width, height: pillRect.height },
        buttonBounds: { x: buttonRect.x, y: buttonRect.y, width: buttonRect.width, height: buttonRect.height },
      }
    : null;
}, mode);

const toolbarBounds = async (toolbar) => {
  const rect = await toolbar.boundingBox();
  assert(rect, "toolbar is rendered");

  return rect;
};

const assertDockGeometry = async (page, toolbar, edge, label) => {
  const rect = await toolbarBounds(toolbar);
  const viewport = page.viewportSize();

  const inset = edge === "left" ? rect.x
    : edge === "right" ? viewport.width - rect.x - rect.width
      : edge === "top" ? rect.y
        : viewport.height - rect.y - rect.height;

  const axisCenter = edge === "left" || edge === "right"
    ? rect.y + rect.height / 2
    : rect.x + rect.width / 2;

  const expectedCenter = edge === "left" || edge === "right"
    ? viewport.height / 2
    : viewport.width / 2;

  assert(Math.abs(inset - 16) <= 0.5, `${label} ${edge} edge inset: ${inset}`);
  assert(Math.abs(axisCenter - expectedCenter) <= 0.5,
    `${label} ${edge} dock-axis center: ${axisCenter} != ${expectedCenter}`);

  return rect;
};

const dockAt = async (page, toolbar, edge, mode) => {
  const initial = await toolbarBounds(toolbar);
  await page.mouse.move(initial.x + 8, initial.y + 8);
  await page.mouse.down();
  await page.mouse.move(initial.x + 13, initial.y + 13);
  await page.mouse.up();
  await page.mouse.move(initial.x + 8, initial.y + 8);
  await page.mouse.down();
  await page.mouse.move(initial.x + 68, initial.y + 48, { steps: 8 });
  await page.mouse.up();

  await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((entry) => entry.endsWith(":toolbar-position"));

    if (!key) return;
    const position = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.setItem(key, JSON.stringify(position));
  });
  await page.reload({ waitUntil: "networkidle" });
  await toolbar.waitFor();
  const modeButton = toolbar.locator(`[data-mesurer-toolbar-mode="${mode}"]`);

  if (await modeButton.getAttribute("aria-pressed") !== "true") {
    await modeButton.click();
    await page.waitForTimeout(200);
  }

  const settings = page.getByRole("button", { name: /^Settings/ }).first();
  await settings.click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await settingsDialog.waitFor({ state: "visible" });
  await settingsDialog.getByRole("tab", { name: "General" }).click();
  const dock = page.getByRole("combobox", { name: "Toolbar dock" });
  await dock.waitFor({ state: "visible" });
  await dock.selectOption("snap");
  await settings.click();

  const rect = await toolbarBounds(toolbar);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(640, 500, { steps: 12 });

  const target = edge === "left" ? { x: 24, y: 500 }
    : edge === "right" ? { x: 1256, y: 500 }
      : edge === "top" ? { x: 640, y: 24 }
        : { x: 640, y: 976 };

  await page.mouse.move(target.x, target.y, { steps: 16 });
  // Let the real layout finish turning while the pointer remains held.
  await page.waitForTimeout(500);
  const renderedBeforeRelease = await toolbarBounds(toolbar);
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.equal(await toolbar.getAttribute("data-dock-edge"), edge);

  const renderedAfterRelease = await assertDockGeometry(page, toolbar, edge, "after release");

  const positionKey = await page.evaluate(() =>
    Object.keys(sessionStorage).find((entry) => entry.endsWith(":toolbar-position")));

  assert(positionKey, "toolbar position is persisted in session storage");
  const savedPosition = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), positionKey);
  assert(Math.abs(savedPosition.x - renderedAfterRelease.x) <= 0.5
    && Math.abs(savedPosition.y - renderedAfterRelease.y) <= 0.5,
  `persisted position matches rendered ${edge} toolbar: ${JSON.stringify({ savedPosition, renderedAfterRelease, renderedBeforeRelease })}`);
  await page.reload({ waitUntil: "networkidle" });
  await toolbar.waitFor();

  const restoredMode = toolbar.locator(`[data-mesurer-toolbar-mode="${mode}"]`);

  if (await restoredMode.getAttribute("aria-pressed") !== "true") {
    await restoredMode.click();
  }

  await page.waitForTimeout(500);
  const afterReload = await assertDockGeometry(page, toolbar, edge, "after reload");
  const reloadedPosition = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), positionKey);
  assert(Math.abs(reloadedPosition.x - afterReload.x) <= 0.5
    && Math.abs(reloadedPosition.y - afterReload.y) <= 0.5,
  `reloaded ${edge} persisted position matches rendered geometry: ${JSON.stringify({ reloadedPosition, afterReload })}`);
  evidence.push({
    dock: edge,
    releasePauseMs: 500,
    renderedBeforeRelease,
    renderedAfterRelease,
    savedPosition,
    afterReload,
    reloadedPosition,
  });
};

try {
  for (const dpr of dprs) {
    for (const edge of edges) {
      for (const mode of modes) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 1000 },
          deviceScaleFactor: dpr,
        });

        const page = await context.newPage();

        await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));

        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });

        await page.goto(url, { waitUntil: "networkidle" });
        const toolbar = page.locator("[data-mesurer-toolbar='true']").first();
        await toolbar.waitFor();

        const settings = page.getByRole("button", { name: /^Settings/ }).first();

        await settings.click();
        const settingsDialog = page.getByRole("dialog", { name: "Settings", exact: true });

        await settingsDialog.waitFor({ state: "visible" });
        await settingsDialog.getByRole("tab", { name: "General" }).click();
        const pluginsDisclosure = settingsDialog.locator("[data-mesurer-plugin-settings-disclosure='plugins']");

        if (await pluginsDisclosure.getAttribute("aria-expanded") !== "true") {
          await pluginsDisclosure.click();
        }

        const editPlugin = settingsDialog.getByRole("switch", { name: "Edit", exact: true });

        await editPlugin.waitFor({ state: "visible" });

        if (await editPlugin.getAttribute("aria-checked") !== "true") {
          await editPlugin.click();
        }

        await settings.click();
        await settingsDialog.waitFor({ state: "hidden" });
        const modeButton = toolbar.locator(`[data-mesurer-toolbar-mode="${mode}"]`);

        if (await modeButton.isVisible() && await modeButton.getAttribute("aria-pressed") !== "true") {
          await modeButton.click();
          await page.waitForTimeout(200);
        }

        const horizontal = await inventory(toolbar);

        const horizontalInventory = horizontal.map(({ role, label, group, menu, expanded, active }) =>
          ({ role, label, group, menu, expanded, active }));

        await page.screenshot({ path: `${output}/horizontal-${mode}-${edge}-dpr-${dpr}.png` });

        await dockAt(page, toolbar, edge, mode);
        const vertical = await inventory(toolbar);

        const verticalInventory = vertical.map(({ role, label, group, menu, expanded, active }) =>
          ({ role, label, group, menu, expanded, active }));

        await page.screenshot({ path: `${output}/vertical-${edge}-${mode}-dpr-${dpr}.png` });
        const rect = await toolbarBounds(toolbar);
        const center = rect.x + rect.width / 2;
        const iconCenters = await primaryIconCenters(toolbar);
        const menuPairs = await menuTriggerPairs(toolbar);
        const modePill = await modePillGeometry(toolbar, mode);
        evidence.push({
          dpr,
          edge,
          mode,
          horizontal: horizontalInventory,
          vertical: verticalInventory,
          toolbar: rect,
          iconCenters,
          menuPairs,
          modePill,
        });
        assert.deepEqual(verticalInventory, horizontalInventory, `${edge} ${mode} DPR ${dpr} inventory matches horizontal`);

        const offCenter = iconCenters
          .map((icon) => ({ ...icon, delta: Math.abs(icon.centerX - center) }))
          .filter((icon) => icon.delta > 0.5);

        assert.deepEqual(offCenter, [], `${edge} ${mode} DPR ${dpr} primary icons share a centerline`);
        assert(menuPairs.length > 0, "toolbar menu triggers are present");

        for (const pair of menuPairs) {
          assert(pair.ownerFound, `${pair.label} has a primary icon owner`);
          assert(Math.abs(pair.triggerCenterX - center) <= 0.5,
            `${pair.label} is centered in its own row: ${JSON.stringify(pair)}`);
          assert(Math.abs(pair.ownerCenterX - center) <= 0.5,
            `${pair.label} does not displace its icon: ${JSON.stringify(pair)}`);
          assert.equal(pair.triggerBounds.height, 16, `${pair.label} trigger is exactly 16px high`);
          assert(Math.abs(pair.triggerBounds.y - pair.ownerBounds.y - pair.ownerBounds.height) <= 0.5,
            `${pair.label} sits directly below its owner: ${JSON.stringify(pair)}`);
        }

        assert(modePill, `${edge} ${mode} mode pill and selected button are rendered`);
        assert(Math.abs(modePill.pillCenterX - modePill.buttonCenterX) <= 0.5,
          `${edge} ${mode} mode pill is centered on its selected button: ${JSON.stringify(modePill)}`);

        const geometry = await toolbar.evaluate((element) => {
          const toolbarRect = element.getBoundingClientRect();

          return [...element.querySelectorAll("[data-mesurer-toolbar-divider]")].flatMap((divider) => {
              const style = getComputedStyle(divider);

              if (!(style.opacity !== "0" && divider.getBoundingClientRect().width > 0)) return [];

              const rect = divider.getBoundingClientRect();

              return [{
                width: rect.width,
                height: rect.height,
                insetLeft: rect.left - toolbarRect.left,
                insetRight: toolbarRect.right - rect.right,
                computedWidth: getComputedStyle(divider).width,
                alignSelf: getComputedStyle(divider).alignSelf,
              }];
            });
        });

        assert(geometry.length > 0, "toolbar separators are present");

        for (const separator of geometry) {
          assert(separator.height <= 1.5, `${edge} separator is horizontal: ${JSON.stringify(separator)}`);
          assert(Math.abs(separator.insetLeft - separator.insetRight) <= 1,
            `${edge} separator has equal insets: ${JSON.stringify(separator)}`);
        }

        const referenceInset = geometry[0].insetLeft;
        assert(geometry.every((separator) => Math.abs(separator.insetLeft - referenceInset) <= 0.5),
          `${edge} separators share equal insets: ${JSON.stringify(geometry)}`);

        evidence.at(-1).separators = geometry;

        for (const horizontalEdge of ["top", "bottom"]) {
          await dockAt(page, toolbar, horizontalEdge, mode);
          const horizontalRect = await toolbarBounds(toolbar);
          evidence.push({ dpr, mode, edge: horizontalEdge, toolbar: horizontalRect, releasePauseMs: 500 });
        }

        await context.close();
      }
    }
  }

  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: true, evidence, errors }, null, 2));
  console.log(`Vertical toolbar parity contract: PASS (${output})`);
} catch (error) {
  await writeFile(`${output}/result.json`, JSON.stringify({
    passed: false,
    evidence,
    errors,
    error: String(error),
  }, null, 2));
  throw error;
} finally {
  await browser.close();
}
