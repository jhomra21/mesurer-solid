import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reactUrl = process.env.PARITY_REACT_URL;
const solidUrl = process.env.PARITY_SOLID_URL;
const outputDir = process.env.PARITY_OUT;
const deviceScaleFactor = Number.parseFloat(process.env.PARITY_DPR ?? "1");
if (!reactUrl || !solidUrl || !outputDir) {
  throw new Error("PARITY_REACT_URL, PARITY_SOLID_URL and PARITY_OUT are required");
}
await fs.mkdir(outputDir, { recursive: true });

const sleep = (page, ms = 140) => page.waitForTimeout(ms);

async function realClick(locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${await locator.evaluate((el) => el.outerHTML)}`);
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const button = (page, name) => page.getByRole("button", { name });
const tab = (page, name) => page.getByRole("tab", { name });
const sw = (page, name) => page.getByRole("switch", { name });
const radio = (page, name) => page.getByRole("radio", { name });

async function openSettings(page) {
  await realClick(button(page, /^Settings/));
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  await sleep(page, 80);
}

async function openSettingsTab(page, name) {
  await openSettings(page);
  await realClick(tab(page, name));
  // Compare the settled selected-tab surface rather than browser-specific
  // pointer/focus rasterization left behind by a real mouse click.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.mouse.move(900, 700);
  await sleep(page, 80);
}

async function openOrientation(page) {
  await realClick(button(page, "Guide orientation menu"));
  await page.getByRole("menu").waitFor();
  await sleep(page, 60);
}

async function openColorPicker(page) {
  await realClick(button(page, /^Color picker/));
  await page.locator(".mesurer-color-picker").waitFor();
  await sleep(page, 80);
}

// Interaction parity compares the upstream-shared controls. Solid-only,
// explicitly plugin-owned settings are exercised by browser-contracts instead.
async function normalizeSharedParitySurface(page, implementation) {
  if (implementation !== "solid") return;
  const extensions = page.locator('[role="dialog"][aria-label="Settings"] [data-mesurer-distance="true"], [role="dialog"][aria-label="Settings"] [data-mesurer-plugin-settings="true"]');
  if ((await extensions.count()) === 0) return;
  await extensions.evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  // Removing Solid-only extensions changes panel layout. Give the shared surface
  // the same >150ms settle window used for settings/control transitions before
  // taking a zero-tolerance pixel snapshot.
  await sleep(page, 240);
}

async function stateSnapshot(page) {
  const toolbar = page.locator(".mesurer-toolbar-surface").first();
  const toolbarButtons = await toolbar.locator("button[aria-label]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute("aria-label"),
      pressed: node.getAttribute("aria-pressed"),
    })),
  );
  const selectedTab = await page.locator('[role="tab"][aria-selected="true"]').allTextContents();
  const switches = await page.locator('[role="switch"]:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ text: node.textContent?.trim() ?? "", checked: node.getAttribute("aria-checked") })),
  );
  const radios = await page.locator('[role="radio"]:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.getAttribute("aria-label"), checked: node.getAttribute("aria-checked") })),
  );
  const settingsPressed = await page.locator('[role="dialog"][aria-label="Settings"] button[aria-pressed]:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ text: node.textContent?.trim() ?? "", pressed: node.getAttribute("aria-pressed") })),
  );
  const sliders = await page.locator('[role="slider"]:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.getAttribute("aria-label"), value: node.getAttribute("aria-valuenow") })),
  );
  const selects = await page.locator('[role="dialog"][aria-label="Settings"] select:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: /** @type {HTMLSelectElement} */ (node).value })),
  );
  const guideIconTransform = await button(page, /^Guides/).locator("svg").first().evaluate((node) => getComputedStyle(node).transform);
  return {
    toolbarButtons,
    settingsOpen: await page.getByRole("dialog", { name: "Settings" }).count() > 0,
    selectedTab,
    switches,
    radios,
    settingsPressed,
    sliders,
    selects,
    xrayActive: await page.locator("body").evaluate((body) => body.classList.contains("xray-mode") || body.classList.contains("mesurer-solid-xray")),
    rulersVisible: await page.locator('[data-mesurer-rulers="true"]').count() > 0,
    colorPickerVisible: await page.locator(".mesurer-color-picker").count() > 0,
    guideMenuVisible: await page.getByRole("menu").count() > 0,
    textInspectorCards: await page.locator(".mesurer-ti-card").count(),
    selectedMeasurements: await page.locator('[data-mesurer-selected-measurement="true"]').count(),
    guides: await page.locator('[data-mesurer-guide="true"]').count(),
    copiedTooltip: await page.getByRole("tooltip", { name: "Copied!" }).count() > 0,
    visibleTooltips: await page.locator('[role="tooltip"]:visible').allTextContents(),
    guideIconTransform,
  };
}

const cases = [
  { name: "toolbar-select-on", run: async (p) => realClick(button(p, /^Select/)) },
  { name: "toolbar-select-off", run: async (p) => { await realClick(button(p, /^Select/)); await sleep(p, 40); await realClick(button(p, /^Select/)); } },
  { name: "toolbar-xray-on", run: async (p) => realClick(button(p, /^X-ray/)) },
  { name: "toolbar-xray-off", run: async (p) => { await realClick(button(p, /^X-ray/)); await sleep(p, 40); await realClick(button(p, /^X-ray/)); } },
  { name: "toolbar-color-picker-open", run: openColorPicker },
  { name: "toolbar-color-picker-close", run: async (p) => { await openColorPicker(p); await realClick(button(p, /^Color picker/)); await sleep(p, 80); } },
  { name: "toolbar-rulers-on", run: async (p) => realClick(button(p, /^Rulers/)) },
  { name: "toolbar-rulers-off", run: async (p) => { await realClick(button(p, /^Rulers/)); await sleep(p, 40); await realClick(button(p, /^Rulers/)); await p.mouse.move(900, 700); } },
  { name: "toolbar-text-inspector-on", run: async (p) => realClick(button(p, /^Text inspector/)) },
  { name: "toolbar-text-inspector-off", run: async (p) => { await realClick(button(p, /^Text inspector/)); await sleep(p, 40); await realClick(button(p, /^Text inspector/)); } },
  { name: "toolbar-guides-on", run: async (p) => realClick(button(p, /^Guides/)) },
  { name: "toolbar-guides-off", run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 40); await realClick(button(p, /^Guides/)); } },
  { name: "toolbar-orientation-menu-open", run: openOrientation },
  { name: "toolbar-orientation-horizontal", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); } },
  { name: "toolbar-orientation-vertical", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); await sleep(p, 50); await openOrientation(p); await realClick(button(p, "Vertical")); } },
  { name: "toolbar-settings-open", allowVersionDiff: true, run: openSettings },
  { name: "toolbar-settings-close", run: async (p) => { await openSettings(p); await realClick(button(p, /^Settings/)); } },

  { name: "action-select-target", run: async (p) => { await realClick(button(p, /^Select/)); await sleep(p, 80); await p.mouse.click(340, 290); await sleep(p, 180); } },
  { name: "action-guide-create-vertical", run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 80); await p.mouse.click(620, 400); await sleep(p, 180); } },
  { name: "action-guide-create-horizontal", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); await sleep(p, 80); await p.mouse.click(620, 400); await sleep(p, 180); } },
  { name: "action-text-inspector-hover", run: async (p) => { await realClick(button(p, /^Text inspector/)); await sleep(p, 80); await p.mouse.move(340, 290); await sleep(p, 220); } },

  { name: "settings-tab-guides", run: async (p) => openSettingsTab(p, "Guides") },
  { name: "settings-tab-select", run: async (p) => openSettingsTab(p, "Select") },
  { name: "settings-tab-color", run: async (p) => openSettingsTab(p, "Color") },
  { name: "settings-tab-rulers", run: async (p) => openSettingsTab(p, "Rulers") },
  { name: "settings-tab-general", allowVersionDiff: true, run: async (p) => openSettingsTab(p, "General") },

  { name: "settings-guide-pattern-solid", run: async (p) => { await openSettingsTab(p, "Guides"); await realClick(radio(p, "Solid guide pattern")); } },
  { name: "settings-guide-pattern-dashed", run: async (p) => { await openSettingsTab(p, "Guides"); await realClick(radio(p, "Dashed guide pattern")); } },
  { name: "settings-guide-pattern-dotted", run: async (p) => { await openSettingsTab(p, "Guides"); await realClick(radio(p, "Dotted guide pattern")); } },
  { name: "settings-guides-snap-toggle", run: async (p) => { await openSettingsTab(p, "Guides"); await realClick(sw(p, "Snap")); } },
  { name: "settings-guides-highlight-toggle", run: async (p) => { await openSettingsTab(p, "Guides"); await realClick(sw(p, "Highlight")); } },

  { name: "settings-select-hover-toggle", run: async (p) => { await openSettingsTab(p, "Select"); await realClick(sw(p, "Hover")); } },
  { name: "settings-select-element-snap-toggle", run: async (p) => { await openSettingsTab(p, "Select"); await realClick(sw(p, "Element snap")); } },
  { name: "settings-select-stack-toggle", run: async (p) => { await openSettingsTab(p, "Select"); await realClick(sw(p, "Stack")); } },

  { name: "settings-color-hex-toggle", run: async (p) => { await openSettingsTab(p, "Color"); await realClick(button(p, "hex")); } },
  { name: "settings-color-rgb-toggle", run: async (p) => { await openSettingsTab(p, "Color"); await realClick(button(p, "rgb")); } },
  { name: "settings-color-hsl-toggle", run: async (p) => { await openSettingsTab(p, "Color"); await realClick(button(p, "hsl")); } },
  { name: "settings-color-oklch-toggle", run: async (p) => { await openSettingsTab(p, "Color"); await realClick(button(p, "oklch")); } },

  { name: "settings-rulers-edge-reveal-toggle", run: async (p) => { await openSettingsTab(p, "Rulers"); await realClick(sw(p, "Edge reveal")); } },
  { name: "settings-general-persist-toggle", allowVersionDiff: true, run: async (p) => { await openSettingsTab(p, "General"); await realClick(sw(p, "Persist")); } },
  { name: "settings-general-use-defaults", allowVersionDiff: true, run: async (p) => { await openSettingsTab(p, "Select"); await realClick(sw(p, "Hover")); await realClick(tab(p, "General")); await realClick(button(p, "Reset settings to defaults")); } },
  { name: "settings-general-clear-workspace", allowVersionDiff: true, run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 50); await p.mouse.click(620, 400); await sleep(p, 80); await openSettingsTab(p, "General"); await realClick(button(p, "Clear workspace")); await p.evaluate(() => { const active = document.activeElement; if (active instanceof HTMLElement) active.blur(); }); await p.mouse.move(900, 700); } },

  { name: "color-copy-first", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(0)); await sleep(p, 80); } },
  { name: "color-copy-second", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(1)); await sleep(p, 80); } },
  { name: "color-copy-third", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(2)); await sleep(p, 80); } },
];

const metadata = Object.fromEntries(cases.map((item) => [item.name, { allowVersionDiff: Boolean(item.allowVersionDiff) }]));
await fs.writeFile(path.join(outputDir, "cases.json"), JSON.stringify(metadata, null, 2));

const runtimeDiagnostics = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [implementation, url] of [["react", reactUrl], ["solid", solidUrl]]) {
    for (const item of cases) {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor,
        colorScheme: "light",
        locale: "en-US",
      });
      const page = await context.newPage();
      if (implementation === "solid") {
        page.on("console", (message) => {
          const text = message.text();
          if (
            message.type() === "error"
            || (message.type() === "warning" && text.includes("STRICT_READ_UNTRACKED"))
          ) {
            runtimeDiagnostics.push({ implementation, case: item.name, source: `console.${message.type()}`, text });
          }
        });
        page.on("pageerror", (error) => {
          runtimeDiagnostics.push({ implementation, case: item.name, source: "pageerror", text: error.message });
        });
      }
      await page.addInitScript(() => {
        Object.defineProperty(window, "EyeDropper", {
          configurable: true,
          writable: true,
          value: class {
            async open() { return { sRGBHex: "#3366ff" }; }
          },
        });
      });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.locator(".mesurer-toolbar-surface").waitFor();
      await sleep(page, 100);
      await item.run(page);
      // Let the upstream 150ms switch/control transitions settle before the
      // screenshot so the comparison measures the final pressed state rather
      // than framework scheduling within the animation.
      await sleep(page, 240);
      await normalizeSharedParitySurface(page, implementation);
      await page.screenshot({ path: path.join(outputDir, `${implementation}-${item.name}.png`), fullPage: false, scale: "device" });
      await fs.writeFile(path.join(outputDir, `${implementation}-${item.name}.json`), JSON.stringify(await stateSnapshot(page), null, 2));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(outputDir, "runtime-diagnostics.json"),
  JSON.stringify(runtimeDiagnostics, null, 2),
);

if (runtimeDiagnostics.length > 0) {
  const summary = runtimeDiagnostics
    .map((diagnostic) => `${diagnostic.case} [${diagnostic.source}]: ${diagnostic.text}`)
    .join("\n");
  throw new Error(`Solid parity emitted runtime diagnostics:\n${summary}`);
}
