import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_SELECTION_CARD_URL
  ?? "http://127.0.0.1:4190/responsive-preview.html?responsiveSelectionCard=1";

const dpr = Number(process.env.RESPONSIVE_SELECTION_CARD_DPR ?? 1);

const focus = process.env.RESPONSIVE_SELECTION_CARD_FOCUS;

const output = join(
  process.env.RESPONSIVE_SELECTION_CARD_OUT ?? "responsive-selection-card-artifacts",
  `dpr-${dpr}`,
);

const failureModes = {
  outline: [
    "fractional projection leaves an edge between device-pixel boundaries",
    "a hover or duplicate selected measurement paints over selected chrome",
    "scale-one geometry differs from fractional Fit geometry",
    "stationary-pointer target resize leaves selected edges at their old geometry",
  ],
  card: [
    "narrow fallback chooses a fitting vertical side before clamping below",
    "below placement ignores visible-stage clipping near the bottom",
    "resize or scrolling leaves stale placement",
    "card escapes the protected root overlay or loses interaction",
  ],
  shift: [
    "a card covering a preview target intercepts held-Shift input",
    "preview Shift-click toggles selection while Shift-drag adds a marquee",
    "plain click does not replace the selection",
    "Shift release fails to restore copy and CSS-detail interaction after row rerender",
  ],
  "held-shift": [
    "a card mounted during an already-held Shift does not pass through covered clicks",
    "a card remounted after Shift-marquee completion does not pass through covered clicks",
  ],
  "outline-neighbor": [
    "hovering a neighboring target does not add hover chrome over the selected outline",
  ],
};

await mkdir(output, { recursive: true });

let browser;

try {
  browser = await chromium.launch({ headless: true, timeout: 30_000 });
} catch (error) {
  await writeFile(join(output, "responsive-selection-card-launch-failure.json"), `${JSON.stringify({
    url,
    failureModes,
    error: String(error),
    stack: error?.stack,
  }, null, 2)}\n`);
  throw error;
}

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: dpr });

const errors = [];

const artifact = {
  url, failureModes,
  paintedPixelRule: {
    threshold: 0.49,
    definition: "Count each contiguous device pixel with at least midpoint outline coverage, allowing 1 percentage point for 8-bit RGB quantization. Require every scanline of every edge to equal max(1, round(DPR)).",
    background: "Same-coordinate device-scale screenshot with only selected edges hidden; selection fill and host background remain unchanged.",
    mapping: "Exact devicePixelRatio, not rounded PNG width / CSS viewport width.",
    sampleFractions: [0.15, 0.325, 0.5, 0.675, 0.85],
  },
  runs: [], errors,
};

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("frame-ancestors 'none'")) errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

const frame = page.locator("iframe[data-mesurer-responsive-frame]").first();

const box = async (locator) => locator.evaluate((element) => {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();

  return { left, top, right, bottom, width, height };
});

const setTargets = async () => frame.evaluate((node) => {
  const document = node.contentDocument;

  const targets = [
    ["#inspection-target", 28, 150, 140, 54],
    ["#root-only-target", 205, 150, 120, 54],
    ["[data-testid='breakpoint-label']", 28, 258, 100, 34],
    ["[data-testid='edit-target']", 205, 258, 100, 34],
  ];

  for (const [selector, left, top, width, height] of targets) {
    const element = document.querySelector(selector);

    element.style.cssText = `position:absolute;left:${left}px;top:${top}px;display:block;width:${width}px;height:${height}px;margin:0;padding:0;box-sizing:border-box`;

    if (selector === "#inspection-target") {
      element.style.cssText += ";border:2px solid #b91c1c;border-radius:4px;box-shadow:0 1px 2px #000;opacity:.9;overflow:hidden;z-index:1;background-color:rgb(240,240,240);color:rgb(23,45,67)";
    }
  }

  document.documentElement.style.cssText = "position:relative;min-height:1800px";
  document.body.style.cssText = "margin:0;min-height:1800px";

  const input = document.querySelector("input");

  if (input) input.style.cssText = "position:absolute;left:0;top:1200px";
});

const select = async (selector, modifiers = []) => {
  const point = await page.evaluate((targetSelector) => {
    const preview = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("iframe[data-mesurer-responsive-frame]");

    const target = preview?.contentDocument?.querySelector(targetSelector);

    if (!(preview instanceof HTMLIFrameElement) || !target) return null;
    const frameRect = preview.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const scale = frameRect.width / preview.offsetWidth;

    return {
      x: frameRect.left + (targetRect.left + preview.clientLeft) * scale + targetRect.width * scale / 2,
      y: frameRect.top + (targetRect.top + preview.clientTop) * scale + targetRect.height * scale / 2,
    };
  }, selector);

  assert(point, `Preview target has rendered projected geometry: ${selector}`);

  for (const modifier of modifiers) {
    await page.keyboard.down(modifier);
    await settle();

    if (modifier === "Shift") {
      await page.waitForFunction(() => {
        const card = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-inspect-info-card]");

        return card?.dataset.mesurerShiftPassThrough === "true";
      });
    }
  }

  try {
    await page.mouse.click(point.x, point.y);
  } finally {
    for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
  }

  await settle();
};

