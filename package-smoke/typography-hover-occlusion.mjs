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

  // Make the reported failure deterministic: Select the text target and leave
  // its live hover rectangle on that same element before direct editing starts.
  await page.mouse.move(editX, editY);
  await waitFrames(2);
  await page.mouse.click(editX, editY);
  await page.waitForFunction(() => Boolean(
    document.body.querySelector("[data-mesurer-selected-measurement='true']"),
  ));
  await waitFrames(1);

  const sameTargetHoverBefore = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const target = document.querySelector("[data-testid='consumer-sibling']");
    if (!(target instanceof HTMLElement)) return null;
    const targetRect = target.getBoundingClientRect();
    const candidates = [
      ...document.body.querySelectorAll("[data-mesurer-hover-measurement='true']"),
      ...(island?.shadowRoot?.querySelectorAll("[data-mesurer-hover-measurement='true']") ?? []),
    ];
    return candidates.map((node) => {
      const element = node;
      const rect = element.getBoundingClientRect();
      return {
        sameTarget: Math.abs(rect.left - targetRect.left) <= 2
          && Math.abs(rect.top - targetRect.top) <= 2
          && Math.abs(rect.width - targetRect.width) <= 2
          && Math.abs(rect.height - targetRect.height) <= 2,
        opacity: getComputedStyle(element).opacity,
        root: element.getRootNode() === document ? "document" : "shadow",
      };
    });
  });
  if (!sameTargetHoverBefore?.some((entry) => entry.sameTarget && entry.opacity !== "0")) {
    throw new Error(`Regression setup did not leave visible Select hover on the edit target: ${JSON.stringify(sameTargetHoverBefore)}`);
  }

  await page.mouse.dblclick(editX, editY);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  const editRing = page.locator("[data-mesurer-text-edit-ring='true']");
  await editor.waitFor({ state: "visible", timeout: 5000 });
  await inspector.waitFor({ state: "visible", timeout: 5000 });
  await editRing.waitFor({ state: "visible", timeout: 5000 });
  await waitFrames(2);

  // Chromium's synthesized double-click may clear the hover node entirely.
  // Recreate the real manual condition after the editor is active: Select stays
  // on and the pointer moves by one pixel over the same edited element. This
  // must create a live same-target hover node without letting it paint.
  await page.mouse.move(editX + 1, editY);
  await waitFrames(2);
  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    return Boolean(
      document.body.querySelector("[data-mesurer-hover-measurement='true']")
      || island?.shadowRoot?.querySelector("[data-mesurer-hover-measurement='true']"),
    );
  }, undefined, { timeout: 5000 });

  // Direct edit must be the sole visible owner for the edited element. The
  // normal selected MeasurementBox and the live same-target Select hover may
  // stay mounted/anchored, but neither is allowed to paint another blue box.
  const directEditOwnership = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const target = document.querySelector("[data-testid='consumer-sibling']");
    const ring = document.querySelector("[data-mesurer-text-edit-ring='true']");
    if (!(target instanceof HTMLElement) || !(ring instanceof HTMLElement)) return null;
    const targetRect = target.getBoundingClientRect();
    const sameRect = (rect) => Math.abs(rect.left - targetRect.left) <= 2
      && Math.abs(rect.top - targetRect.top) <= 2
      && Math.abs(rect.width - targetRect.width) <= 2
      && Math.abs(rect.height - targetRect.height) <= 2;
    const hovers = [
      ...document.body.querySelectorAll("[data-mesurer-hover-measurement='true']"),
      ...(island?.shadowRoot?.querySelectorAll("[data-mesurer-hover-measurement='true']") ?? []),
    ].map((node) => {
      const element = node;
      return {
        sameTarget: sameRect(element.getBoundingClientRect()),
        opacity: getComputedStyle(element).opacity,
        suppressed: element.getAttribute("data-mesurer-direct-edit-hover-suppressed"),
        root: element.getRootNode() === document ? "document" : "shadow",
      };
    });
    const selected = Array.from(document.body.querySelectorAll("[data-mesurer-selected-measurement='true']")).map((element) => ({
      opacity: getComputedStyle(element).opacity,
      suppressed: element.getAttribute("data-mesurer-direct-edit-selection-suppressed"),
    }));
    return {
      hovers,
      selected,
      ringMatchesTarget: sameRect(ring.getBoundingClientRect()),
      ringOpacity: getComputedStyle(ring).opacity,
    };
  });
  if (!directEditOwnership) throw new Error("Could not resolve packed direct-edit chrome ownership");
  const sameTargetHovers = directEditOwnership.hovers.filter((entry) => entry.sameTarget);
  if (!sameTargetHovers.length) {
    throw new Error(`Packed regression did not create same-target Select hover during active edit: ${JSON.stringify(directEditOwnership)}`);
  }
  if (sameTargetHovers.some((entry) => entry.opacity !== "0" || entry.suppressed !== "true")) {
    throw new Error(`Same-target Select hover can still paint beside the direct-edit ring: ${JSON.stringify(directEditOwnership)}`);
  }
  if (!directEditOwnership.selected.length || directEditOwnership.selected.some((entry) => entry.opacity !== "0" || entry.suppressed !== "true")) {
    throw new Error(`Ordinary selected MeasurementBox can still paint during direct edit: ${JSON.stringify(directEditOwnership)}`);
  }
  if (!directEditOwnership.ringMatchesTarget || directEditOwnership.ringOpacity === "0") {
    throw new Error(`Direct-edit ring did not remain the visible target owner: ${JSON.stringify(directEditOwnership)}`);
  }

  // Moving to a different page element must restore normal Select hover while
  // editing continues. This preserves the beta.9 behavior the manual test
  // already accepted; only redundant same-target hover is suppressed.
  await page.mouse.move(hoverX, hoverY);
  await waitFrames(1);
  await page.mouse.move(hoverX + 1, hoverY);

  await page.waitForFunction(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const candidates = [
      ...document.body.querySelectorAll("[data-mesurer-hover-measurement='true']"),
      ...(island?.shadowRoot?.querySelectorAll("[data-mesurer-hover-measurement='true']") ?? []),
    ];
    return candidates.some((node) => getComputedStyle(node).opacity !== "0");
  }, undefined, { timeout: 5000 });
  await waitFrames(2);

  const result = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    const candidates = [
      ...document.body.querySelectorAll("[data-mesurer-hover-measurement='true']"),
      ...(island?.shadowRoot?.querySelectorAll("[data-mesurer-hover-measurement='true']") ?? []),
    ];
    const hover = candidates.find((node) => getComputedStyle(node).opacity !== "0") ?? null;
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
      hoverSuppressed: hover.getAttribute("data-mesurer-direct-edit-hover-suppressed"),
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
    throw new Error(`Different-target Select hover did not enter the scoped Typography document layer: ${JSON.stringify(result)}`);
  }
  if (result.hoverSuppressed !== null) {
    throw new Error(`Different-target Select hover stayed suppressed during direct edit: ${JSON.stringify(result)}`);
  }
  if (!result.hitInsideTypography) {
    throw new Error(`Select hover chrome painted above the active Typography inspector: ${JSON.stringify(result)}`);
  }
  if (!result.editorActive) {
    throw new Error(`Hovering a nearby page element closed direct text editing: ${JSON.stringify(result)}`);
  }

  console.log("Packed Solid 2 direct-edit/Select hover ownership: PASS", {
    ordinaryHover,
    sameTargetHoverBefore,
    directEditOwnership,
    ...result,
  });
} finally {
  await page.close();
  await browser.close();
}