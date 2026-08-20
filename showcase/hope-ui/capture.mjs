import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const storybookUrl = process.env.HOPE_UI_STORYBOOK_URL ?? "http://127.0.0.1:6006";
const overlayPath = process.env.MESURER_OVERLAY;
const outputDir = process.env.SHOWCASE_OUT;
const dpr = Number.parseFloat(process.env.SHOWCASE_DPR ?? "3");

if (!overlayPath || !outputDir) {
  throw new Error("MESURER_OVERLAY and SHOWCASE_OUT are required");
}

await fs.mkdir(outputDir, { recursive: true });

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadStoryIndex() {
  for (const endpoint of ["index.json", "stories.json"]) {
    const response = await fetch(`${storybookUrl}/${endpoint}`);
    if (!response.ok) continue;
    const json = await response.json();
    return json.entries ?? json.stories ?? {};
  }
  throw new Error("Could not load the Hope UI Storybook story index");
}

const entries = await loadStoryIndex();
const stories = Object.entries(entries)
  .map(([id, entry]) => ({ id, ...entry }))
  .filter((entry) => entry.type === "story");

function story(title, preferredNames) {
  const titleMatches = stories.filter((entry) => entry.title === title);
  for (const preferredName of preferredNames) {
    const wanted = normalize(preferredName);
    const match = titleMatches.find((entry) => normalize(entry.name ?? "") === wanted);
    if (match) return match;
  }
  if (titleMatches[0]) return titleMatches[0];
  throw new Error(
    `Could not find ${title}. Available component stories: ${stories
      .filter((entry) => entry.title?.startsWith("Components/"))
      .slice(0, 30)
      .map((entry) => `${entry.title} / ${entry.name}`)
      .join(", ")}`,
  );
}

const buttonMatrix = story("Components/Button", ["Variant Color Matrix", "Variants"]);
const buttonLightDark = story("Components/Button", ["Light And Dark", "Adaptive", "Variants"]);

async function realClick(locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error("Visible element had no bounding box");
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const tool = (page, name) => page.getByRole("button", { name });

async function moveTo(locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error("Visible element had no bounding box");
  await locator.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickHost(locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error("Hope UI target had no bounding box");
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function openStory(page, selectedStory) {
  const url = `${storybookUrl}/iframe.html?id=${encodeURIComponent(selectedStory.id)}&viewMode=story`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("#storybook-root").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  await page.addScriptTag({ path: overlayPath, type: "module" });
  await page.locator(".mesurer-toolbar-surface").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
}

const cases = [
  {
    name: "01-select-button-matrix",
    selectedStory: buttonMatrix,
    run: async (page) => {
      await realClick(tool(page, /^Select/));
      const buttons = page.locator("#storybook-root button");
      const count = await buttons.count();
      await clickHost(buttons.nth(Math.min(14, Math.max(0, count - 1))));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "02-distance-between-buttons",
    selectedStory: buttonMatrix,
    run: async (page) => {
      await realClick(tool(page, /^Select/));
      const buttons = page.locator("#storybook-root button");
      const count = await buttons.count();
      const first = buttons.nth(Math.min(8, Math.max(0, count - 1)));
      const second = buttons.nth(Math.min(20, Math.max(0, count - 1)));
      await clickHost(first);
      await page.waitForTimeout(180);
      await page.keyboard.down("Alt");
      await moveTo(second);
      await page.waitForTimeout(350);
    },
  },
  {
    name: "03-guides-and-rulers",
    selectedStory: buttonMatrix,
    run: async (page) => {
      await realClick(tool(page, /^Rulers/));
      await realClick(tool(page, /^Guides/));
      await page.waitForTimeout(120);
      await page.mouse.click(760, 420);
      await page.waitForTimeout(180);
      await realClick(tool(page, "Guide orientation menu"));
      await realClick(tool(page, "Horizontal"));
      await page.waitForTimeout(100);
      await page.mouse.click(860, 610);
      await page.waitForTimeout(260);
    },
  },
  {
    name: "04-text-inspector",
    selectedStory: buttonLightDark,
    run: async (page) => {
      await realClick(tool(page, /^Text inspector/));
      const saved = page.locator("#storybook-root button").filter({ hasText: "Saved" }).first();
      const fallback = page.locator("#storybook-root button").first();
      await moveTo((await saved.count()) > 0 ? saved : fallback);
      await page.waitForTimeout(420);
    },
  },
  {
    name: "05-xray-component-tree",
    selectedStory: buttonMatrix,
    run: async (page) => {
      await realClick(tool(page, /^X-ray/));
      await page.mouse.move(1100, 820);
      await page.waitForTimeout(260);
    },
  },
  {
    name: "06-color-picker",
    selectedStory: buttonLightDark,
    run: async (page) => {
      await realClick(tool(page, /^Color picker/));
      await page.locator(".mesurer-color-picker").waitFor({ state: "visible" });
      await page.waitForTimeout(260);
    },
  },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: dpr,
      colorScheme: "light",
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, "EyeDropper", {
        configurable: true,
        writable: true,
        value: class {
          async open() {
            return { sRGBHex: "#3366ff" };
          }
        },
      });
    });

    await openStory(page, item.selectedStory);
    await item.run(page);
    await page.waitForTimeout(260);
    await page.screenshot({
      path: path.join(outputDir, `${item.name}.png`),
      fullPage: false,
      scale: "device",
    });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Captured ${cases.length} native ${dpr}x Hope UI + Mesurer screenshots in ${outputDir}`);
