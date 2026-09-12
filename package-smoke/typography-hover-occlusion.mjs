import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const waitFrames = (count = 2) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}, count);

const sameBox = (left, right, tolerance = 2) => ["x", "y", "width", "height"]
  .every((key) => Math.abs(left[key] - right[key]) <= tolerance);

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

  // Match the manual failure more closely: keep the edited text onscreen while
  // the page already has a non-zero document scroll offset. The rejected manual
  // screenshot showed the ghost displaced by approximately scrollY.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.testid = "mesurer-ghost-scroll-spacer";
    spacer.style.height = "260px";
    document.querySelector("#root")?.before(spacer);
    document.body.style.minHeight = "1800px";
    window.scrollTo(0, 234);
  });
  await waitFrames(2);

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

  // Before direct editing begins, ordinary Select hover must keep the original
  // hardened top-layer ownership. The document portal is only for the active
  // Typography overlap case, not a global change to Select hover semantics.
  await page.mouse.move(hoverX, hoverY);
  await waitFrames(2);
  const ordinaryHover = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return {
      bodyHover: Boolean(document.body.querySelector("[data-mesurer-hover-measurement='true']")),
      shadowHover: Boolean(island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']")),
    };
  });
  if (ordinaryHover.bodyHover || !ordinaryHover.shadowHover) {
    throw new Error(`Ordinary Select hover left the protected top-layer island: ${JSON.stringify(ordinaryHover)}`);
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

  // Reproduce the newly reported path with real pointer input: while the child
  // editor remains active, overwrite Select with its parent, move back over the
  // edited child, and select the child again. The hover rectangle for the edited
  // or currently selected target is redundant with the edit ring and must never
  // become a second paintable 1:1 copy.
  const parentPoint = await editTarget.evaluate((element) => {
    const parent = element.parentElement;
    if (!(parent instanceof HTMLElement)) return null;
    const rect = parent.getBoundingClientRect();
    return {
      x: rect.left + 4,
      y: rect.top + 4,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
  if (!parentPoint) throw new Error("Packed Solid 2 edit target has no selectable parent");

  await page.mouse.move(parentPoint.x, parentPoint.y);
  await page.mouse.click(parentPoint.x, parentPoint.y);
  await waitFrames(2);
  if (await editor.count() !== 1) throw new Error("Selecting the parent closed direct editing");

  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  const parentSelectedBox = await selectedChrome.boundingBox();
  if (!parentSelectedBox || !sameBox(parentSelectedBox, parentPoint.rect, 3)) {
    throw new Error(`Parent selection did not replace the child selection: ${JSON.stringify({ parentSelectedBox, parent: parentPoint.rect })}`);
  }

  await page.mouse.move(editX, editY);
  await waitFrames(2);

  const readReselectionState = () => page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const read = (element, layer, kind) => {
      const rect = element.getBoundingClientRect();
      return {
        layer,
        kind,
        opacity: getComputedStyle(element).opacity,
        selectionSuppressed: element.getAttribute("data-mesurer-direct-edit-selection-suppressed"),
        hoverSuppressed: element.getAttribute("data-mesurer-direct-edit-hover-suppressed"),
        nativeAnchor: element.getAttribute("data-mesurer-native-scroll-anchor"),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    };
    const bodySelections = Array.from(document.body.querySelectorAll("[data-mesurer-selected-measurement='true']"))
      .map((element) => read(element, "document", "selection"));
    const bodyHovers = Array.from(document.body.querySelectorAll("[data-mesurer-hover-measurement='true']"))
      .map((element) => read(element, "document", "hover"));
    const shadowSelections = island?.shadowRoot
      ? Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-selected-measurement='true']")).map((element) => read(element, "shadow", "selection"))
      : [];
    const shadowHovers = island?.shadowRoot
      ? Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-hover-measurement='true']")).map((element) => read(element, "shadow", "hover"))
      : [];
    const target = document.querySelector("[data-testid='consumer-sibling']");
    const ring = document.querySelector("[data-mesurer-text-edit-ring='true']");
    const targetRect = target?.getBoundingClientRect();
    const ringRect = ring?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      editorActive: Boolean(document.querySelector("[data-mesurer-text-editor='true']")),
      target: targetRect ? { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height } : null,
      ring: ringRect ? { x: ringRect.x, y: ringRect.y, width: ringRect.width, height: ringRect.height } : null,
      surfaces: [...bodySelections, ...shadowSelections, ...bodyHovers, ...shadowHovers],
    };
  });

  const beforeReselect = await readReselectionState();
  const visibleBeforeReselect = beforeReselect.surfaces.filter((surface) => Number(surface.opacity) > 0.01);
  if (visibleBeforeReselect.some((surface) => surface.kind === "selection" || surface.kind === "hover")) {
    throw new Error(`Edited child exposed duplicate chrome while parent remained selected: ${JSON.stringify(beforeReselect)}`);
  }
  if (!beforeReselect.editorActive || !beforeReselect.target || !beforeReselect.ring || !sameBox(beforeReselect.target, beforeReselect.ring, 2)) {
    throw new Error(`Direct-edit ring lost its source during parent overwrite: ${JSON.stringify(beforeReselect)}`);
  }

  await page.mouse.click(editX, editY);
  await waitFrames(2);
  const afterReselect = await readReselectionState();
  const childSelectedBox = await selectedChrome.boundingBox();
  if (!childSelectedBox || !sameBox(childSelectedBox, afterReselect.target, 3)) {
    throw new Error(`Child reselection did not restore the original target selection: ${JSON.stringify({ childSelectedBox, state: afterReselect })}`);
  }
  const visibleAfterReselect = afterReselect.surfaces.filter((surface) => Number(surface.opacity) > 0.01);
  if (visibleAfterReselect.some((surface) => surface.kind === "selection" || surface.kind === "hover")) {
    throw new Error(`Child reselection exposed duplicate direct-edit chrome: ${JSON.stringify(afterReselect)}`);
  }

  // The first movement can be the event that clears document-UI passthrough
  // after leaving the Typography card. A second real pointer movement exercises
  // the same path a user naturally produces while moving onto a nearby element.
  await page.mouse.move(hoverX, hoverY);
  await waitFrames(1);
  await page.mouse.move(hoverX + 1, hoverY);

  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(
      document.body.querySelector("[data-mesurer-hover-measurement='true']")
      || island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']"),
    );
  }, undefined, { timeout: 5000 });
  await waitFrames(2);

  const result = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    const bodyHover = document.body.querySelector("[data-mesurer-hover-measurement='true']");
    const shadowHover = island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']") ?? null;
    const hover = bodyHover ?? shadowHover;
    const activeEditor = document.querySelector("[data-mesurer-text-editor='true']");
    if (!(island instanceof HTMLElement) || !(card instanceof HTMLElement) || !(hover instanceof HTMLElement)) return null;

    const beforeHoverStyle = hover.getAttribute("style");
    const beforeIslandStyle = island.getAttribute("style");
    const cardRect = card.getBoundingClientRect();
    hover.style.setProperty("position", "fixed", "important");
    hover.style.setProperty("left", `${cardRect.left}px`, "important");
    hover.style.setProperty("top", `${cardRect.top}px`, "important");
    hover.style.setProperty("width", `${cardRect.width}px`, "important");
    hover.style.setProperty("height", `${cardRect.height}px`, "important");
    hover.style.setProperty("pointer-events", "auto", "important");

    // The protected island intentionally owns hit testing while Select is active.
    // Hide only that hit plane synchronously so elementFromPoint can answer the
    // separate question this regression cares about: which document-backed
    // surface paints on top once hover and Typography geometrically overlap?
    island.style.setProperty("display", "none", "important");

    const x = cardRect.left + cardRect.width / 2;
    const y = cardRect.top + Math.min(cardRect.height / 2, 24);
    const hit = document.elementFromPoint(x, y);
    const placementShell = card.closest("[data-mesurer-text-inspector-placement-shell='true']");
    const value = {
      islandTopLayer: island.matches(":popover-open"),
      hoverDocumentBacked: hover.getRootNode() === document,
      documentHoverLayer: hover.getAttribute("data-mesurer-document-hover-layer"),
      hitInsideTypography: hit instanceof Element && card.contains(hit),
      editorActive: activeEditor instanceof HTMLElement,
      hoverZIndex: getComputedStyle(hover).zIndex,
      inspectorZIndex: placementShell instanceof HTMLElement ? getComputedStyle(placementShell).zIndex : null,
    };

    if (beforeIslandStyle === null) island.removeAttribute("style");
    else island.setAttribute("style", beforeIslandStyle);
    if (beforeHoverStyle === null) hover.removeAttribute("style");
    else hover.setAttribute("style", beforeHoverStyle);
    document.querySelector("[data-testid='mesurer-hover-contract-target']")?.remove();
    return value;
  });

  if (!result) throw new Error("Could not resolve Typography/hover paint surfaces");
  if (!result.islandTopLayer) {
    throw new Error(`Regression did not exercise the protected top-layer mount: ${JSON.stringify(result)}`);
  }
  if (!result.hoverDocumentBacked || result.documentHoverLayer !== "true") {
    throw new Error(`Select hover chrome did not enter the scoped Typography document layer: ${JSON.stringify(result)}`);
  }
  if (!result.hitInsideTypography) {
    throw new Error(`Select hover chrome painted above the active Typography inspector: ${JSON.stringify(result)}`);
  }
  if (!result.editorActive) {
    throw new Error(`Hovering a nearby page element closed direct text editing: ${JSON.stringify(result)}`);
  }

  console.log("Packed Solid 2 Typography/selection ownership: PASS", {
    ordinaryHover,
    ownershipProbe,
    beforeReselect,
    afterReselect,
    ...result,
  });
} finally {
  await page.close();
  await browser.close();
}
