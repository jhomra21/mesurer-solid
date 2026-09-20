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

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible" });

  const topology = await trigger.evaluate((element) => {
    const root = element.closest("[data-mesurer-context-root='true']");

    return {
      rootIsDocument: root?.getRootNode() === document,
      documentMount: root instanceof HTMLElement
        ? root.dataset.mesurerDocumentInspectorMount ?? null
        : null,
      insideCanonicalRoot: Boolean(root?.closest("[data-mesurer-root='true']")),
      coordinateSpace: element.dataset.mesurerContextCoordinateSpace ?? null,
      scrollMode: element.dataset.mesurerAnnotationScrollMode ?? null,
      position: getComputedStyle(element).position,
      positionAnchor: element.style.getPropertyValue("position-anchor"),
      cachedY: element.style.getPropertyValue("--mesurer-nested-scroll-y"),
    };
  });

  assert.deepEqual(topology, {
    rootIsDocument: true,
    documentMount: "true",
    insideCanonicalRoot: false,
    coordinateSpace: "document",
    scrollMode: "document",
    position: "absolute",
    positionAnchor: "",
    cachedY: "",
  }, `Context page evidence must use one document-owned scroll plane: ${JSON.stringify(topology)}`);

  await clickByCoordinates(trigger, "annotation trigger");
  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Unsaved note bound to the first selection");

  const hoverTarget = page.locator(".fixture-copy h1");
  const hoverBox = await hoverTarget.boundingBox();
  assert(hoverBox, "hover target must have rendered geometry");
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);
  await page.waitForFunction(() => {
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");

    return hover instanceof HTMLElement && hover.getRootNode() === document;
  });

  const paint = await page.evaluate(() => {
    const card = document.querySelector("[data-mesurer-annotation-composer='true']");
    const hover = document.querySelector("[data-mesurer-hover-measurement='true']");

    if (!(card instanceof HTMLElement) || !(hover instanceof HTMLElement)) {
      throw new Error("Missing annotation card or document hover chrome");
    }

    const numeric = (value) => value !== "auto" ? Number.parseInt(value, 10) : null;

    return {
      cardZ: numeric(getComputedStyle(card).zIndex),
      hoverZ: numeric(getComputedStyle(hover).zIndex),
      hoverZText: getComputedStyle(hover).zIndex,
    };
  });

  assert.notEqual(paint.cardZ, null, "annotation composer must own an explicit protected z-index");

  if (paint.hoverZ !== null) {
    assert(paint.cardZ > paint.hoverZ, `annotation composer z-index ${paint.cardZ} must beat hover ${paint.hoverZ}`);
  } else {
    assert.equal(paint.hoverZText, "auto", `unexpected hover stacking value ${paint.hoverZText}`);
  }

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

    const runway = document.createElement("div");
    runway.dataset.annotationOwnershipScrollRunway = "true";
    Object.assign(runway.style, { height: "1600px", pointerEvents: "none" });
    document.body.append(runway);
  });

  await page.evaluate(async () => {
    await window.__MESURER_SELF_HOSTING__.subject.select("[data-self-host-target-second]");
  });
  await composer.waitFor({ state: "detached" });
  await trigger.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const second = document.querySelector("[data-self-host-target-second]");

    const nextTrigger = document.querySelector(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
    );

    if (!(second instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) return false;
    const target = second.getBoundingClientRect();
    const action = nextTrigger.getBoundingClientRect();

    return Math.hypot(
      action.left + action.width / 2 - (target.left + target.width / 2),
      action.top + action.height / 2 - (target.top + target.height / 2),
    ) < 180;
  });
  await settle();

  assert.equal(await contextRoot.count(), 1, "selection handoff must keep exactly one Context root");

  const restored = await trigger.evaluate((element) => ({
    mode: element.dataset.mesurerAnnotationScrollMode ?? null,
    coordinateSpace: element.dataset.mesurerContextCoordinateSpace ?? null,
    position: getComputedStyle(element).position,
    anchor: element.style.getPropertyValue("position-anchor"),
    cachedY: element.style.getPropertyValue("--mesurer-nested-scroll-y"),
  }));

  assert.deepEqual(restored, {
    mode: "document",
    coordinateSpace: "document",
    position: "absolute",
    anchor: "",
    cachedY: "",
  }, `restored Add Note action left document ownership: ${JSON.stringify(restored)}`);

  const windowScrollEvidence = await page.evaluate(async () => {
    const second = document.querySelector("[data-self-host-target-second]");

    const nextTrigger = document.querySelector(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
    );

    if (!(second instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) {
      throw new Error("Missing second target or restored Add Note trigger");
    }

    const snapshot = () => {
      const target = second.getBoundingClientRect();
      const action = nextTrigger.getBoundingClientRect();

      return {
        scrollY: window.scrollY,
        target: { left: target.left, top: target.top },
        trigger: { left: action.left, top: action.top },
        relative: { x: action.left - target.left, y: action.top - target.top },
        cachedY: nextTrigger.style.getPropertyValue("--mesurer-nested-scroll-y"),
      };
    };

    const before = snapshot();
    window.scrollBy({ top: 180, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstPaint = snapshot();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const settled = snapshot();

    return { before, firstPaint, settled };
  });

  const scrollDelta = windowScrollEvidence.firstPaint.scrollY - windowScrollEvidence.before.scrollY;
  assert(scrollDelta > 0, "annotation ownership fixture must exercise real window scrolling");

  for (const sample of [windowScrollEvidence.firstPaint, windowScrollEvidence.settled]) {
    assert(
      Math.abs(sample.relative.x - windowScrollEvidence.before.relative.x) < 0.5
        && Math.abs(sample.relative.y - windowScrollEvidence.before.relative.y) < 0.5,
      `document-owned Add Note action drifted during scroll: ${JSON.stringify(windowScrollEvidence)}`,
    );
    assert.equal(sample.cachedY, "", "window scrolling must not write a JS compensation delta");
  }

  await clickByCoordinates(trigger, "second selection annotation trigger");
  await composer.waitFor({ state: "visible" });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "selection change must discard the previous selection's unsaved annotation draft",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Annotation surface ownership contract: one document-backed Context plane paints above page chrome, survives selection handoff, follows window scrolling without JS catch-up, and discards abandoned drafts: PASS");
} finally {
  await browser.close();
}
