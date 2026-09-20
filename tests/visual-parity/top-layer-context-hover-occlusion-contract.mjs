import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TOP_LAYER_CONTEXT_URL ?? "http://127.0.0.1:4174/top-layer-context.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1162, height: 620 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickDocumentUi = async (locator, label) => {
  await locator.waitFor({ state: "visible", timeout: 3000 });
  const box = await locator.boundingBox();
  assert(box, `${label} must have rendered geometry`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
};

const removeProbe = () => page.evaluate(() => {
  document.querySelector("#mesurer-context-hover-occlusion-probe")?.remove();
});

const prepareFixture = async () => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_TOP_LAYER_CONTEXT_TEST__?.subject));

  const topology = await page.evaluate(() => {
    const subject = window.__MESURER_TOP_LAYER_CONTEXT_TEST__?.subject;
    const island = document.querySelector("[data-mesurer-island='true']");

    return {
      hostLayer: subject?.hostLayer ?? null,
      isolated: subject?.root instanceof ShadowRoot,
      islandTopLayer: island instanceof HTMLElement ? island.matches(":popover-open") : false,
      contextMounts: document.querySelectorAll(
        "[data-mesurer-document-inspector-mount='true'][data-mesurer-context-root='true']",
      ).length,
    };
  });

  assert.deepEqual(topology, {
    hostLayer: "top-layer",
    isolated: false,
    islandTopLayer: true,
    contextMounts: 1,
  }, `contract must reproduce the non-isolated top-layer Context topology: ${JSON.stringify(topology)}`);

  await page.evaluate(async () => {
    const subject = window.__MESURER_TOP_LAYER_CONTEXT_TEST__?.subject;

    if (!subject) throw new Error("Expected top-layer Context test subject");
    await subject.select("#top-layer-context-target");
  });
  await settle();

  return topology;
};

