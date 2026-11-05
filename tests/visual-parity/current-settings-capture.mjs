import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reactUrl = process.env.CURRENT_PARITY_REACT_URL;

const solidUrl = process.env.CURRENT_PARITY_SOLID_URL;

const outputDir = process.env.CURRENT_PARITY_OUT;

if (!reactUrl || !solidUrl || !outputDir) {
  throw new Error("CURRENT_PARITY_REACT_URL, CURRENT_PARITY_SOLID_URL and CURRENT_PARITY_OUT are required");
}

await fs.mkdir(outputDir, { recursive: true });

const styleKeys = [
  "display", "position", "width", "height", "minWidth", "minHeight",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "gap", "rowGap", "columnGap", "border", "borderRadius",
  "backgroundColor", "color", "boxShadow", "fontFamily", "fontSize",
  "fontWeight", "lineHeight", "letterSpacing", "opacity", "transform",
  "justifyContent", "alignItems", "overflow", "overflowX", "overflowY",
];

/**
 * The only rows removed from the comparison, on either side. Everything else must match in
 * pixels, layout, style and icon.
 *
 * Mesurer Solid-only rows carry data-mesurer-current-only-extension in the Solid DOM.
 * Upstream-only entries have no Mesurer Solid capability or intentionally differ in meaning.
 */
const EXCLUSIONS = {
  // Upstream sections for Arrows and Screenshot (Solid's Screenshot is a plugin with its own plugin settings).
  upstreamSections: ["arrows", "screenshot"],
  // Rows (by visible label) removed from both sides: upstream-only, or same slot with different Solid semantics.
  rowLabels: [
    "Select", // upstream: select new guide; Solid labels that persisted key "Highlight"
    "Spacing", // upstream: layout spacing; Solid: Layout details (Solid-only extension)
    "Info card", // upstream: Click/Hover; Solid adds Off (Solid-only extension)
    "Capture", "Toolbar", "Review", "Version", "Website", // upstream-only or build-specific rows
  ],
};

// Upstream's default is the opposite of Mesurer Solid's for these two settings; compare both in Solid's defaults.
const NORMALIZED_DEFAULTS = { dock: "free", persist: false };

const dialog = (page) => page.locator("[role='dialog'][aria-label='Settings']").first();

async function normalizeAndExclude(panel) {
  await panel.evaluate((root, input) => {
    const hide = (element) => { element.setAttribute("data-parity-excluded", "true"); element.style.display = "none"; };

    for (const section of root.querySelectorAll("[data-mesurer-settings-section]")) {
      if (input.upstreamSections.includes(section.getAttribute("data-mesurer-settings-section"))) {
        hide(section);
        const divider = section.previousElementSibling;

        if (divider && !divider.hasAttribute("data-mesurer-settings-section")) hide(divider);
      }
    }

    for (const element of root.querySelectorAll("[data-mesurer-current-only-extension]")) hide(element);

    for (const section of root.querySelectorAll("[data-mesurer-settings-section]")) {
      for (const row of section.children) {
        const label = row.querySelector("span")?.textContent?.trim();

        if (label && input.rowLabels.includes(label)) hide(row);
      }
    }
  }, EXCLUSIONS);
}

const panelContract = async (panel) => panel.evaluate((root, keys) => {
  const scroller = root.querySelector(".mesurer-settings-panel");
  const base = scroller.getBoundingClientRect();
  const visible = (element) => !element.closest("[data-parity-excluded]");

  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();

    return { x: rect.x - base.x, y: rect.y - base.y, width: rect.width, height: rect.height };
  };

  const styleOf = (element) => {
    const style = getComputedStyle(element);

    return Object.fromEntries(keys.map((key) => [key, style[key]]));
  };

  const svgContract = (svg) => ({
    viewBox: svg.getAttribute("viewBox"),
    width: svg.getAttribute("width"),
    height: svg.getAttribute("height"),
    primitives: Array.from(svg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse,g"), (node) => ({
      tag: node.tagName.toLowerCase(),
      d: node.getAttribute("d"),
    })),
  });

  const sections = Array.from(root.querySelectorAll("[data-mesurer-settings-section]")).flatMap((section) => {
    if (!visible(section)) return [];

    const heading = section.querySelector("h2");

    const controls = Array.from(section.querySelectorAll("button,input,select")).flatMap((element) => {
      if (!visible(element)) return [];


      const input = element instanceof HTMLInputElement ? element : null;
      const select = element instanceof HTMLSelectElement ? element : null;
      const svg = element.querySelector("svg");

      return {
        tag: element.tagName.toLowerCase(),
        name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
        type: input?.type ?? null,
        role: element.getAttribute("role"),
        value: input ? input.value : select ? select.value : null,
        checked: element.getAttribute("aria-checked"),
        rect: rectOf(element),
        style: styleOf(element),
        options: select ? [...select.options].map((option) => ({ label: option.textContent?.trim() ?? "", value: option.value })) : null,
        icon: svg ? svgContract(svg) : null,
      };
    });

    return {
      id: section.getAttribute("data-mesurer-settings-section"),
      heading: heading?.textContent?.trim() ?? "",
      headingRect: heading ? rectOf(heading) : null,
      headingStyle: heading ? styleOf(heading) : null,
      rect: rectOf(section),
      controls,
    };
  });

  return { panel: { width: base.width, style: styleOf(scroller) }, sections };
}, styleKeys);

async function captureState(page, implementation, state, theme) {
  const panel = dialog(page);
  await panel.waitFor({ state: "visible" });

  const dock = panel.getByRole("combobox", { name: "Toolbar dock" });
  await dock.selectOption(NORMALIZED_DEFAULTS.dock);
  const persist = panel.getByRole("switch", { name: "Persist", exact: true });

  const persisted = (await persist.getAttribute("aria-checked")) === "true";

  if (persisted !== NORMALIZED_DEFAULTS.persist) await persist.click();

  // Both place the panel in a height-capped scroller; lift the caps so the whole panel is compared.
  await panel.evaluate((root) => {
    const scroller = root.querySelector(".mesurer-settings-panel");

    for (const element of [root, scroller]) {
      element.style.height = "auto";
      element.style.maxHeight = "none";
    }

    scroller.scrollTop = 0;
  });
  // Upstream pads the scroller so a focused section can reach the top; compare the panel unpadded.
  await page.addStyleTag({ content: ".mesurer-settings-panel { padding-bottom: 0 !important; }" });
  await normalizeAndExclude(panel);
  await page.mouse.move(900, 1300);
  await page.waitForTimeout(150);
  await panel.screenshot({ path: path.join(outputDir, `${implementation}-${state}.png`), animations: "disabled" });
  await fs.writeFile(
    path.join(outputDir, `${implementation}-${state}.json`),
    JSON.stringify({ theme, ...(await panelContract(panel)) }, null, 2),
  );
}

async function exercise(page, implementation, theme) {
  await page.goto(implementation === "react" ? reactUrl : solidUrl, { waitUntil: "networkidle" });
  await page.locator(".mesurer-toolbar-surface").waitFor();
  await page.getByRole("button", { name: /^Settings/ }).first().click();
  await captureState(page, implementation, theme, theme);
}

const browser = await chromium.launch({ headless: true });

try {
  // Appearance stays on its default (System); the OS color scheme selects Light or Dark on both.
  for (const theme of ["light", "dark"]) {
    for (const implementation of ["react", "solid"]) {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 1400 },
        deviceScaleFactor: 1,
        colorScheme: theme,
        locale: "en-US",
      });

      await exercise(await context.newPage(), implementation, theme);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
