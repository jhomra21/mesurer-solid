import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reactUrl = process.env.PARITY_REACT_URL;
const solidUrl = process.env.PARITY_SOLID_URL;
const outputDir = process.env.PARITY_OUT;
if (!reactUrl || !solidUrl || !outputDir) {
  throw new Error("PARITY_REACT_URL, PARITY_SOLID_URL and PARITY_OUT are required");
}

await fs.mkdir(outputDir, { recursive: true });

const styleKeys = [
  "display", "position", "left", "top", "width", "height", "padding",
  "gap", "border", "borderRadius", "backgroundColor", "color", "boxShadow",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "opacity", "transform",
  "pointerEvents", "zIndex",
];

async function dispatchMouse(locator, type, bubbles = true) {
  await locator.evaluate((element, input) => {
    element.dispatchEvent(new MouseEvent(input.type, { bubbles: input.bubbles }));
  }, { type, bubbles });
}

async function elementSnapshot(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return null;
  return locator.evaluate((element, keys) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      className: element.getAttribute("class") ?? "",
      text: element.textContent?.trim() ?? "",
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      style: Object.fromEntries(keys.map((key) => [key, style[key]])),
    };
  }, styleKeys);
}

async function snapshotMetrics(page) {
  const toolbar = page.locator(".mesurer-toolbar-surface").first();
  const toolbarButtons = (await toolbar.count())
    ? await toolbar.locator("button").evaluateAll((buttons) =>
        buttons.map((button) => ({
          ariaLabel: button.getAttribute("aria-label"),
          ariaPressed: button.getAttribute("aria-pressed"),
          text: button.textContent?.trim() ?? "",
          rect: (() => {
            const r = button.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })(),
        })),
      )
    : [];

  return {
    bodyClass: await page.locator("body").getAttribute("class"),
    toolbarButtons,
    toolbar: await elementSnapshot(page, ".mesurer-toolbar-surface"),
    settings: await elementSnapshot(page, '[role="dialog"][aria-label="Settings"]'),
    guideMenu: await elementSnapshot(page, '[role="menu"]'),
    colorPicker: await elementSnapshot(page, ".mesurer-color-picker"),
    rulers: await elementSnapshot(page, '[data-mesurer-rulers="true"]'),
    measureTag: await elementSnapshot(page, ".msr\\:bg-ink-900\\/90"),
    textInspector: await elementSnapshot(page, ".mesurer-ti-card"),
    selectedMeasurement: await elementSnapshot(page, '[data-mesurer-selected-measurement="true"]'),
    guide: await elementSnapshot(page, '[data-mesurer-guide="true"]'),
  };
}

const openSettings = async (page) => {
  await page.keyboard.press("Control+,");
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
};

const states = [
  { name: "toolbar", run: async () => {} },
  {
    name: "tooltip",
    run: async (page) => {
      const select = page.getByRole("button", { name: /^Select/ });
      await dispatchMouse(select, "mouseover", true);
      await dispatchMouse(select, "mouseenter", false);
      await page.waitForTimeout(900);
    },
  },
  {
    name: "orientation-menu",
    run: async (page) => {
      await dispatchMouse(page.getByRole("button", { name: "Guide orientation menu" }), "click", true);
      await page.getByRole("menu").waitFor();
    },
  },
  { name: "settings-general", run: openSettings },
  {
    name: "settings-guides",
    run: async (page) => {
      await page.keyboard.press("g");
      await page.waitForTimeout(80);
      await openSettings(page);
    },
  },
  {
    name: "settings-select",
    run: async (page) => {
      await page.keyboard.press("s");
      await page.waitForTimeout(80);
      await openSettings(page);
    },
  },
  {
    name: "settings-rulers",
    run: async (page) => {
      await page.keyboard.press("r");
      await page.waitForTimeout(80);
      await openSettings(page);
    },
  },
  {
    name: "settings-color",
    run: async (page) => {
      await openSettings(page);
      await dispatchMouse(page.getByRole("tab", { name: "Color" }), "click", true);
      await page.waitForTimeout(80);
    },
  },
  {
    name: "color-picker",
    run: async (page) => {
      await page.keyboard.press("p");
      await page.locator(".mesurer-color-picker").waitFor();
    },
  },
  {
    name: "rulers",
    run: async (page) => {
      await page.keyboard.press("r");
      await page.locator('[data-mesurer-rulers="true"]').waitFor();
    },
  },
  {
    name: "selection",
    run: async (page) => {
      await page.keyboard.press("s");
      await page.waitForTimeout(80);
      await page.mouse.click(340, 290);
      await page.waitForTimeout(180);
    },
  },
  {
    name: "guide",
    run: async (page) => {
      await page.keyboard.press("g");
      await page.waitForTimeout(80);
      await page.mouse.click(620, 400);
      await page.waitForTimeout(180);
    },
  },
  {
    name: "text-inspector",
    run: async (page) => {
      await page.keyboard.press("a");
      await page.waitForTimeout(80);
      await page.mouse.move(340, 290);
      await page.waitForTimeout(220);
    },
  },
  {
    name: "xray",
    run: async (page) => {
      await page.keyboard.press("x");
      await page.waitForTimeout(120);
    },
  },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const [implementation, url] of [["react", reactUrl], ["solid", solidUrl]]) {
    for (const state of states) {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        locale: "en-US",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.locator(".mesurer-toolbar-surface").waitFor();
      await page.waitForTimeout(120);
      await state.run(page);
      await page.waitForTimeout(120);

      await page.screenshot({
        path: path.join(outputDir, `${implementation}-${state.name}.png`),
        fullPage: false,
      });
      const metrics = await snapshotMetrics(page);
      await fs.writeFile(
        path.join(outputDir, `${implementation}-${state.name}.json`),
        JSON.stringify(metrics, null, 2),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
}