const initializeScenario = async ({ selectTarget = true } = {}) => {
  // Every focused scenario starts from a freshly mounted fixture with the same
  // source geometry, viewport, DPR context, Responsive zoom, and scroll state.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));

  assert.equal(await page.evaluate(() => devicePixelRatio), dpr, "Scenario retains its requested DPR context");

  await page.locator("[data-mesurer-builtin='settings'] button").click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.waitFor({ state: "visible" });
  await settings.getByRole("tab", { name: "Select" }).click();
  const layoutDetails = settings.getByRole("switch", { name: "Layout details" });

  if (await layoutDetails.getAttribute("aria-checked") !== "true") await layoutDetails.click();

  await settings.getByLabel("Info card mode").selectOption("click");
  await page.keyboard.press("Escape");
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await frame.contentFrame().locator("#inspection-target").waitFor();
  await setTargets();
  await frame.evaluate((node) => node.contentWindow.scrollTo({ top: 0, behavior: "instant" }));
  await page.locator("[data-mesurer-island]").evaluate((host) => {
    const root = host.shadowRoot;
    root.querySelector("[data-mesurer-responsive-row]").scrollTo({ top: 0, behavior: "instant" });
    const zoom = root.querySelector("[aria-label='Zoom']");
    zoom.value = "fit";
    zoom.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();

  assert.deepEqual(await selectionState(), [], "Fresh scenario starts with no selected targets");

  if (selectTarget) await select("#inspection-target");
};

const selectionState = () => page.evaluate(async () => {
  try {
    const context = await window.__MESURER__.context({ scope: "selection" });

    return context.targets.map((target) => target.inspection.selector);
  } catch (error) {
    if (String(error).includes("Mesurer has no current selection")) return [];

    throw error;
  }
});

const screenshotWithoutOutline = async (path) => {
  const styles = await page.evaluate(() => {
    const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

    const edges = [...new Set([
      ...document.querySelectorAll("[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true'] > *"),
      ...overlay.querySelectorAll("[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true'] > *"),
    ])];

    return edges.map((edge) => {
      const visibility = edge.style.visibility;
      edge.style.visibility = "hidden";

      return visibility;
    });
  });

  try {
    return await page.screenshot(path ? { path, scale: "device" } : { scale: "device" });
  } finally {
    await page.evaluate((previousStyles) => {
      const overlay = document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document;

      const edges = [...new Set([
        ...document.querySelectorAll("[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true'] > *"),
        ...overlay.querySelectorAll("[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true'] > *"),
      ])];

      edges.forEach((edge, index) => { edge.style.visibility = previousStyles[index] ?? ""; });
    }, styles);
  }
};

const measureOutline = () => page.evaluate(() => {
  const island = document.querySelector("[data-mesurer-island]");
  const overlay = island?.shadowRoot ?? document;

  const unique = (selector) => [...new Set([
    ...document.querySelectorAll(selector),
    ...overlay.querySelectorAll(selector),
  ])];

  const frames = unique("[data-mesurer-selected-measurement='true']");

  const outlines = frames.flatMap((selection) => [...selection.querySelectorAll("[data-mesurer-measurement-chrome='true']")]);
  const edgeNames = ["top", "right", "bottom", "left"];

  const edges = outlines.flatMap((outline) => [...outline.children].map((edge, index) => {
    const rect = edge.getBoundingClientRect();
    const style = getComputedStyle(edge);

    return {
      edge: edgeNames[index],
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      computed: { width: style.width, height: style.height, border: style.borderWidth },
      inlineStyle: edge.getAttribute("style"),
      parentRect: edge.parentElement?.getBoundingClientRect().toJSON() ?? null,
    };
  }));

  const frame = overlay.querySelector("iframe[data-mesurer-responsive-frame]");
  const selectionRect = outlines[0]?.getBoundingClientRect();

  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const allChrome = unique("[data-mesurer-measurement-chrome='true']");
  const hoverOutlines = unique("[data-mesurer-hover-measurement='true']");

  const overlappingChrome = [...allChrome, ...hoverOutlines]
    .filter((element) => !frames[0]?.contains(element))
    .filter((element) => intersects(element.getBoundingClientRect(), selectionRect ?? new DOMRect()))
    .length;

  return {
    selectedOutlines: frames.length,
    outlineElements: outlines.length,
    hoverOutlines: hoverOutlines.length,
    allMeasurementChrome: allChrome.length,
    selectionRect: selectionRect?.toJSON() ?? null,
    selectedEdgeCount: edges.length,
    overlappingChrome,
    edges,
    dpr: devicePixelRatio,
    scale: frame ? frame.getBoundingClientRect().width / frame.offsetWidth : null,
  };
});

const measurePaintedEdges = async (withOutline, withoutOutline) => page.evaluate(async ({ withOutlineBase64, withoutOutlineBase64 }) => {
  const decode = async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);

    return { canvas, context: canvas.getContext("2d") };
  };

  const withOutline = await decode(withOutlineBase64);
  const withoutOutline = await decode(withoutOutlineBase64);
  // PNG dimensions round fractional viewport extents; that does not stretch
  // the raster grid. CSS coordinates still map at the exact requested DPR.
  const rasterScaleX = devicePixelRatio;
  const rasterScaleY = devicePixelRatio;

  if (Math.abs(withOutline.canvas.width - innerWidth * devicePixelRatio) > 1
    || Math.abs(withOutline.canvas.height - innerHeight * devicePixelRatio) > 1) {
    throw new Error("Screenshot is not device-scale");
  }

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext("2d");

  const selection = (document.querySelector("[data-mesurer-island]")?.shadowRoot ?? document)
    .querySelector("[data-mesurer-selected-measurement='true']");

  const outline = selection?.querySelector("[data-mesurer-measurement-chrome='true']");

  if (!outline) throw new Error("Selected outline is missing while sampling screenshot");

  return [...outline.children].map((edge, index) => {
    const rect = edge.getBoundingClientRect();
    colorContext.clearRect(0, 0, 1, 1);
    colorContext.fillStyle = edge.querySelector("rect")
      ? getComputedStyle(edge.querySelector("rect")).fill : getComputedStyle(edge).backgroundColor;
    colorContext.fillRect(0, 0, 1, 1);
    const [colorRed, colorGreen, colorBlue, colorAlphaByte] = colorContext.getImageData(0, 0, 1, 1).data;
    const colorAlpha = colorAlphaByte / 255;
    const horizontal = index === 0 || index === 2;
    const position = horizontal ? rect.top + rect.height / 2 : rect.left + rect.width / 2;

    const sample = (alongFraction, devicePixelDelta) => {
      const along = horizontal
        ? rect.left + rect.width * alongFraction
        : rect.top + rect.height * alongFraction;

      const x = horizontal
        ? Math.floor(along * rasterScaleX)
        : Math.floor(position * rasterScaleX) + devicePixelDelta;

      const y = horizontal
        ? Math.floor(position * rasterScaleY) + devicePixelDelta
        : Math.floor(along * rasterScaleY);

      if (x < 0 || y < 0 || x >= withOutline.canvas.width || y >= withOutline.canvas.height) return null;

      return {
        withOutline: [...withOutline.context.getImageData(x, y, 1, 1).data],
        withoutOutline: [...withoutOutline.context.getImageData(x, y, 1, 1).data],
      };
    };

    // Compare against an otherwise identical screenshot with the edge hidden.
    // Project the observed RGB delta onto the expected composited outline
    // color so antialiasing contributes fractional physical-pixel coverage.
    const coverage = (pixel) => {
      if (!pixel) return 0;
      const [red, green, blue] = pixel.withoutOutline;

      const expected = [
        (colorRed - red) * colorAlpha,
        (colorGreen - green) * colorAlpha,
        (colorBlue - blue) * colorAlpha,
      ];

      const actual = [
        pixel.withOutline[0] - red,
        pixel.withOutline[1] - green,
        pixel.withOutline[2] - blue,
      ];

      const expectedEnergy = expected.reduce((sum, value) => sum + value * value, 0);

      return expectedEnergy > 0
        ? Math.max(0, actual.reduce((sum, value, channel) => sum + value * expected[channel], 0) / expectedEnergy)
        : 0;
    };

    // Compare each edge to a screenshot with the edge hidden. Count every
    // device pixel with meaningful projected-color coverage so fractional
    // antialiasing at either boundary is visible to the contract.
    // Midpoint classification with a one-percentage-point RGB-quantization
    // allowance: a nominal 50% sample must not flip because of 8-bit rounding.
    // Keep raw coverage and every scanline, never round integrated coverage.
    const threshold = 0.49;
    const sampleFractions = [0.15, 0.325, 0.5, 0.675, 0.85];

    const sampleLines = sampleFractions.map((fraction) => {
      const samples = Array.from({ length: 17 }, (_, offset) => offset - 8).map((delta) => {
        const pixel = sample(fraction, delta);

        return { devicePixelDelta: delta, coverage: coverage(pixel), ...pixel };
      });

      const runs = [];
      let run = [];

      for (const item of samples) {
        if (item.coverage > threshold) run.push(item);
        else if (run.length) { runs.push(run); run = []; }
      }

      if (run.length) runs.push(run);

      const selectedRun = runs.sort((a, b) =>
        Math.abs(a.reduce((sum, item) => sum + item.devicePixelDelta, 0) / a.length)
        - Math.abs(b.reduce((sum, item) => sum + item.devicePixelDelta, 0) / b.length))[0] ?? [];

      return {
        alongFraction: fraction,
        paintedDevicePixels: selectedRun.length,
        paintedPhysicalPixels: samples.reduce((sum, item) => sum + item.coverage, 0),
        samples,
      };
    });

    const paintedPhysicalPixels = sampleLines.reduce((sum, line) => sum + line.paintedPhysicalPixels, 0)
      / sampleLines.length;

    const paintedDevicePixels = sampleLines[0].paintedDevicePixels;

    return {
      edge: ["top", "right", "bottom", "left"][index],
      paintedDevicePixels,
      paintedPhysicalPixels,
      sampleLines,
      threshold,
      outlineColor: `rgba(${colorRed}, ${colorGreen}, ${colorBlue}, ${colorAlpha})`,
      rect: rect.toJSON(),
      rasterScaleX,
      rasterScaleY,
    };
  });
}, {
  withOutlineBase64: withOutline.toString("base64"),
  withoutOutlineBase64: withoutOutline.toString("base64"),
});

