import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reactUrl = process.env.PARITY_REACT_URL;
const solidUrl = process.env.PARITY_SOLID_URL;
const outputDir = process.env.PARITY_OUT;
const deviceScaleFactor = Number.parseFloat(process.env.PARITY_DPR ?? "1");
const requestedStates = new Set(
  (process.env.PARITY_STATES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
if (!reactUrl || !solidUrl || !outputDir) {
  throw new Error("PARITY_REACT_URL, PARITY_SOLID_URL and PARITY_OUT are required");
}
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
  throw new Error(`PARITY_DPR must be a positive number, received: ${process.env.PARITY_DPR}`);
}

await fs.mkdir(outputDir, { recursive: true });

const styleKeys = [
  "display", "position", "left", "top", "width", "height", "padding",
  "gap", "border", "borderRadius", "backgroundColor", "color", "boxShadow",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "opacity", "transform", "pointerEvents", "zIndex",
];

const controlStyleKeys = [
  "display", "width", "height", "minWidth", "minHeight", "padding",
  "gap", "border", "borderRadius", "backgroundColor", "color", "boxShadow",
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "opacity", "transform", "justifyContent", "alignItems",
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

async function snapshotUiContract(page) {
  return page.evaluate(({ controlStyleKeys }) => {
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of roots[index].querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    const queryDeep = (selector) => {
      for (const root of roots) {
        const match = root.querySelector(selector);
        if (match) return match;
      }
      return null;
    };

    const rectOf = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    };

    const styleOf = (element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(controlStyleKeys.map((key) => [key, style[key]]));
    };

    const svgContract = (svg) => ({
      rect: rectOf(svg),
      viewBox: svg.getAttribute("viewBox"),
      width: svg.getAttribute("width"),
      height: svg.getAttribute("height"),
      fill: svg.getAttribute("fill"),
      stroke: svg.getAttribute("stroke"),
      strokeWidth: svg.getAttribute("stroke-width"),
      primitives: [...svg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")].map((node) => ({
        tag: node.tagName.toLowerCase(),
        attributes: Object.fromEntries(
          [...node.attributes]
            .filter((attribute) => !["class", "style"].includes(attribute.name))
            .map((attribute) => [attribute.name, attribute.value])
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      })),
    });

    const semanticName = (element) =>
      element.getAttribute("aria-label")
      ?? element.getAttribute("name")
      ?? element.getAttribute("title")
      ?? element.getAttribute("placeholder")
      ?? element.textContent?.trim()
      ?? "";

    const inferredRole = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      if (element instanceof HTMLButtonElement) return "button";
      if (element instanceof HTMLSelectElement) return "select";
      if (element instanceof HTMLTextAreaElement) return "textbox";
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") return "checkbox";
        if (element.type === "radio") return "radio";
        if (element.type === "range") return "slider";
        if (element.type === "color") return "color";
        return "textbox";
      }
      return element.tagName.toLowerCase();
    };

    const controlContract = (element, index) => {
      const input = element instanceof HTMLInputElement ? element : null;
      const select = element instanceof HTMLSelectElement ? element : null;
      const svg = element.querySelector("svg");
      return {
        index,
        tag: element.tagName.toLowerCase(),
        role: inferredRole(element),
        name: semanticName(element),
        type: input?.type ?? null,
        disabled: "disabled" in element ? Boolean(element.disabled) : null,
        checked: input && ["checkbox", "radio"].includes(input.type) ? input.checked : null,
        value: input ? input.value : select ? select.value : element.getAttribute("aria-valuenow"),
        ariaChecked: element.getAttribute("aria-checked"),
        ariaSelected: element.getAttribute("aria-selected"),
        ariaPressed: element.getAttribute("aria-pressed"),
        ariaValueMin: element.getAttribute("aria-valuemin"),
        ariaValueMax: element.getAttribute("aria-valuemax"),
        ariaValueNow: element.getAttribute("aria-valuenow"),
        options: select
          ? [...select.options].map((option) => ({
              label: option.textContent?.trim() ?? "",
              value: option.value,
              selected: option.selected,
              disabled: option.disabled,
            }))
          : null,
        rect: rectOf(element),
        style: styleOf(element),
        icon: svg ? svgContract(svg) : null,
      };
    };

    const toolbar = queryDeep(".mesurer-toolbar-surface");
    const dialog = queryDeep('[role="dialog"][aria-label="Settings"]');

    const toolbarIcons = toolbar
      ? [...toolbar.querySelectorAll("button")].map((button, index) => {
          const svg = button.querySelector("svg");
          return {
            index,
            name: semanticName(button),
            rect: rectOf(button),
            icon: svg ? svgContract(svg) : null,
          };
        })
      : [];

    const settings = dialog
      ? {
          rect: rectOf(dialog),
          tabs: [...dialog.querySelectorAll('[role="tab"]')].map((tab, index) => ({
            index,
            name: semanticName(tab),
            selected: tab.getAttribute("aria-selected"),
            rect: rectOf(tab),
            style: styleOf(tab),
          })),
          controls: [...dialog.querySelectorAll('button,input,select,textarea,[role="slider"],[role="switch"]')]
            .filter((element, index, elements) => elements.indexOf(element) === index)
            .map(controlContract),
        }
      : null;

    return { toolbarIcons, settings };
  }, { controlStyleKeys });
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

  const uiContract = await snapshotUiContract(page);

  return {
    deviceScaleFactor,
    xrayActive: await page.locator("body").evaluate((body) =>
      body.classList.contains("xray-mode") || body.classList.contains("mesurer-solid-xray"),
    ),
    toolbarButtons,
    toolbarIconContract: uiContract.toolbarIcons,
    settingsContract: uiContract.settings,
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
  await dispatchMouse(page.getByRole("button", { name: /^Settings/ }), "click", true);
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
};

