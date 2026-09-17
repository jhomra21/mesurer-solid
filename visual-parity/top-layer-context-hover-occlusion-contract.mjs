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

const assertOccludesHover = async (surface, label) => {
  await surface.waitFor({ state: "visible", timeout: 3000 });
  const surfaceBox = await surface.boundingBox();
  assert(surfaceBox, `${label} must have rendered geometry`);

  const probe = await page.evaluate((box) => {
    document.querySelector("#mesurer-context-hover-occlusion-probe")?.remove();
    const edgeX = box.x + box.width / 2;
    const pointerX = Math.max(6, box.x - 36);
    const element = document.createElement("div");
    element.id = "mesurer-context-hover-occlusion-probe";
    Object.assign(element.style, {
      position: "fixed",
      left: "0px",
      top: `${Math.max(0, box.y - 28)}px`,
      width: `${edgeX}px`,
      height: `${Math.min(innerHeight, box.y + box.height + 28) - Math.max(0, box.y - 28)}px`,
      background: "transparent",
      pointerEvents: "auto",
      zIndex: "0",
    });
    document.body.append(element);
    return {
      edgeX,
      probeY: box.y + box.height / 2,
      pointerX,
      pointerY: box.y + box.height / 2,
    };
  }, surfaceBox);

  await page.mouse.move(probe.pointerX, probe.pointerY);
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-hover-measurement='true']")
      || document.querySelector("[data-mesurer-island='true']")?.shadowRoot
        ?.querySelector("[data-mesurer-hover-measurement='true']"),
  ));
  await settle();

  const hover = page.locator("[data-mesurer-hover-measurement='true']").first();
  await hover.waitFor({ state: "visible", timeout: 3000 });
  const result = await surface.evaluate((card, point) => {
    const ownerDocument = card.ownerDocument;
    const island = ownerDocument.querySelector("[data-mesurer-island='true']");
    const shadow = island instanceof HTMLElement ? island.shadowRoot : null;
    const documentHover = ownerDocument.querySelector("[data-mesurer-hover-measurement='true']");
    const shadowHover = shadow?.querySelector("[data-mesurer-hover-measurement='true']") ?? null;
    const hoverElement = documentHover ?? shadowHover;
    if (!(hoverElement instanceof HTMLElement)) return null;

    const describe = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      const root = element.getRootNode();
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        id: element.id || null,
        annotationPanel: element.dataset.mesurerAnnotationPanel ?? null,
        annotationComposer: element.dataset.mesurerAnnotationComposer ?? null,
        hover: element.dataset.mesurerHoverMeasurement ?? null,
        measurementChrome: element.dataset.mesurerMeasurementChrome ?? null,
        selectedMeasurement: element.dataset.mesurerSelectedMeasurement ?? null,
        documentHoverLayer: element.dataset.mesurerDocumentHoverLayer ?? null,
        root: root === ownerDocument ? "document" : root instanceof ShadowRoot ? "shadow" : "other",
        directBodyChild: element.parentElement === ownerDocument.body,
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    };

    const allBlueSurfaces = [
      ...ownerDocument.querySelectorAll("[data-mesurer-hover-measurement='true'], [data-mesurer-measurement-chrome='true'], [data-mesurer-annotation-target-highlight='true']"),
      ...(shadow ? [...shadow.querySelectorAll("[data-mesurer-hover-measurement='true'], [data-mesurer-measurement-chrome='true'], [data-mesurer-annotation-target-highlight='true']")] : []),
    ].map(describe);

    // elementFromPoint is used only as a paint-order probe here. Neutralize the
    // top-layer renderer's unrelated full-viewport hit surfaces while leaving
    // the real hover box opt-in hit-testable. If hover is still owned by the
    // top layer it will beat the document card; if hover has moved to the
    // document evidence plane, the higher Context card will win.
    const suppressed = island instanceof HTMLElement
      ? [island, ...island.querySelectorAll("*")].filter((element) => element instanceof HTMLElement)
      : [];
    if (shadow) {
      suppressed.push(...[...shadow.querySelectorAll("*")].filter((element) => element instanceof HTMLElement));
    }
    const originalStyles = suppressed.map((element) => [element, element.getAttribute("style")]);
    for (const element of suppressed) element.style.setProperty("pointer-events", "none", "important");
    const hoverStyle = hoverElement.getAttribute("style");
    hoverElement.style.setProperty("pointer-events", "auto", "important");

    const hit = ownerDocument.elementFromPoint(point.edgeX - 0.5, point.probeY);
    const cardWins = Boolean(hit && (hit === card || card.contains(hit)));
    const value = {
      cardWins,
      hit: describe(hit),
      hover: describe(hoverElement),
      islandTopLayer: island instanceof HTMLElement ? island.matches(":popover-open") : false,
      blueSurfaces: allBlueSurfaces,
    };

    if (hoverStyle === null) hoverElement.removeAttribute("style");
    else hoverElement.setAttribute("style", hoverStyle);
    for (const [element, style] of originalStyles) {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }
    return value;
  }, probe);

  assert(result, `${label}: could not resolve hover/card paint ownership`);
  assert.equal(
    result.cardWins,
    true,
    `${label} must occlude Select hover fill/border at the overlap point: ${JSON.stringify(result)}`,
  );
  assert.equal(
    result.hover.documentHoverLayer,
    "true",
    `${label}: Select hover must use the document evidence layer while Context is active: ${JSON.stringify(result)}`,
  );
  assert.equal(result.hover.root, "document", `${label}: hover must not remain in an isolated/top-layer shadow root`);
  assert.equal(result.hover.directBodyChild, true, `${label}: document hover must portal directly to body`);

  await removeProbe();
  return result;
};

try {
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
  assert.equal(topology.hostLayer, "top-layer", `contract must exercise top-layer hosting: ${JSON.stringify(topology)}`);
  assert.equal(topology.isolated, false, `contract must exercise a non-isolated top-layer renderer: ${JSON.stringify(topology)}`);
  assert.equal(topology.islandTopLayer, true, `top-layer host must be open: ${JSON.stringify(topology)}`);
  assert.equal(topology.contextMounts, 1, "Context must own one document inspector mount");

  await page.evaluate(async () => {
    const subject = window.__MESURER_TOP_LAYER_CONTEXT_TEST__?.subject;
    if (!subject) throw new Error("Expected top-layer Context test subject");
    await subject.select("#top-layer-context-target");
  });
  await settle();

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await clickDocumentUi(trigger, "Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });

  const composerOwnership = await assertOccludesHover(composer, "new annotation composer");

  await removeProbe();
  const textarea = composer.locator("textarea");
  await clickDocumentUi(textarea, "annotation textarea");
  await textarea.fill("Context hover occlusion contract");
  await clickDocumentUi(composer.getByRole("button", { name: "Add note", exact: true }), "Add note submit");
  await composer.waitFor({ state: "hidden" });

  const panel = contextRoot.locator("[data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible", timeout: 3000 });
  const panelOwnership = await assertOccludesHover(panel, "saved annotation panel");

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Top-layer Context hover occlusion: PASS", {
    topology,
    composerHover: composerOwnership.hover,
    panelHover: panelOwnership.hover,
  });
} finally {
  await removeProbe().catch(() => {});
  await browser.close();
}