const cardState = () => page.evaluate(() => {
  const island = document.querySelector("[data-mesurer-island]");
  const overlay = island?.shadowRoot;
  const card = overlay?.querySelector("[data-mesurer-inspect-info-card]");
  const selectedChrome = overlay?.querySelector("[data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']");
  const stage = overlay?.querySelector("[data-mesurer-responsive-stage]");
  const row = overlay?.querySelector("[data-mesurer-responsive-row]");
  const frame = overlay?.querySelector("iframe[data-mesurer-responsive-frame]");

  const read = (element) => {
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();

    return { left, top, right, bottom, width, height };
  };

  if (!card || !selectedChrome || !stage || !row || !frame) return null;

  const intersect = (a, b) => {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);

    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const stageRect = read(stage);
  const rowRect = read(row);
  const frameRect = read(frame);
  const visibleStage = intersect(intersect(stageRect, rowRect), viewport);
  const visibleFrame = intersect(intersect(intersect(frameRect, rowRect), stageRect), viewport);
  const edgeRects = [...selectedChrome.children].map((edge) => edge.getBoundingClientRect());

  const selected = {
    left: Math.min(...edgeRects.map((rect) => rect.left)),
    top: Math.min(...edgeRects.map((rect) => rect.top)),
    right: Math.max(...edgeRects.map((rect) => rect.right)),
    bottom: Math.max(...edgeRects.map((rect) => rect.bottom)),
  };

  selected.width = selected.right - selected.left;

  selected.height = selected.bottom - selected.top;

  return {
    card: read(card),
    selected,
    frame: frameRect,
    stage: stageRect,
    visibleStage,
    visibleFrame,
    inProtectedRoot: overlay.contains(card),
    pointerEvents: getComputedStyle(card).pointerEvents,
    passThrough: card.getAttribute("data-mesurer-pass-through"),
    shiftPassThrough: card.getAttribute("data-mesurer-shift-pass-through"),
  };
});