const assertSurfaceOccludesHover = async (surface, label) => {
  await surface.waitFor({ state: "visible", timeout: 3000 });
  const cardBox = await surface.boundingBox();
  assert(cardBox, `${label} must have rendered geometry`);

  const probe = await page.evaluate((box) => {
    document.querySelector("#mesurer-context-hover-occlusion-probe")?.remove();
    const overlapX = box.x + box.width / 2;
    const probeTop = Math.max(0, box.y - 28);
    const probeBottom = Math.min(innerHeight, box.y + box.height + 28);
    const target = document.createElement("div");
    target.id = "mesurer-context-hover-occlusion-probe";
    Object.assign(target.style, {
      position: "fixed",
      left: "0px",
      top: `${probeTop}px`,
      width: `${overlapX}px`,
      height: `${probeBottom - probeTop}px`,
      background: "transparent",
      pointerEvents: "auto",
      zIndex: "0",
    });
    document.body.append(target);

    return {
      x: overlapX - 0.5,
      y: box.y + box.height / 2,
      pointerX: Math.max(6, box.x - 36),
      pointerY: box.y + box.height / 2,
    };
  }, cardBox);

  await page.mouse.move(probe.pointerX, probe.pointerY);
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-hover-measurement='true']")
      || document.querySelector("[data-mesurer-island='true']")?.shadowRoot
        ?.querySelector("[data-mesurer-hover-measurement='true']"),
  ));
  await settle();

  const result = await surface.evaluate((card, point) => {
    const ownerDocument = card.ownerDocument;
    const island = ownerDocument.querySelector("[data-mesurer-island='true']");
    const shadow = island instanceof HTMLElement ? island.shadowRoot : null;

    const hover = ownerDocument.querySelector("[data-mesurer-hover-measurement='true']")
      ?? shadow?.querySelector("[data-mesurer-hover-measurement='true']")
      ?? null;

    if (!(hover instanceof HTMLElement)) return null;

    const describe = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      const root = element.getRootNode();
      const rect = element.getBoundingClientRect();

      return {
        hover: element.dataset.mesurerHoverMeasurement ?? null,
        documentHoverLayer: element.dataset.mesurerDocumentHoverLayer ?? null,
        annotationPanel: element.dataset.mesurerAnnotationPanel ?? null,
        annotationComposer: element.dataset.mesurerAnnotationComposer ?? null,
        root: root === ownerDocument ? "document" : root instanceof ShadowRoot ? "shadow" : "other",
        directBodyChild: element.parentElement === ownerDocument.body,
        position: style.position,
        zIndex: style.zIndex,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    };

    // The browser top layer outranks the ordinary document regardless of
    // numeric z-index. For this paint-order probe, neutralize unrelated
    // top-layer hit surfaces while keeping the real hover box hit-testable.
    // A hover box that still belongs to the top layer will beat the document
    // card; a body-portaled evidence box will lose to the higher Context card.
    const suppressed = [];

    if (island instanceof HTMLElement) suppressed.push(island, ...island.querySelectorAll("*"));

    if (shadow) suppressed.push(...shadow.querySelectorAll("*"));
    const htmlSurfaces = suppressed.filter((element) => element instanceof HTMLElement);
    const original = htmlSurfaces.map((element) => [element, element.getAttribute("style")]);

    for (const element of htmlSurfaces) element.style.setProperty("pointer-events", "none", "important");

    const hoverStyle = hover.getAttribute("style");
    hover.style.setProperty("pointer-events", "auto", "important");
    const hit = ownerDocument.elementFromPoint(point.x, point.y);
    const cardWins = Boolean(hit && (hit === card || card.contains(hit)));

    const value = {
      cardWins,
      hit: describe(hit),
      hover: describe(hover),
      islandTopLayer: island instanceof HTMLElement ? island.matches(":popover-open") : false,
    };

    if (hoverStyle === null) hover.removeAttribute("style");
    else hover.setAttribute("style", hoverStyle);

    for (const [element, style] of original) {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }

    return value;
  }, probe);

  assert(result, `${label}: could not resolve hover/card paint ownership`);
  assert.equal(
    result.hover.documentHoverLayer,
    "true",
    `${label}: real Select hover must enter the Context document evidence plane: ${JSON.stringify(result)}`,
  );
  assert.equal(result.hover.root, "document", `${label}: hover must not remain in the top-layer renderer`);
  assert.equal(result.hover.directBodyChild, true, `${label}: hover evidence must portal directly to body`);
  assert.equal(result.hover.zIndex, "2147482700", `${label}: hover must use the lower document evidence tier`);
  assert.equal(
    result.cardWins,
    true,
    `${label} must occlude the real Select hover fill/border at their overlap: ${JSON.stringify(result)}`,
  );

  await removeProbe();

  return result;
};

try {
  const composerTopology = await prepareFixture();
  let contextRoot = page.locator("[data-mesurer-context-root='true']");
  let trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  let composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await clickDocumentUi(trigger, "Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  const composerOwnership = await assertSurfaceOccludesHover(composer, "new annotation composer");

  // A fresh page state keeps the saved-card proof independent from the overlap
  // probe above. Seed the note before introducing any synthetic hover target so
  // this gate tests paint ownership, while existing Context contracts continue
  // to own physical annotation hit-testing and save behavior.
  await removeProbe();
  const panelTopology = await prepareFixture();
  contextRoot = page.locator("[data-mesurer-context-root='true']");
  trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await clickDocumentUi(trigger, "Add Note trigger for saved-card state");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  const textarea = composer.locator("textarea");
  await textarea.fill("Context hover occlusion contract", { force: true });
  await textarea.press("Control+Enter");
  await composer.waitFor({ state: "hidden", timeout: 3000 });

  const panel = contextRoot.locator("[data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible", timeout: 3000 });
  const panelOwnership = await assertSurfaceOccludesHover(panel, "saved annotation panel");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Top-layer Context hover occlusion: PASS", {
    composerTopology,
    panelTopology,
    composerHover: composerOwnership.hover,
    panelHover: panelOwnership.hover,
  });
} finally {
  await removeProbe().catch(() => {});
  await browser.close();
}
