import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ANNOTATION_OWNERSHIP_URL ?? "http://127.0.0.1:4174/self-hosting.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickByCoordinates = async (locator, stage) => {
  const box = await locator.boundingBox();
  assert(box, `${stage}: expected rendered geometry`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_SELF_HOSTING__?.subject));

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.subject.select("[data-self-host-target]");
  });
  await settle();

  const trigger = page.locator(
    "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
  );
  await trigger.waitFor({ state: "visible" });

  const topology = await trigger.evaluate((element) => {
    const contextRoot = element.closest("[data-mesurer-context-root='true']");
    const rendererRoot = contextRoot?.closest("[data-mesurer-root='true']");
    return {
      contextInsideCanonicalRoot: Boolean(
        contextRoot && rendererRoot && rendererRoot.contains(contextRoot),
      ),
      documentContextLayers: document.querySelectorAll(
        "[data-mesurer-context-document-layer='true']",
      ).length,
      documentInspectorRuntimes: document.querySelectorAll(
        "[data-mesurer-document-inspector-runtime='true']",
      ).length,
    };
  });
  assert.deepEqual(topology, {
    contextInsideCanonicalRoot: true,
    documentContextLayers: 0,
    documentInspectorRuntimes: 0,
  }, `Context surfaces must be owned only by the canonical renderer root: ${JSON.stringify(topology)}`);

  await clickByCoordinates(trigger, "annotation trigger");

  const composer = page.locator(
    "[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']",
  );
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Unsaved note bound to the first selection");

  // Canonical-root Context UI must keep protected paint ownership above live
  // page hover/selection chrome. This self-hosting fixture is intentionally
  // non-isolated, so both the canonical renderer root and page chrome belong to
  // the document paint tree even though Context no longer uses a body portal.
  const hoverTarget = page.locator(".fixture-copy h1");
  const hoverBox = await hoverTarget.boundingBox();
  assert(hoverBox, "hover target must have rendered geometry");
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
  console.log("Annotation ownership stage: waiting for document-owned hover chrome");
  await page.waitForFunction(() => {
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");
    return hover instanceof HTMLElement && hover.getRootNode() === document;
  });
  console.log("Annotation ownership stage: document-owned hover chrome ready");

  const ownership = await page.evaluate(() => {
    const card = document.querySelector(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']",
    );
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");
    const selection = document.querySelector(
      "body > [data-mesurer-selected-measurement='true'] > [data-mesurer-measurement-chrome='true']",
    );
    if (!(card instanceof HTMLElement) || !(hover instanceof HTMLElement)) {
      throw new Error("Missing annotation card or document hover chrome");
    }
    const contextRoot = card.closest("[data-mesurer-context-root='true']");
    const rendererRoot = contextRoot?.closest("[data-mesurer-root='true']");
    const cardZText = getComputedStyle(card).zIndex;
    const hoverZText = getComputedStyle(hover).zIndex;
    const selectionZText = selection instanceof HTMLElement ? getComputedStyle(selection).zIndex : null;
    const numericZ = (value) => value && value !== "auto" ? Number.parseInt(value, 10) : null;
    return {
      cardZ: numericZ(cardZText),
      cardZText,
      hoverZ: numericZ(hoverZText),
      hoverZText,
      selectionZ: numericZ(selectionZText),
      selectionZText,
      cardInsideCanonicalRoot: Boolean(
        contextRoot && rendererRoot && rendererRoot.contains(contextRoot),
      ),
      hoverRootIsDocument: hover.getRootNode() === document,
      hoverDocumentLayer: hover.dataset.mesurerDocumentHoverLayer === "true",
    };
  });
  assert.equal(
    ownership.cardInsideCanonicalRoot,
    true,
    "annotation composer must remain inside the canonical Mesurer root",
  );
  assert.equal(
    ownership.hoverRootIsDocument,
    true,
    "self-hosting hover chrome must be document-owned in this non-isolated fixture",
  );
  assert.notEqual(
    ownership.cardZ,
    null,
    `annotation card must own an explicit protected z-index, got ${ownership.cardZText}`,
  );
  if (ownership.hoverZ !== null) {
    assert(
      ownership.cardZ > ownership.hoverZ,
      `annotation card z-index ${ownership.cardZ} must beat hover ${ownership.hoverZ}`,
    );
  } else {
    assert.equal(
      ownership.hoverZText,
      "auto",
      `direct document hover must either use a numeric protected tier or normal auto stacking, got ${ownership.hoverZText}`,
    );
  }
  if (ownership.selectionZ !== null) {
    assert(
      ownership.cardZ > ownership.selectionZ,
      `annotation card z-index ${ownership.cardZ} must beat selection ${ownership.selectionZ}`,
    );
  }

  // The composer belongs to the selection that opened it. Selecting a different
  // element must close/discard that transient composer instead of moving it to
  // the new target. The new selection gets the normal small Add Note trigger.
  await page.evaluate(() => {
    const second = document.createElement("button");
    second.type = "button";
    second.dataset.selfHostTargetSecond = "true";
    second.textContent = "Second selection target";
    Object.assign(second.style, {
      position: "absolute",
      left: "720px",
      top: "430px",
      width: "220px",
      height: "72px",
      border: "1px solid #cbd5e1",
      borderRadius: "12px",
      background: "white",
    });
    document.body.append(second);

    const scrollRunway = document.createElement("div");
    scrollRunway.dataset.annotationOwnershipScrollRunway = "true";
    Object.assign(scrollRunway.style, {
      height: "1600px",
      pointerEvents: "none",
    });
    document.body.append(scrollRunway);
  });

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.subject.select("[data-self-host-target-second]");
  });
  await composer.waitFor({ state: "detached" });
  await trigger.waitFor({ state: "visible" });

  // Visibility alone can observe an earlier placement while selection ownership
  // is being handed off. Wait for the new selected element to own the trigger.
  const handoffBeforeWait = await page.evaluate(() => {
    const subject = window.__MESURER_SELF_HOSTING__?.subject;
    const second = document.querySelector("[data-self-host-target-second]");
    const nextTrigger = subject?.root.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(second instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) return null;
    const secondBox = second.getBoundingClientRect();
    const triggerBox = nextTrigger.getBoundingClientRect();
    return {
      second: { left: secondBox.left, top: secondBox.top, width: secondBox.width, height: secondBox.height },
      trigger: { left: triggerBox.left, top: triggerBox.top, width: triggerBox.width, height: triggerBox.height },
      positionAnchor: getComputedStyle(nextTrigger).getPropertyValue("position-anchor").trim(),
      scrollMode: nextTrigger.dataset.mesurerAnnotationScrollMode ?? null,
      nativeOwner: nextTrigger.dataset.mesurerNativeScrollOwner ?? null,
      targetAnchorName: second.style.getPropertyValue("anchor-name"),
    };
  });
  console.log("Annotation ownership stage: waiting for retargeted Add Note trigger", handoffBeforeWait);
  await page.waitForFunction(() => {
    const subject = window.__MESURER_SELF_HOSTING__?.subject;
    const second = document.querySelector("[data-self-host-target-second]");
    const nextTrigger = subject?.root.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(second instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) return false;
    const secondBox = second.getBoundingClientRect();
    const triggerBox = nextTrigger.getBoundingClientRect();
    const triggerCenter = {
      x: triggerBox.left + triggerBox.width / 2,
      y: triggerBox.top + triggerBox.height / 2,
    };
    const secondCenter = {
      x: secondBox.left + secondBox.width / 2,
      y: secondBox.top + secondBox.height / 2,
    };
    return Math.hypot(triggerCenter.x - secondCenter.x, triggerCenter.y - secondCenter.y) < 180;
  });
  console.log("Annotation ownership stage: retargeted Add Note trigger ready");
  await settle();

  const secondBox = await page.locator("[data-self-host-target-second]").boundingBox();
  const triggerBox = await trigger.boundingBox();
  assert(secondBox && triggerBox, "new selection and Add Note trigger must have rendered geometry");
  const triggerCenter = { x: triggerBox.x + triggerBox.width / 2, y: triggerBox.y + triggerBox.height / 2 };
  const secondCenter = { x: secondBox.x + secondBox.width / 2, y: secondBox.y + secondBox.height / 2 };
  assert(
    Math.hypot(triggerCenter.x - secondCenter.x, triggerCenter.y - secondCenter.y) < 180,
    "new selection must own the restored Add Note trigger",
  );

  const triggerOwnership = await trigger.evaluate((element) => ({
    scrollMode: element.dataset.mesurerAnnotationScrollMode ?? null,
    nativeOwner: element.dataset.mesurerNativeScrollOwner ?? null,
    insideCanonicalRoot: Boolean(element.closest("[data-mesurer-root='true']")),
  }));
  assert.equal(
    triggerOwnership.scrollMode,
    "cached-delta",
    "a trigger restored for a different selection must use the canonical-root cached-delta path",
  );
  assert.equal(
    triggerOwnership.nativeOwner,
    null,
    "the draft-handoff trigger must not retain stale native CSS-anchor ownership",
  );
  assert.equal(
    triggerOwnership.insideCanonicalRoot,
    true,
    "the restored Add Note trigger must remain inside the canonical Mesurer root",
  );

  const triggerZ = await trigger.evaluate((element) => {
    const value = getComputedStyle(element).zIndex;
    return { text: value, numeric: value === "auto" ? null : Number.parseInt(value, 10) };
  });
  assert.notEqual(
    triggerZ.numeric,
    null,
    `restored Add Note trigger must own an explicit protected z-index, got ${triggerZ.text}`,
  );
  assert.equal(
    triggerZ.numeric,
    ownership.cardZ,
    "restored Add Note trigger and composer must share the same protected annotation paint tier",
  );

  // The canonical-root trigger is viewport-fixed while its page target scrolls.
  // Window scrolling therefore updates only cached scalar CSS deltas. Gate the
  // observable invariant directly: target-relative geometry remains exact and
  // the Y cache advances by precisely the opposite of the real scroll delta.
  const windowScrollEvidence = await page.evaluate(async () => {
    const subject = window.__MESURER_SELF_HOSTING__?.subject;
    const second = document.querySelector("[data-self-host-target-second]");
    const nextTrigger = subject?.root.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(second instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) {
      throw new Error("Missing second target or restored Add Note trigger");
    }
    const numberVariable = (property) => {
      const value = nextTrigger.style.getPropertyValue(property).trim();
      if (!value) return 0;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const snapshot = () => {
      const target = second.getBoundingClientRect();
      const triggerRect = nextTrigger.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        target: { left: target.left, top: target.top },
        trigger: { left: triggerRect.left, top: triggerRect.top },
        relative: {
          x: triggerRect.left - target.left,
          y: triggerRect.top - target.top,
        },
        cachedX: numberVariable("--mesurer-nested-scroll-x"),
        cachedY: numberVariable("--mesurer-nested-scroll-y"),
      };
    };
    const before = snapshot();
    window.scrollBy({ top: 180, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = snapshot();
    return { before, after };
  });
  const scrollDelta = windowScrollEvidence.after.scrollY - windowScrollEvidence.before.scrollY;
  assert(scrollDelta > 0, "annotation handoff fixture must exercise real window scrolling");
  assert(
    Math.abs(windowScrollEvidence.after.relative.x - windowScrollEvidence.before.relative.x) < 0.5
      && Math.abs(windowScrollEvidence.after.relative.y - windowScrollEvidence.before.relative.y) < 0.5,
    `canonical-root Add Note trigger drifted during window scroll: ${JSON.stringify(windowScrollEvidence)}`,
  );
  assert(
    Math.abs(
      (windowScrollEvidence.after.cachedY - windowScrollEvidence.before.cachedY) + scrollDelta,
    ) < 0.5,
    `cached Y compensation must advance by the inverse window scroll delta: ${JSON.stringify(windowScrollEvidence)}`,
  );
  assert(
    Math.abs(windowScrollEvidence.after.cachedX - windowScrollEvidence.before.cachedX) < 0.5,
    `vertical window scrolling must not perturb cached X compensation: ${JSON.stringify(windowScrollEvidence)}`,
  );

  // The abandoned draft must not follow the selection invisibly and reappear on
  // the new target when its Add Note button is used.
  await clickByCoordinates(trigger, "second selection annotation trigger");
  await composer.waitFor({ state: "visible" });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "selection change must discard the previous selection's unsaved annotation draft",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log(`Annotation ownership contract passed: canonical-root Context cards own an explicit protected paint tier above document-owned page chrome (${ownership.hoverDocumentLayer ? "ported" : "direct"}), selection change closes/discards the draft, the new target gets a canonical-root cached-delta Add Note trigger, and window scrolling preserves target-relative geometry through scalar compensation.`);
} finally {
  await browser.close();
}