try {
  await page.addInitScript(() => {
    if (!localStorage.getItem("mesurer-settings")) {
      localStorage.setItem("mesurer-settings", JSON.stringify({
        version: 2,
        settings: { shortcutsEnabled: true },
        workspace: null,
      }));
    }
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  if (!focus || focus === "outline") {
  await initializeScenario();
  assert.deepEqual(await selectionState(), ["#inspection-target"],
    "Physical preview click selects the intended target before the viewport narrows");
  await page.setViewportSize({ width: 442, height: 1000 });
  await setTargets();
  await settle();
  // Sweep fractional source geometry so the contract cannot pass because one
  // selected position happened to land on favorable device-pixel boundaries.
  const hoverAtSelection = await measureOutline();
  artifact.runs.push({ name: "outline-hover-at-selection", metrics: hoverAtSelection });

  const captureOutline = async (name, screenshotName) => {
    const screenshot = await page.screenshot({ path: join(output, screenshotName), scale: "device" });
    const withoutOutline = await screenshotWithoutOutline(join(output, screenshotName.replace(".png", "-background.png")));
    const metrics = await measureOutline();
    metrics.paintedEdges = await measurePaintedEdges(screenshot, withoutOutline);
    artifact.runs.push({ name, metrics });

    metrics.expectedDevicePixels = Math.max(1, Math.round(dpr));
    metrics.paintedPass = metrics.paintedEdges.every((edge) => edge.sampleLines.every(
      (line) => line.paintedDevicePixels === metrics.expectedDevicePixels));

    return metrics;
  };

  const fractionalSteps = Array.from({ length: 10 }, (_, index) => index / 10);

  await frame.evaluate((node) => {
    node.contentDocument.querySelector("#inspection-target").style.width = "140px";
  });
  await settle();
  const sourceBeforeResize = await frame.contentFrame().locator("#inspection-target").boundingBox();
  assert.deepEqual(await selectionState(), ["#inspection-target"],
    "Stationary-resize case starts with the intended selected source");
  await page.mouse.move(page.viewportSize().width - 1, page.viewportSize().height - 1);
  const beforeStationaryResize = await measureOutline();
  await frame.evaluate((node) => {
    node.contentDocument.querySelector("#inspection-target").style.width = "220px";
  });
  await settle();
  const sourceAfterResize = await frame.contentFrame().locator("#inspection-target").boundingBox();
  const afterStationaryResize = await measureOutline();
  const resizedParent = afterStationaryResize.edges[0].parentRect;
  const resizedHorizontalEdges = afterStationaryResize.edges.filter(({ edge }) => edge === "top" || edge === "bottom");
  artifact.runs.push({ name: "outline-stationary-pointer-resize", metrics: {
    sourceBeforeResize,
    sourceAfterResize,
    before: beforeStationaryResize,
    after: afterStationaryResize,
  } });
  assert(sourceAfterResize.width > sourceBeforeResize.width + 50,
    `Fixture source itself resized without pointer movement: ${JSON.stringify({ sourceBeforeResize, sourceAfterResize })}`);
  assert(resizedParent.width > beforeStationaryResize.selectionRect.width + 50,
    `ResizeObserver updates the selected box without pointer movement: ${JSON.stringify({ beforeStationaryResize, afterStationaryResize })}`);
  assert(resizedHorizontalEdges.every(({ rect }) =>
    Math.abs(rect.left - resizedParent.left) <= 0.51 / dpr
      && Math.abs(rect.left + rect.width - resizedParent.right) <= 0.51 / dpr),
    `Horizontal selected edges match the resized box without pointer movement: ${JSON.stringify({ resizedParent, resizedHorizontalEdges })}`);
  assert(Math.abs(afterStationaryResize.edges.find(({ edge }) => edge === "right").rect.left
    + afterStationaryResize.edges.find(({ edge }) => edge === "right").rect.width - resizedParent.right) <= 0.51 / dpr,
  `Right selection edge reaches the resized box edge: ${JSON.stringify({ resizedParent, edges: afterStationaryResize.edges })}`);
  await frame.evaluate((node) => {
    node.contentDocument.querySelector("#inspection-target").style.width = "140px";
  });
  await settle();

  const sweepOutline = async (name, screenshotPrefix) => {
    const sweep = [];

    for (const [stepIndex, offset] of fractionalSteps.entries()) {
      await frame.evaluate((node, step) => {
        const target = node.contentDocument.querySelector("#inspection-target");
        target.style.left = `${step.fraction}px`;
        target.style.top = `${20 + step.fraction}px`;
        target.style.width = `${330 + step.fraction}px`;
        target.style.height = `${256 + step.fraction}px`;
      }, { index: stepIndex, fraction: offset });
      await settle();
      await page.mouse.move(page.viewportSize().width - 1, page.viewportSize().height - 1);
      await settle();

      const metrics = await captureOutline(
        `outline-${name}-step-${offset.toFixed(1)}`,
        `${screenshotPrefix}-${offset.toFixed(1)}.png`,
      );

      assert.equal(metrics.hoverOutlines, 0, `${name} step ${offset.toFixed(1)} has no overlapping hover outline`);
      assert.equal(metrics.overlappingChrome, 0, `${name} step ${offset.toFixed(1)} has no overlapping measurement chrome`);

      sweep.push({ offset, metrics });
    }

    artifact.runs.push({ name, metrics: sweep });

    return sweep;
  };

  const fractionalSweep = await sweepOutline("outline-fractional-fit-sweep", "responsive-outline-fractional");

  const fractionalOutline = fractionalSweep[0].metrics;
  artifact.runs.push({ name: "outline-fractional-fit", metrics: fractionalOutline });
  assert.equal(fractionalOutline.selectedOutlines, 1, "Exactly one selected outline should render at fractional Fit scale");
  assert.equal(fractionalOutline.outlineElements, 1, "Exactly one selected chrome element should render at fractional Fit scale");
  assert.equal(fractionalOutline.allMeasurementChrome, 1, "Only one measurement outline may paint over the selection");
  assert(fractionalOutline.scale < 1 && fractionalOutline.scale > 0.9,
    `Narrow Fit should use fractional scale, got ${fractionalOutline.scale}`);
  assert.equal(fractionalOutline.dpr, dpr, `Contract runs at requested device scale factor ${dpr}`);

  await page.setViewportSize({ width: 1280, height: 800 });
  await settle();
  await page.locator("[data-mesurer-island]").evaluate((host) => {
    host.shadowRoot.querySelector("[aria-label='Zoom']").value = "1";
    host.shadowRoot.querySelector("[aria-label='Zoom']").dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  const scaleOneSweep = await sweepOutline("outline-scale-one-sweep", "responsive-outline-scale-one");
  const scaleOneOutline = scaleOneSweep[0].metrics;
  artifact.runs.push({ name: "outline-scale-one", metrics: scaleOneOutline });
  assert.equal(scaleOneOutline.selectedOutlines, 1, "Exactly one selected outline should render at 1×");
  assert(Math.abs(scaleOneOutline.scale - 1) < 0.002,
    `Wide viewport uses exact 1× zoom, got ${scaleOneOutline.scale}`);
  assert.equal(scaleOneOutline.allMeasurementChrome, 1, "Only one measurement outline may paint over the selection at 1×");
  assert.equal(scaleOneOutline.overlappingChrome, 0, "No second outline may overlap the selection at 1×");
  assert.equal(scaleOneOutline.hoverOutlines, 0, "Selected targets must not retain overlapping hover chrome at 1×");

  }

  if (!focus || focus === "card") {
  await initializeScenario();

  // Card contract: at 442px the card must not cover the selected element, even
  // for a target close to the bottom of the visible preview/stage.
  await page.setViewportSize({ width: 442, height: 1000 });
  await page.locator("[data-mesurer-island]").evaluate((host) => {
    host.shadowRoot.querySelector("[aria-label='Zoom']").value = "fit";
    host.shadowRoot.querySelector("[aria-label='Zoom']").dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  await select("#root-only-target");
  await select("#inspection-target");
  await settle();
  const narrow = await cardState();
  artifact.runs.push({ name: "card-narrow", metrics: narrow });
  assert(narrow, "Inspect card and selected target should be measurable in narrow mode");
  assert(!overlaps(narrow.card, narrow.selected), `Narrow Inspect card must not cover target: ${JSON.stringify(narrow)}`);
  assertContained(narrow.card, narrow.visibleStage, "Narrow Inspect card stays in the visible stage");
  assert.equal(narrow.inProtectedRoot, true, "Inspect card remains inside the protected root overlay");
  assert.notEqual(narrow.pointerEvents, "none", "Selected Inspect card stays interactive");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("[data-mesurer-inspect-info-card]").getByRole("button", { name: "Copy dimensions" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\d+\s*x\s*\d+/,
    "Copy dimensions button writes the selected preview's CSS dimensions");
  await settle();
  const detailsButton = page.locator("[data-mesurer-inspect-info-card] button[aria-expanded]").first();
  await detailsButton.waitFor({ state: "visible" });
  await detailsButton.click();
  assert.equal(await detailsButton.getAttribute("aria-expanded"), "true", "CSS details expansion remains interactive");
  await page.screenshot({ path: join(output, "responsive-card-narrow.png") });
  const beforePreviewScroll = await cardState();
  await frame.evaluate((node) => node.contentWindow.scrollTo({ top: 60, behavior: "instant" }));
  await settle();
  const afterPreviewScroll = await cardState();
  artifact.runs.push({ name: "card-preview-scroll", metrics: { before: beforePreviewScroll, after: afterPreviewScroll } });
  assert(afterPreviewScroll && afterPreviewScroll.card.top < beforePreviewScroll.card.top - 20,
    `Inspect card follows preview scroll: ${JSON.stringify({ before: beforePreviewScroll, after: afterPreviewScroll })}`);
  assert(!overlaps(afterPreviewScroll.card, afterPreviewScroll.selected),
    "Inspect card remains off the selection after preview scroll");

  const beforeStageScroll = await cardState();
  await page.locator("[data-mesurer-island]").evaluate((host) => {
    host.shadowRoot.querySelector("[data-mesurer-responsive-row]").scrollTo({ top: 48, behavior: "instant" });
  });
  await settle();
  const afterStageScroll = await cardState();
  artifact.runs.push({ name: "card-stage-scroll", metrics: { before: beforeStageScroll, after: afterStageScroll } });
  assert(afterStageScroll && Math.abs(afterStageScroll.card.top - beforeStageScroll.card.top) > 20,
    `Inspect card repositions after stage scroll: ${JSON.stringify({ before: beforeStageScroll, after: afterStageScroll })}`);
  assert(!overlaps(afterStageScroll.card, afterStageScroll.selected),
    "Inspect card remains off the selection after stage scroll");
  assertContained(afterStageScroll.card, afterStageScroll.visibleStage, "Stage-scrolled card stays in visible stage bounds");

  await page.locator("[data-mesurer-island]").evaluate((host) => {
    host.shadowRoot.querySelector("[data-mesurer-responsive-row]").scrollTo({ top: 0, behavior: "instant" });
  });
  await settle();
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle();
  const wide = await cardState();
  artifact.runs.push({ name: "card-wide", metrics: wide });
  assert(wide, "Inspect card remains visible after resizing wide");
  assert(!overlaps(wide.card, wide.selected), `Wide Inspect card must not cover target: ${JSON.stringify(wide)}`);
  assert(!overlaps(wide.card, await box(page.locator("[data-preview]").first())),
    `Wide Inspect card should dock beside its preview: ${JSON.stringify(wide)}`);
  await page.screenshot({ path: join(output, "responsive-card-wide.png") });

  await page.setViewportSize({ width: 442, height: 1000 });
  await settle();
  await frame.evaluate((node) => node.contentWindow.scrollTo({ top: 0, behavior: "instant" }));
  const bottomTarget = frame.contentFrame().locator("[data-testid='edit-target']");
  await bottomTarget.evaluate((element) => { element.style.top = "790px"; });
  const bottomBounds = await bottomTarget.boundingBox();
  assert(bottomBounds, "Near-bottom target is visible before selection");
  await page.mouse.click(bottomBounds.x + bottomBounds.width / 2, bottomBounds.y + bottomBounds.height / 2);
  await settle();
  const bottomCard = await cardState();
  artifact.runs.push({ name: "card-near-stage-bottom", metrics: bottomCard });
  assert(bottomCard && Math.abs(bottomCard.card.bottom - (bottomCard.visibleStage.bottom - 8)) <= 1,
    `When neither side fits, the card uses the upstream below-and-clamped fallback: ${JSON.stringify(bottomCard)}`);
  artifact.runs.push({ name: "card-near-stage-bottom-upstream-fallback", metrics: {
    selected: bottomCard?.selected,
    card: bottomCard?.card,
    allowedSelectionOverlap: bottomCard ? overlaps(bottomCard.card, bottomCard.selected) : null,
  } });
  assert(bottomCard.selected.bottom >= bottomCard.visibleFrame.bottom - 80,
    `Near-bottom scenario places the selection close to the visible preview edge: ${JSON.stringify(bottomCard)}`);
  assertContained(bottomCard.card, bottomCard.visibleStage, "Near-bottom card stays in the visible stage");
  await page.screenshot({ path: join(output, "responsive-card-near-bottom.png") });
  }

  // Shift contract uses physical browser mouse input in the actual iframe.
  if (!focus || focus === "shift") {
  await initializeScenario();
  await page.setViewportSize({ width: 442, height: 1000 });
  await settle();
  await select("#inspection-target");
  await frame.evaluate((node) => {
    const neighbor = node.contentDocument.querySelector("#root-only-target");
    neighbor.style.left = "145px";
    neighbor.style.top = "190px";
  });
  const selectedBeforeShift = await selectionState();
  artifact.runs.push({ name: "shift-before-add", metrics: { selected: selectedBeforeShift } });
  const cardBeforeCoveredClick = await cardState();

  const coveredNeighbor = await page.evaluate(() => {
    const preview = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("iframe[data-mesurer-responsive-frame]");

    const target = preview?.contentDocument?.querySelector("#root-only-target");

    const card = document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("[data-mesurer-inspect-info-card]");

    if (!preview || !target || !card) return null;

    const frameRect = preview.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const scale = frameRect.width / preview.offsetWidth;

    const sourcePoint = {
      x: (cardRect.left + cardRect.width / 2 - frameRect.left) / scale - preview.clientLeft,
      y: (cardRect.top + cardRect.height / 2 - frameRect.top) / scale - preview.clientTop,
    };

    target.style.left = `${sourcePoint.x - target.offsetWidth / 2}px`;
    target.style.top = `${sourcePoint.y - target.offsetHeight / 2}px`;
    const targetRect = target.getBoundingClientRect();

    const point = {
      x: frameRect.left + (targetRect.left + preview.clientLeft + targetRect.width / 2) * scale,
      y: frameRect.top + (targetRect.top + preview.clientTop + targetRect.height / 2) * scale,
    };

    let hit = document.elementFromPoint(point.x, point.y);

    while (hit?.shadowRoot) {
      const nested = hit.shadowRoot.elementFromPoint(point.x, point.y);

      if (!nested || nested === hit) break;
      hit = nested;
    }

    return { point, covered: point.x >= cardRect.left && point.x <= cardRect.right
      && point.y >= cardRect.top && point.y <= cardRect.bottom,
      hit: hit?.hasAttribute("data-mesurer-inspect-info-card")
        ? "inspect-info-card"
        : hit?.id || hit?.tagName.toLowerCase() || null,
      card: cardRect.toJSON() };
  });

  assert(coveredNeighbor?.covered, `Shift fixture must place the neighbor under the visible card: ${JSON.stringify(coveredNeighbor)}`);

  if (coveredNeighbor.covered) {
    await page.screenshot({ path: join(output, "responsive-shift-under-card-before.png") });
    await select("#root-only-target", ["Shift"]);
    const selectedAfterCoveredShift = await selectionState();
    artifact.runs.push({
      name: "shift-click-under-card",
      metrics: { selectedBefore: selectedBeforeShift, selectedAfter: selectedAfterCoveredShift, hitTest: coveredNeighbor, card: cardBeforeCoveredClick },
    });
    await page.screenshot({ path: join(output, "responsive-shift-under-card.png") });
    assert.equal(selectedAfterCoveredShift.length, 2,
      `Shift-click adds a preview target physically under the Inspect card: ${JSON.stringify({ selectedAfterCoveredShift, coveredNeighbor })}`);
    assert(selectedAfterCoveredShift.includes("#root-only-target"),
      `The covered preview target is the added selection: ${JSON.stringify(selectedAfterCoveredShift)}`);

    await select("#inspection-target");
    assert.deepEqual(await selectionState(), ["#inspection-target"],
      "Plain click restores a single selection for card control checks");
    const card = page.locator("[data-mesurer-inspect-info-card]");
    const copyButton = card.getByRole("button", { name: "Copy dimensions" });
    const detailsButton = card.locator("button[aria-expanded]").first();
    const selectedTarget = frame.contentFrame().locator("#inspection-target");
    await page.keyboard.down("Shift");

    await selectedTarget.evaluate((element) => { element.style.fontSize = "19px"; });

    await page.waitForFunction(() => {
      const card = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-inspect-info-card]");

      return card?.dataset.mesurerShiftPassThrough === "true";
    });

    const rerenderHitRules = await card.evaluate((element) => {
      const newRow = element.querySelector("[data-mesurer-inspect-css-row] button");

      return {
        card: getComputedStyle(element).pointerEvents,
        newRow: newRow ? getComputedStyle(newRow).pointerEvents : null,
      };
    });

    assert.equal(rerenderHitRules.card, "none", `Shift makes card pass through: ${JSON.stringify(rerenderHitRules)}`);
    assert(rerenderHitRules.newRow === null || rerenderHitRules.newRow === "none",
      `New detail rows remain pass-through while Shift is held: ${JSON.stringify(rerenderHitRules)}`);
    await page.keyboard.up("Shift");

    await page.waitForFunction(() => {
      const card = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-inspect-info-card]");

      return card?.dataset.mesurerShiftPassThrough !== "true";
    });

    assert.equal(await copyButton.isEnabled(), true, "Copy control remains enabled after Shift release and row rerender");
    await copyButton.click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /\d+\s*x\s*\d+/,
      "Copy button writes dimensions after Shift release");
    await detailsButton.click();
    assert.equal(await detailsButton.getAttribute("aria-expanded"), "true",
      "CSS details expand after Shift release and row rerender");
    await page.keyboard.down("Shift");

    await page.waitForFunction(() => {
      const card = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-inspect-info-card]");

      return card?.dataset.mesurerShiftPassThrough === "true";
    });

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

    await page.waitForFunction(() => {
      const card = document.querySelector("[data-mesurer-island]")?.shadowRoot?.querySelector("[data-mesurer-inspect-info-card]");

      return card?.dataset.mesurerShiftPassThrough !== "true";
    });
    assert.equal(await card.evaluate((element) => getComputedStyle(element).pointerEvents), "auto",
      "Window blur restores card interaction while Shift remains physically held");
    await page.keyboard.up("Shift");

  } else {
    throw new Error("Unreachable: covered-target precondition is required");
  }

  await frame.evaluate((node) => {
    const neighbor = node.contentDocument.querySelector("#root-only-target");
    neighbor.style.left = "205px";
    neighbor.style.top = "150px";
  });
  await select("#root-only-target");
  let selected = await selectionState();
  artifact.runs.push({ name: "plain-click-replace", metrics: { selected } });
  assert.deepEqual(selected, ["#root-only-target"], "Plain click replaces preview selection");
  await select("#inspection-target");
  const firstBox = await frame.contentFrame().locator("#inspection-target").boundingBox();
  const labelBox = await frame.contentFrame().locator("[data-testid='breakpoint-label']").boundingBox();
  assert(firstBox && labelBox, "Preview targets for additive marquee render");
  await page.keyboard.down("Shift");
  await page.mouse.move(firstBox.x - 10, firstBox.y - 10);
  await page.mouse.down();
  await page.mouse.move(labelBox.x + labelBox.width + 10, labelBox.y + labelBox.height + 10, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await settle();
  selected = await selectionState();
  artifact.runs.push({ name: "shift-drag-marquee-add", metrics: { selected } });
  assert(selected.includes("#inspection-target") && selected.some((selector) => selector.includes("breakpoint-label")),
    `Shift-drag marquee adds targets from inside preview: ${JSON.stringify(selected)}`);
  await page.screenshot({ path: join(output, "responsive-shift-multiselect.png") });
  }

  if (!focus || focus === "held-shift") {
    // Recreate the real mount path: press Shift before any selection exists,
    // then keep it down while selecting and clicking through the newly mounted card.
    await initializeScenario({ selectTarget: false });
    await page.setViewportSize({ width: 442, height: 1000 });
    await settle();

    const placeCoveredNeighbor = async () => page.evaluate(() => {
      const preview = document.querySelector("[data-mesurer-island]")?.shadowRoot
        ?.querySelector("iframe[data-mesurer-responsive-frame]");

      const target = preview?.contentDocument?.querySelector("#root-only-target");

      const card = document.querySelector("[data-mesurer-island]")?.shadowRoot
        ?.querySelector("[data-mesurer-inspect-info-card]");

      if (!preview || !target || !card) return null;

      const frameRect = preview.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const scale = frameRect.width / preview.offsetWidth;

      const sourcePoint = {
        x: (cardRect.left + cardRect.width / 2 - frameRect.left) / scale - preview.clientLeft,
        y: (cardRect.top + cardRect.height / 2 - frameRect.top) / scale - preview.clientTop,
      };

      target.style.left = `${sourcePoint.x - target.offsetWidth / 2}px`;
      target.style.top = `${sourcePoint.y - target.offsetHeight / 2}px`;

      const targetRect = target.getBoundingClientRect();

      return {
        point: {
          x: frameRect.left + (targetRect.left + preview.clientLeft + targetRect.width / 2) * scale,
          y: frameRect.top + (targetRect.top + preview.clientTop + targetRect.height / 2) * scale,
        },
        card: cardRect.toJSON(),
      };
    });

    const clickCoveredWhileShiftHeld = async (scenario) => {
      const covered = await placeCoveredNeighbor();

      assert(covered, `${scenario}: covered element and card are rendered`);

      await page.mouse.move(covered.point.x, covered.point.y);
      await settle();

      const hitState = await page.locator("[data-mesurer-inspect-info-card]")
        .evaluate((card) => ({
          passThrough: getComputedStyle(card).pointerEvents === "none",
          shiftAttribute: card.dataset.mesurerShiftPassThrough,
          inlinePointerEvents: card.style.pointerEvents,
        }));

      const passThrough = hitState.passThrough;

      artifact.runs.push({ name: `held-shift-${scenario}-pointermove`, metrics: { covered, passThrough, hitState } });

      assert(passThrough, `${scenario}: the card becomes pass-through before pointerdown while Shift remains held`);
      assert.equal(hitState.shiftAttribute, "true",
        `${scenario}: held Shift is reflected in the card's pass-through attribute`);
      await page.mouse.click(covered.point.x, covered.point.y);
      await settle();
      const selected = await selectionState();
      artifact.runs.push({ name: `held-shift-${scenario}-click`, metrics: { selected, covered } });
      assert(selected.includes("#root-only-target"),
        `${scenario}: Shift-click adds the element under the card: ${JSON.stringify(selected)}`);
    };

    await page.keyboard.down("Shift");
    await select("#inspection-target");
    assert.deepEqual(await selectionState(), ["#inspection-target"],
      "Held-Shift initial selection mounts its selected card");
    await clickCoveredWhileShiftHeld("initial-selection");
    await page.keyboard.up("Shift");

    // Start from an empty selection, then hold Shift across a one-target
    // marquee. The selected card is absent during the drag and mounts after it.
    await initializeScenario({ selectTarget: false });
    await page.setViewportSize({ width: 442, height: 1000 });
    await settle();
    await page.keyboard.down("Shift");
    const marqueeTarget = await frame.contentFrame().locator("#inspection-target").boundingBox();
    assert(marqueeTarget, "Held-marquee fixture target is rendered");
    await page.mouse.move(marqueeTarget.x - 8, marqueeTarget.y - 8);
    await page.mouse.down();
    await page.mouse.move(marqueeTarget.x + marqueeTarget.width + 8,
      marqueeTarget.y + marqueeTarget.height + 8, { steps: 8 });
    await page.mouse.up();
    await settle();
    const afterMarquee = await selectionState();
    artifact.runs.push({ name: "held-shift-marquee", metrics: { selected: afterMarquee } });
    assert.deepEqual(afterMarquee, ["#inspection-target"],
      `Held-Shift marquee selects one target and restores its card: ${JSON.stringify(afterMarquee)}`);
    await page.waitForFunction(() => document.querySelector("[data-mesurer-island]")?.shadowRoot
      ?.querySelector("[data-mesurer-inspect-info-card]"), { timeout: 5_000 });
    await clickCoveredWhileShiftHeld("marquee-remount");
    await page.keyboard.up("Shift");
    await page.screenshot({ path: join(output, "responsive-held-shift-pass-through.png") });
  }

  if (!focus || focus === "outline" || focus === "outline-neighbor") {
    await initializeScenario();
    await page.setViewportSize({ width: 442, height: 1000 });
    await settle();
    await select("#inspection-target");
    await frame.evaluate((node) => {
      const neighbor = node.contentDocument.querySelector("#root-only-target");
      neighbor.style.left = "167px";
      neighbor.style.top = "150px";
      neighbor.style.width = "150px";
      neighbor.style.height = "54px";
    });

    const neighborPoint = await page.evaluate(() => {
      const preview = document.querySelector("[data-mesurer-island]")?.shadowRoot
        ?.querySelector("iframe[data-mesurer-responsive-frame]");

      const neighbor = preview?.contentDocument?.querySelector("#root-only-target");

      if (!preview || !neighbor) return null;

      const frameRect = preview.getBoundingClientRect();
      const targetRect = neighbor.getBoundingClientRect();
      const scale = frameRect.width / preview.offsetWidth;

      return {
        x: frameRect.left + (targetRect.left + preview.clientLeft + targetRect.width / 2) * scale,
        y: frameRect.top + (targetRect.top + preview.clientTop + targetRect.height / 2) * scale,
      };
    });

    assert(neighborPoint, "Neighbor preview target has a rendered hover point");
    await page.mouse.move(neighborPoint.x, neighborPoint.y);
    await settle();
    const hoverOnNeighbor = await measureOutline();
    artifact.runs.push({ name: "outline-hover-neighbor", metrics: hoverOnNeighbor });
    await page.screenshot({ path: join(output, "responsive-outline-hover-neighbor.png") });
  }

  assert.deepEqual(errors, [], `Browser diagnostics are clean: ${errors.join("\n")}`);
  const paintedFailures = artifact.runs.filter((run) => run.metrics?.paintedPass === false);
  artifact.paintedFailures = paintedFailures.map(({ name, metrics }) => ({ name,
    expected: metrics.expectedDevicePixels,
    edges: metrics.paintedEdges.map(({ edge, sampleLines }) => ({ edge,
      counts: sampleLines.map((line) => line.paintedDevicePixels) })),
  }));
  assert.equal(paintedFailures.length, 0, `Painted edge failures: ${JSON.stringify(artifact.paintedFailures)}`);
  await writeFile(join(output, "responsive-selection-card.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Responsive selection/card contract passed. Evidence: ${output}`);
} catch (error) {
  artifact.error = String(error);
  artifact.stack = error?.stack;
  await page.screenshot({ path: join(output, "responsive-selection-card-failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(join(output, "responsive-selection-card-failure.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function assertContained(rect, bounds, label) {
  assert(rect.left >= bounds.left - 1 && rect.top >= bounds.top - 1
    && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1,
  `${label}: ${JSON.stringify({ rect, bounds })}`);
}
