import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const waitFrames = (count = 2) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}, count);

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__));
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");

    return Boolean(island?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"));
  });

  await page.evaluate(() => window.__MESURER__.command("builtin.select"));

  const hoverTargetBox = await page.evaluate(() => {
    const target = document.createElement("div");
    target.dataset.testid = "mesurer-hover-contract-target";
    Object.assign(target.style, {
      position: "fixed",
      right: "24px",
      bottom: "24px",
      width: "120px",
      height: "80px",
      background: "transparent",
      pointerEvents: "auto",
    });
    document.body.append(target);
    const rect = target.getBoundingClientRect();

    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  const hoverX = hoverTargetBox.x + hoverTargetBox.width / 2;
  const hoverY = hoverTargetBox.y + hoverTargetBox.height / 2;

  // Without a document-backed inspector owner, ordinary Select hover keeps the
  // hardened top-layer ownership. This packed Solid 2 host explicitly loads the
  // Context plugin, whose stable document mount owns page evidence from startup;
  // in that case hover must already share the document paint plane so a later
  // annotation card can occlude it without a timing-dependent portal handoff.
  await page.mouse.move(hoverX, hoverY);
  await waitFrames(2);

  const ordinaryHover = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const bodyHover = document.body.querySelector("[data-mesurer-hover-measurement='true']");
    const shadowHover = island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']") ?? null;

    const contextDocumentMount = document.querySelector(
      "[data-mesurer-document-inspector-mount='true'][data-mesurer-context-root='true']",
    );

    return {
      contextDocumentMount: contextDocumentMount instanceof HTMLElement,
      bodyHover: bodyHover instanceof HTMLElement,
      shadowHover: shadowHover instanceof HTMLElement,
      bodyHoverLayer: bodyHover instanceof HTMLElement
        ? bodyHover.dataset.mesurerDocumentHoverLayer ?? null
        : null,
      bodyHoverZIndex: bodyHover instanceof HTMLElement ? getComputedStyle(bodyHover).zIndex : null,
    };
  });

  if (ordinaryHover.contextDocumentMount) {
    if (!ordinaryHover.bodyHover
      || ordinaryHover.shadowHover
      || ordinaryHover.bodyHoverLayer !== "true"
      || ordinaryHover.bodyHoverZIndex !== "2147482700") {
      throw new Error(`Context-owned Select hover did not use the document evidence layer: ${JSON.stringify(ordinaryHover)}`);
    }
  } else if (ordinaryHover.bodyHover || !ordinaryHover.shadowHover) {
    throw new Error(`Ordinary Select hover left the protected top-layer island without a document inspector: ${JSON.stringify(ordinaryHover)}`);
  }

  const editTarget = page.locator("[data-testid='consumer-sibling']");
  const editBox = await editTarget.boundingBox();

  if (!editBox) throw new Error("Packed Solid 2 direct-edit target has no bounding box");
  const editX = editBox.x + editBox.width / 2;
  const editY = editBox.y + editBox.height / 2;

  // Keep Select logically selected when direct edit begins. Direct edit owns the
  // visible border, while selection remains available to the rest of Mesurer.
  await page.mouse.move(editX, editY);
  await page.mouse.click(editX, editY);
  await page.waitForFunction(() => Boolean(
    document.body.querySelector("[data-mesurer-selected-measurement='true']"),
  ));

  const editMode = page.locator("button[data-mesurer-toolbar-mode='edit']");
  await editMode.click();
  await page.locator("[data-mesurer-toolbar='true'][data-mesurer-toolbar-mode='edit']").waitFor({ state: "visible" });

  await page.mouse.dblclick(editX, editY);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible", timeout: 5000 });
  await inspector.waitFor({ state: "visible", timeout: 5000 });
  await waitFrames(2);

  // The original bug was an ownership-layer race. The document-backed text
  // runtime could hide the selected MeasurementBox that had already portaled to
  // <body>, but a replacement/stale root still in the isolated ShadowRoot was
  // outside that search. Recreate that exact handoff deterministically while the
  // editor is active: a selected root appearing in either layer must be
  // paintless before the next rendered frame, without being removed.
  const ownershipProbe = await page.evaluate(async () => {
    const island = document.querySelector("[data-mesurer-island='true']");

    if (!(island instanceof HTMLElement) || !island.shadowRoot) return null;

    const stale = document.createElement("div");
    stale.dataset.mesurerSelectedMeasurement = "true";
    stale.dataset.mesurerGhostOwnershipProbe = "true";
    Object.assign(stale.style, {
      position: "fixed",
      left: "124px",
      top: "270px",
      width: "440px",
      height: "50px",
      opacity: "0.82",
      pointerEvents: "none",
      background: "rgba(76, 136, 232, 0.08)",
      border: "1px solid rgb(76, 136, 232)",
    });
    island.shadowRoot.append(stale);

    await new Promise((resolve) => queueMicrotask(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bodySelections = Array.from(
      document.body.querySelectorAll("[data-mesurer-selected-measurement='true']"),
    ).map((element) => ({
      opacity: getComputedStyle(element).opacity,
      suppressed: element.getAttribute("data-mesurer-direct-edit-selection-suppressed"),
    }));

    const result = {
      sourceConnected: stale.isConnected,
      sourceOpacity: getComputedStyle(stale).opacity,
      sourceSuppressed: stale.getAttribute("data-mesurer-direct-edit-selection-suppressed"),
      bodySelections,
    };

    stale.remove();

    return result;
  });

  if (!ownershipProbe) throw new Error("Could not create isolated selection ownership probe");

  if (!ownershipProbe.sourceConnected
    || ownershipProbe.sourceOpacity !== "0"
    || ownershipProbe.sourceSuppressed !== "true") {
    throw new Error(`Isolated selected chrome can still paint during direct edit: ${JSON.stringify(ownershipProbe)}`);
  }

  if (!ownershipProbe.bodySelections.length
    || ownershipProbe.bodySelections.some((entry) => entry.opacity !== "0" || entry.suppressed !== "true")) {
    throw new Error(`Document selected chrome can still paint during direct edit: ${JSON.stringify(ownershipProbe)}`);
  }

  // Edit is now a distinct interaction mode. Moving over another page target
  // must not resurrect Select hover chrome while a direct edit is active.
  await page.mouse.move(hoverX, hoverY);
  await waitFrames(2);

  const result = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");

    return {
      editorActive: document.querySelector("[data-mesurer-text-editor='true']") instanceof HTMLElement,
      bodyHover: document.body.querySelector("[data-mesurer-hover-measurement='true']") instanceof HTMLElement,
      shadowHover: island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']") instanceof HTMLElement,
    };
  });

  await page.evaluate(() => {
    document.querySelector("[data-testid='mesurer-hover-contract-target']")?.remove();
  });

  if (!result.editorActive) {
    throw new Error(`Moving across the page closed direct text editing: ${JSON.stringify(result)}`);
  }

  if (result.bodyHover || result.shadowHover) {
    throw new Error(`Edit mode leaked Select hover chrome: ${JSON.stringify(result)}`);
  }

  console.log("Packed Solid 2 Typography/selection ownership: PASS", {
    ordinaryHover,
    ownershipProbe,
    ...result,
  });
} finally {
  await page.close();
  await browser.close();
}
