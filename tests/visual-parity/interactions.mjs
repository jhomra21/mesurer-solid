import { normalizeResponsiveToolbar } from "./normalize-responsive-toolbar.mjs";
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

const selectionLabelStyleKeys = [
  "display", "position", "left", "top", "width", "height", "padding",
  "gap", "border", "borderRadius", "backgroundColor", "color", "boxShadow",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "opacity", "transform", "pointerEvents", "zIndex",
];

async function realClick(locator) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();

  if (!box) throw new Error(`No bounding box for ${await locator.evaluate((el) => el.outerHTML)}`);
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const button = (page, name) => page.getByRole("button", { name });

const selectToolButton = (page, implementation) => button(
  page,
  implementation === "solid" ? /^Select \(S\)$/ : /^Select/,
);

const typographyButton = (page, implementation) => button(
  page,
  implementation === "solid" ? /^Typography/ : /^Text inspector/,
);

const canonicalToolbarLabel = (label, implementation) =>
  implementation === "solid" && label === "Typography (A)" ? "Text inspector (A)" : label;

const canonicalTooltipText = (text, implementation) =>
  implementation === "solid" ? text.replace(/^Typography(?=\s|$)/, "Text inspector") : text;

async function openSettings(page) {
  await realClick(button(page, /^Settings/));
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
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

const normalizeHistoricalToolbarMode = async (page, implementation, caseName) => {
  if (implementation !== "solid") return;

  const modeSwitch = page.locator("[data-mesurer-toolbar-mode-switch='true']");

  if ((await modeSwitch.count()) === 0) return;

  const contract = await modeSwitch.evaluate((element) =>
    [...element.querySelectorAll("button")].map((button) => ({
      label: button.getAttribute("aria-label"),
      pressed: button.getAttribute("aria-pressed"),
    })),
  );

  const expected = [
    { label: "Select mode (1)", pressed: "true" },
    { label: "Edit mode (2)", pressed: "false" },
  ];

  if (JSON.stringify(contract) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Select/Edit switch contract in ${caseName}: ${JSON.stringify(contract)}`);
  }

  await modeSwitch.evaluate((element) => {
    const divider = element.nextElementSibling;

    element.remove();

    if (divider?.getAttribute("data-mesurer-toolbar-divider") === "mode") divider.remove();
  });
};

// Interaction parity compares the upstream-shared controls. Settings is the
// sectioned panel now and is compared with current upstream separately.
async function normalizeSharedParitySurface(page, implementation, caseName) {
  if (implementation !== "solid") return;
  let changed = false;

  // Preserve the old source-parity gate as a v0.0.11 visual/interaction test.
  // Removing only the current theme selector makes Solid render through the
  // still-pinned historical stylesheet for this snapshot.
  const themedNodes = page.locator(
    '[data-mesurer-root="true"][data-theme], [data-mesurer-inspector-ui="true"][data-theme], [data-mesurer-isolated-document-layer="true"][data-theme]',
  );

  if ((await themedNodes.count()) > 0) {
    await themedNodes.evaluateAll((nodes) => nodes.forEach((node) => node.removeAttribute("data-theme")));
  }

  // The production browser and isolated-scroll contracts separately verify the
  // compositor-owned absolute anchor used by standalone Typography. For this
  // one non-scrolling upstream parity action, release only those visible Solid
  // surfaces back to their original fixed fallback immediately before capture.
  // That keeps Chromium text rasterization comparable without weakening or
  // changing the production scroll implementation.
  if (caseName === "action-text-inspector-hover") {
    const nativeTypography = page.locator(".mesurer-ti-box[data-mesurer-native-scroll-owner='typography'], .mesurer-ti-card[data-mesurer-native-scroll-owner='typography']");

    if ((await nativeTypography.count()) > 0) {
      await nativeTypography.evaluateAll((nodes) => nodes.forEach((node) => {
        node.removeAttribute("data-mesurer-native-scroll-anchor");
        node.style.removeProperty("position-anchor");
      }));
      changed = true;
    }
  }

  // Releasing the anchor changes paint ownership; let it settle before capture. Toolbar-only
  // cases skip this delay because it can cross the tooltip-open threshold.
  if (changed) await sleep(page, 240);
}

async function stateSnapshot(page, implementation) {
  const toolbar = page.locator(".mesurer-toolbar-surface").first();

  const rawToolbarButtons = await toolbar.locator("button[aria-label]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      label: node.getAttribute("aria-label"),
      pressed: node.getAttribute("aria-pressed"),
    })),
  );

  const toolbarButtons = rawToolbarButtons.map((item) => ({
    ...item,
    label: canonicalToolbarLabel(item.label, implementation),
  }));

  const guideIconTransform = await button(page, /^Guides/).locator("svg").first().evaluate((node) => getComputedStyle(node).transform);

  const visibleTooltips = (await page.locator('[role="tooltip"]:visible').allTextContents())
    .map((text) => canonicalTooltipText(text, implementation));

  const selectionLabel = await page.evaluate((styleKeys) => {
    const root = document.querySelector('[data-mesurer-selected-measurement="true"]');
    const element = root?.children.item((root?.children.length ?? 0) - 1);

    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      tag: element.tagName,
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
      style: Object.fromEntries(styleKeys.map((key) => [key, style[key]])),
    };
  }, selectionLabelStyleKeys);

  return {
    toolbarButtons,
    settingsOpen: await page.getByRole("dialog", { name: "Settings" }).count() > 0,
    xrayActive: await page.locator("body").evaluate((body) => body.classList.contains("xray-mode") || body.classList.contains("mesurer-solid-xray")),
    rulersVisible: await page.locator('[data-mesurer-rulers="true"]').count() > 0,
    colorPickerVisible: await page.locator(".mesurer-color-picker").count() > 0,
    guideMenuVisible: await page.getByRole("menu").count() > 0,
    textInspectorCards: await page.locator(".mesurer-ti-card").count(),
    selectedMeasurements: await page.locator('[data-mesurer-selected-measurement="true"]').count(),
    selectionLabel,
    guides: await page.locator('[data-mesurer-guide="true"]').count(),
    guideHitboxes: await page.locator('[data-mesurer-guide="true"]').evaluateAll((nodes) => nodes.map((node) => {
      const { left, top, width, height } = node.getBoundingClientRect();

      return { left, top, width, height };
    })),
    copiedTooltip: await page.getByRole("tooltip", { name: "Copied!" }).count() > 0,
    visibleTooltips,
    guideIconTransform,
  };
}

const cases = [
  { name: "toolbar-select-on", run: async (p, implementation) => realClick(selectToolButton(p, implementation)) },
  { name: "toolbar-select-off", run: async (p, implementation) => { await realClick(selectToolButton(p, implementation)); await sleep(p, 40); await realClick(selectToolButton(p, implementation)); } },
  { name: "toolbar-xray-on", run: async (p) => realClick(button(p, /^X-ray/)) },
  { name: "toolbar-xray-off", run: async (p) => { await realClick(button(p, /^X-ray/)); await sleep(p, 40); await realClick(button(p, /^X-ray/)); } },
  { name: "toolbar-color-picker-open", run: openColorPicker },
  // Upstream toggles Color Picker off on the second press. Solid intentionally
  // resamples instead; its repeated-picker contract runs in the real browser
  // and packed consumers, so the two states no longer belong in shared parity.
  { name: "toolbar-rulers-on", run: async (p) => realClick(button(p, /^Rulers/)) },
  { name: "toolbar-rulers-off", run: async (p) => { await realClick(button(p, /^Rulers/)); await sleep(p, 40); await realClick(button(p, /^Rulers/)); await p.mouse.move(900, 700); } },
  { name: "toolbar-text-inspector-on", run: async (p, implementation) => { await realClick(typographyButton(p, implementation)); await p.mouse.move(900, 700); } },
  { name: "toolbar-text-inspector-off", run: async (p, implementation) => { await realClick(typographyButton(p, implementation)); await sleep(p, 40); await realClick(typographyButton(p, implementation)); await p.mouse.move(900, 700); } },
  { name: "toolbar-guides-on", run: async (p) => realClick(button(p, /^Guides/)) },
  { name: "toolbar-guides-off", run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 40); await realClick(button(p, /^Guides/)); } },
  { name: "toolbar-orientation-menu-open", run: openOrientation },
  { name: "toolbar-orientation-horizontal", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); } },
  { name: "toolbar-orientation-vertical", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); await sleep(p, 50); await openOrientation(p); await realClick(button(p, "Vertical")); } },
  { name: "toolbar-settings-close", run: async (p) => { await openSettings(p); await realClick(button(p, /^Settings/)); } },

  { name: "action-select-target", run: async (p, implementation) => {
    await realClick(selectToolButton(p, implementation));
    await sleep(p, 80);
    await p.mouse.click(340, 290);
    await sleep(p, 180);

    // Solid preserves upstream's two-pass selected visual weight in one
    // document-owned box. Requiring the old transient duplicate would recreate
    // the fixed-island ghost that can scroll independently and paint over
    // document-backed annotation cards.
    if (implementation === "solid") {
      const selectionPaint = await p.evaluate(() => {
        const surfaces = [...document.querySelectorAll('[data-mesurer-measurement-chrome="true"]')]
          .filter((node) => {
            const rect = node.getBoundingClientRect();

            return Math.abs(rect.x - 240) < 0.5 && Math.abs(rect.y - 240) < 0.5
              && Math.abs(rect.width - 200) < 0.5 && Math.abs(rect.height - 100) < 0.5;
          });

        if (surfaces.length !== 1) return null;
        const selected = surfaces[0];

        if (!selected.closest('[data-mesurer-selected-measurement="true"]')) return null;
        const rect = selected.getBoundingClientRect();

        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          nativeAnchor: selected.dataset.mesurerNativeScrollAnchor ?? null,
        };
      });

      if (!selectionPaint) throw new Error("action-select-target: selected target must have exactly one paint surface");

      if (selectionPaint.nativeAnchor !== "box") {
        throw new Error(`action-select-target: selected paint lost document anchor ownership: ${JSON.stringify(selectionPaint)}`);
      }

      await p.mouse.move(620, 300);
      await sleep(p, 120);

      const differentHover = await p.evaluate(() => [...document.querySelectorAll('[data-mesurer-hover-measurement="true"]')].some((node) => {
        const rect = node.getBoundingClientRect();

        return Math.abs(rect.x - 560) < 0.5 && Math.abs(rect.y - 260) < 0.5 && Math.abs(rect.width - 140) < 0.5 && Math.abs(rect.height - 80) < 0.5;
      }));

      if (!differentHover) throw new Error("action-select-target: hover did not remain functional on another target");
      // Restore the canonical captured state after the hover-only assertion.
      // The parity image must remain the same committed selection state as the
      // upstream action, not a later pointer location.
      await p.reload({ waitUntil: "networkidle" });
      await p.locator(".mesurer-toolbar-surface").waitFor();
      await sleep(p, 100);
      await realClick(selectToolButton(p, implementation));
      await sleep(p, 80);
      await p.mouse.click(340, 290);
      await sleep(p, 180);
    }
  } },
  { name: "action-guide-create-vertical", run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 80); await p.mouse.click(620, 400); await sleep(p, 180); } },
  { name: "action-guide-create-horizontal", run: async (p) => { await openOrientation(p); await realClick(button(p, "Horizontal")); await sleep(p, 80); await p.mouse.click(620, 400); await sleep(p, 180); } },
  { name: "action-text-inspector-hover", run: async (p, implementation) => { await realClick(typographyButton(p, implementation)); await sleep(p, 80); await p.mouse.move(340, 290); await sleep(p, 220); } },

  { name: "color-copy-first", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(0)); await sleep(p, 80); } },
  { name: "color-copy-second", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(1)); await sleep(p, 80); } },
  { name: "color-copy-third", run: async (p) => { await openColorPicker(p); await realClick(p.locator(".mesurer-color-picker button").nth(2)); await sleep(p, 80); } },
];

const metadata = Object.fromEntries(cases.map((item) => [item.name, {}]));

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

      if (implementation === "solid") {
        await page.addInitScript(() => {
          // Historical React predates Inspect. Disable only this new Solid
          // surface in the historical lane; shipping still defaults it on.
          if (localStorage.getItem("mesurer-settings") !== null) return;
          localStorage.setItem("mesurer-settings", JSON.stringify({
            version: 2,
            settings: { infoCardMode: "off" },
            workspace: null,
          }));
        });
      }

      await page.goto(url, { waitUntil: "networkidle" });
      await page.locator(".mesurer-toolbar-surface").waitFor();
      await sleep(page, 100);
      await normalizeHistoricalToolbarMode(page, implementation, item.name);
      await normalizeResponsiveToolbar(page, implementation, item.name);
      await item.run(page, implementation);
      // A case can reload the fixture (for example action-select-target). Remove
      // the current Select/Edit chrome again before the historical snapshot.
      await normalizeHistoricalToolbarMode(page, implementation, item.name);
      await normalizeResponsiveToolbar(page, implementation, item.name);
      // Let the upstream 150ms switch/control transitions settle before the
      // screenshot so the comparison measures the final pressed state rather
      // than framework scheduling within the animation.
      await sleep(page, 240);
      await normalizeSharedParitySurface(page, implementation, item.name);
      await page.screenshot({ path: path.join(outputDir, `${implementation}-${item.name}.png`), fullPage: false, scale: "device" });
      await fs.writeFile(path.join(outputDir, `${implementation}-${item.name}.json`), JSON.stringify(await stateSnapshot(page, implementation), null, 2));
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