// The React repository is the contract for the shared Mesurer UI. Solid can
// add plugin-owned controls beyond that surface. Remove only those explicitly
// marked extension controls before parity capture; browser-contracts exercises
// the extension itself in a real browser.
const normalizeSharedParitySurface = async (page, implementation) => {
  if (implementation !== "solid") return;
  const extensions = page.locator('[role="dialog"][aria-label="Settings"] [data-mesurer-distance="true"], [role="dialog"][aria-label="Settings"] [data-mesurer-plugin-settings="true"]');
  if ((await extensions.count()) === 0) return;
  await extensions.evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  // Removing Solid-only extensions changes panel layout. Give the shared surface
  // the same settle window used by interaction parity before a zero-tolerance capture.
  await page.waitForTimeout(240);
};

const states = [
  { name: "toolbar", run: async () => {} },
  {
    name: "tooltip",
    run: async (page) => {
      const select = page.getByRole("button", { name: /^Select/ });
      const box = await select.boundingBox();
      if (!box) throw new Error("Select button has no bounding box");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
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

const selectedStates = requestedStates.size
  ? states.filter((state) => requestedStates.has(state.name))
  : states;

if (requestedStates.size && selectedStates.length !== requestedStates.size) {
  const known = new Set(states.map((state) => state.name));
  const unknown = [...requestedStates].filter((state) => !known.has(state));
  throw new Error(`Unknown PARITY_STATES: ${unknown.join(", ")}`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [implementation, url] of [["react", reactUrl], ["solid", solidUrl]]) {
    for (const state of selectedStates) {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor,
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
      await page.goto(url, { waitUntil: "networkidle" });
      await page.locator(".mesurer-toolbar-surface").waitFor();
      await page.waitForTimeout(120);
      await state.run(page);
      await page.waitForTimeout(120);
      await normalizeSharedParitySurface(page, implementation);

      await page.screenshot({
        path: path.join(outputDir, `${implementation}-${state.name}.png`),
        fullPage: false,
        scale: "device",
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
