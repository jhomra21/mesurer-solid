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

const panelContract = async (panel) => panel.evaluate((root, keys) => {
  const base = root.getBoundingClientRect();

  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();

    return {
      x: rect.x - base.x,
      y: rect.y - base.y,
      width: rect.width,
      height: rect.height,
    };
  };

  const styleOf = (element) => {
    const style = getComputedStyle(element);

    return Object.fromEntries(keys.map((key) => [key, style[key]]));
  };

  const semanticName = (element) =>
    element.getAttribute("aria-label")
    ?? element.getAttribute("name")
    ?? element.getAttribute("title")
    ?? element.textContent?.trim()
    ?? "";

  const svgContract = (svg) => ({
    rect: rectOf(svg),
    viewBox: svg.getAttribute("viewBox"),
    width: svg.getAttribute("width"),
    height: svg.getAttribute("height"),
    fill: svg.getAttribute("fill"),
    stroke: svg.getAttribute("stroke"),
    primitives: [...svg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse,g")].map((node) => {
      const attributes = {};

      for (const attribute of node.attributes) {
        if (!["class", "style"].includes(attribute.name)) attributes[attribute.name] = attribute.value;
      }

      return { tag: node.tagName.toLowerCase(), attributes };
    }),
  });

  const controls = [...root.querySelectorAll("button,input,select")].map((element, index) => {
    const input = element instanceof HTMLInputElement ? element : null;
    const select = element instanceof HTMLSelectElement ? element : null;
    const svg = element.querySelector("svg");

    return {
      index,
      tag: element.tagName.toLowerCase(),
      name: semanticName(element),
      type: input?.type ?? null,
      value: input ? input.value : select ? select.value : null,
      ariaPressed: element.getAttribute("aria-pressed"),
      rect: rectOf(element),
      style: styleOf(element),
      options: select
        ? [...select.options].map((option) => ({
            label: option.textContent?.trim() ?? "",
            value: option.value,
            selected: option.selected,
          }))
        : null,
      icon: svg ? svgContract(svg) : null,
    };
  });

  return {
    panel: {
      rect: { x: 0, y: 0, width: base.width, height: base.height },
      style: styleOf(root),
      text: root.textContent?.replace(/\s+/g, " ").trim() ?? "",
    },
    controls,
  };
}, styleKeys);

async function captureState(page, implementation, state) {
  const panel = page.getByRole("dialog", { name: "Layout guides" });
  await panel.waitFor({ state: "visible" });
  await page.mouse.move(900, 700);
  await page.waitForTimeout(100);
  await panel.screenshot({
    path: path.join(outputDir, `${implementation}-${state}.png`),
    animations: "disabled",
  });
  await fs.writeFile(
    path.join(outputDir, `${implementation}-${state}.json`),
    JSON.stringify(await panelContract(panel), null, 2),
  );
}

async function exercise(page, implementation) {
  await page.goto(implementation === "react" ? reactUrl : solidUrl, { waitUntil: "networkidle" });
  await page.locator(".mesurer-toolbar-surface").waitFor();

  await page.getByRole("button", { name: /^Layout guides/ }).first().click();
  await captureState(page, implementation, "initial");

  const panel = page.getByRole("dialog", { name: "Layout guides" });
  await panel.getByRole("button", { name: "Add layout guide" }).click();
  await captureState(page, implementation, "list");

  await panel.locator("li").first().locator("button").first().click();
  await captureState(page, implementation, "editor");

  await panel.getByRole("combobox", { name: "Alignment" }).selectOption("min");
  await captureState(page, implementation, "editor-aligned");

  await panel.getByRole("combobox", { name: "Layout guide type" }).selectOption("grid");
  await captureState(page, implementation, "grid");
}

const browser = await chromium.launch({ headless: true });

try {
  for (const implementation of ["react", "solid"]) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "en-US",
    });

    const page = await context.newPage();

    await exercise(page, implementation);
    await context.close();
  }
} finally {
  await browser.close();
}
