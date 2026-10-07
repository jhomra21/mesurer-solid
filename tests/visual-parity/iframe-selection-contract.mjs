import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.IFRAME_SELECTION_URL ?? "http://127.0.0.1:4181/iframe-selection.html";

const output = process.env.IFRAME_SELECTION_OUT ?? "iframe-selection-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickDocumentUi = async (locator, label) => {
  await locator.waitFor({ state: "visible" });

  const rect = await locator.boundingBox();

  assert(rect, `${label}: expected rendered geometry`);

  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  await page.mouse.move(x, y);
  await settle();

  const hit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    const actual = element.ownerDocument.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

    return {
      ownsHit: Boolean(actual && (actual === element || element.contains(actual))),
      expected: element.outerHTML.slice(0, 800),
      actual: actual?.outerHTML.slice(0, 800) ?? null,
    };
  });

  assert.equal(
    hit.ownsHit,
    true,
    `${label} did not own its visible pointer location: ${JSON.stringify(hit)}`,
  );

  await page.mouse.click(x, y);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_IFRAME_TEST__));

  const select = page.locator("[data-mesurer-builtin='select'] button");

  await select.waitFor({ state: "visible" });

  if ((await select.getAttribute("aria-pressed")) !== "true") await select.click();

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector("[data-testid='same-origin-frame']");

    if (!(frame instanceof HTMLIFrameElement)) throw new Error("Missing same-origin iframe fixture");

    const target = frame.contentDocument?.querySelector("[data-testid='frame-target']");
    const FrameElement = frame.contentWindow?.Element;

    if (!FrameElement || !(target instanceof FrameElement)) throw new Error("Missing iframe target");

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const transform = getComputedStyle(frame).transform;
    const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);

    if (!matrix.is2D) throw new Error("Iframe contract requires a 2D transform");

    const width = frame.offsetWidth;

    const height = frame.offsetHeight;
    const originLeft = frameRect.left - Math.min(
      0,
      matrix.a * width,
      matrix.c * height,
      matrix.a * width + matrix.c * height,
    );

    const originTop = frameRect.top - Math.min(
      0,
      matrix.b * width,
      matrix.d * height,
      matrix.b * width + matrix.d * height,
    );

    const localLeft = frame.clientLeft + targetRect.left;
    const localTop = frame.clientTop + targetRect.top;

    const project = (x, y) => ({
      x: originLeft + matrix.a * x + matrix.c * y,
      y: originTop + matrix.b * x + matrix.d * y,
    });

    const corners = [
      project(localLeft, localTop),
      project(localLeft + targetRect.width, localTop),
      project(localLeft, localTop + targetRect.height),
      project(localLeft + targetRect.width, localTop + targetRect.height),
    ];

    const left = Math.min(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const right = Math.max(...corners.map((point) => point.x));
    const bottom = Math.max(...corners.map((point) => point.y));

    return {
      frame: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
        clientLeft: frame.clientLeft,
        clientTop: frame.clientTop,
        matrix: {
          a: matrix.a,
          b: matrix.b,
          c: matrix.c,
          d: matrix.d,
        },
      },
      target: {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      },
      expected: {
        left,
        top,
        width: right - left,
        height: bottom - top,
      },
    };
  });

  const clickPoint = {
    x: geometry.expected.left + geometry.expected.width / 2,
    y: geometry.expected.top + geometry.expected.height / 2,
  };

  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForTimeout(300);

  const preflight = await page.evaluate(({ clickPoint }) => {
    const selected = [...document.querySelectorAll("[data-mesurer-selected-measurement='true']")];
    const frame = document.querySelector("[data-testid='same-origin-frame']");
    const frameDocument = frame instanceof HTMLIFrameElement ? frame.contentDocument : null;

    return {
      topHits: document.elementsFromPoint(clickPoint.x, clickPoint.y).map((element) => ({
        tag: element.tagName,
        testId: element.getAttribute("data-testid"),
        mesurer: element.getAttribute("data-mesurer-interaction-overlay")
          ?? element.getAttribute("data-mesurer-selected-measurement"),
      })),
      frameSelection: frameDocument
        ? frameDocument.querySelector("[data-testid='frame-target']")?.outerHTML ?? null
        : null,
      selected: selected.map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);

        return {
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          html: element.outerHTML.slice(0, 1600),
        };
      }),
    };
  }, { clickPoint });

  await writeFile(
    join(output, "iframe-selection-preflight.json"),
    `${JSON.stringify({ geometry, clickPoint, preflight, errors }, null, 2)}\n`,
    "utf8",
  );

  await page.screenshot({
    path: join(output, "iframe-selection-preflight.png"),
    fullPage: true,
  });

  const selected = page
    .locator("[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true']")
    .last();

  await selected.waitFor({ state: "visible", timeout: 5000 });

  const selectedBox = await selected.boundingBox();

  assert(selectedBox, "Selected iframe child must expose rendered measurement geometry");

  for (const [key, actual, expected] of [
    ["left", selectedBox.x, geometry.expected.left],
    ["top", selectedBox.y, geometry.expected.top],
    ["width", selectedBox.width, geometry.expected.width],
    ["height", selectedBox.height, geometry.expected.height],
  ]) {
    assert(
      Math.abs(actual - expected) <= 2,
      `Iframe child ${key} must project into the parent viewport. expected=${expected} actual=${actual}`,
    );
  }

  assert(
    Math.abs(selectedBox.width - geometry.frame.width) > 20,
    "Selection must resolve the iframe child, not the iframe element",
  );

  const motionPlayer = page.locator("[data-mesurer-motion-player='true']");

  await motionPlayer.waitFor({ state: "visible", timeout: 5000 });

  const motionInspect = motionPlayer.locator("[data-mesurer-motion-inspect='true']");

  if ((await motionInspect.getAttribute("aria-expanded")) !== "true") {
    await motionInspect.click();
  }

  const motionDetails = motionPlayer.locator("[data-mesurer-motion-details='true']");

  await motionDetails.waitFor({ state: "visible" });

  assert.match(
    (await motionDetails.textContent()) ?? "",
    /iframe-pulse|opacity/i,
    "Motion must inspect animation details in the iframe element's own realm",
  );

  const selectionContext = await page.evaluate(
    () => window.__MESURER_IFRAME_TEST__?.subject.context({ scope: "selection" }),
  );

  const contextTargetRect = selectionContext?.targets?.[0]?.inspection?.rect;

  assert(contextTargetRect, "Selection Context must expose the selected iframe child");

  for (const [key, actual, expected] of [
    ["left", contextTargetRect.left, geometry.expected.left],
    ["top", contextTargetRect.top, geometry.expected.top],
    ["width", contextTargetRect.width, geometry.expected.width],
    ["height", contextTargetRect.height, geometry.expected.height],
  ]) {
    assert(
      Math.abs(actual - expected) <= 2,
      `Iframe Context ${key} must use top-level projected geometry. expected=${expected} actual=${actual}`,
    );
  }

  const xray = page.locator("[data-mesurer-builtin='xray'] button");

  await xray.click();
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-testid='same-origin-frame']");

    return frame instanceof HTMLIFrameElement
      && frame.contentDocument?.body.classList.contains("mesurer-solid-xray");
  });

  const xrayState = await page.evaluate(() => {
    const frame = document.querySelector("[data-testid='same-origin-frame']");

    if (!(frame instanceof HTMLIFrameElement)) return null;

    const target = frame.contentDocument?.querySelector("[data-testid='frame-target']");

    if (!(target instanceof frame.contentWindow.Element)) return null;

    const style = frame.contentWindow.getComputedStyle(target);

    return {
      childBody: frame.contentDocument.body.classList.contains("mesurer-solid-xray"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });

  assert(xrayState?.childBody, "X-ray must activate inside the same-origin iframe");
  assert.notEqual(xrayState?.outlineStyle, "none", "Iframe child must receive X-ray outline");
  assert.notEqual(xrayState?.outlineWidth, "0px", "Iframe child X-ray outline must be visible");

  await xray.click();
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-testid='same-origin-frame']");

    return frame instanceof HTMLIFrameElement
      && !frame.contentDocument?.body.classList.contains("mesurer-solid-xray");
  });

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");

  await trigger.waitFor({ state: "visible", timeout: 5000 });

  const triggerBox = await trigger.boundingBox();

  assert(triggerBox, "Context trigger must be visible for an iframe selection");

  const triggerCenter = {
    x: triggerBox.x + triggerBox.width / 2,
    y: triggerBox.y + triggerBox.height / 2,
  };

  const dx = triggerCenter.x < geometry.expected.left
    ? geometry.expected.left - triggerCenter.x
    : triggerCenter.x > geometry.expected.left + geometry.expected.width
      ? triggerCenter.x - geometry.expected.left - geometry.expected.width
      : 0;

  const dy = triggerCenter.y < geometry.expected.top
    ? geometry.expected.top - triggerCenter.y
    : triggerCenter.y > geometry.expected.top + geometry.expected.height
      ? triggerCenter.y - geometry.expected.top - geometry.expected.height
      : 0;

  assert(
    Math.hypot(dx, dy) <= 64,
    `Context trigger drifted away from projected iframe target: ${JSON.stringify({ triggerBox, expected: geometry.expected })}`,
  );

  await trigger.evaluate((element) => {
    const global = window;

    global.__MESURER_IFRAME_CONTEXT_EVENTS__ = [];

    const describe = (event, phase) => {
      const target = event.target instanceof Element
        ? event.target.closest("[data-mesurer-annotation-trigger='true']")?.getAttribute("data-mesurer-annotation-trigger")
          ?? event.target.getAttribute("data-mesurer-layer")
          ?? event.target.tagName
        : null;

      global.__MESURER_IFRAME_CONTEXT_EVENTS__.push({
        type: event.type,
        phase,
        target,
        defaultPrevented: event.defaultPrevented,
        cancelBubble: event.cancelBubble,
      });
    };

    for (const type of ["pointerdown", "pointerup", "click"]) {
      document.addEventListener(type, (event) => describe(event, "document-capture"), {
        capture: true,
        once: true,
      });

      element.addEventListener(type, (event) => describe(event, "target-capture"), {
        capture: true,
        once: true,
      });

      element.addEventListener(type, (event) => describe(event, "target-bubble"), {
        once: true,
      });

      document.addEventListener(type, (event) => describe(event, "document-bubble"), {
        once: true,
      });
    }
  });

  await clickDocumentUi(trigger, "iframe Context trigger");

  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");

  await page.waitForTimeout(250);

  const contextClickState = await page.evaluate(() => {
    const root = document.querySelector("[data-mesurer-context-root='true']");

    const trigger = root?.querySelector("[data-mesurer-annotation-trigger='true']");

    const composer = root?.querySelector("[data-mesurer-annotation-composer='true']");

    const selected = document.querySelector(
      "[data-mesurer-selected-measurement='true'] [data-mesurer-measurement-chrome='true']",
    );

    return {
      trigger: trigger?.outerHTML.slice(0, 1200) ?? null,
      composer: composer?.outerHTML.slice(0, 1200) ?? null,
      selected: selected?.outerHTML.slice(0, 1200) ?? null,
      events: window.__MESURER_IFRAME_CONTEXT_EVENTS__ ?? [],
    };
  });

  await writeFile(
    join(output, "iframe-context-click.json"),
    `${JSON.stringify(contextClickState, null, 2)}\n`,
    "utf8",
  );

  await page.screenshot({
    path: join(output, "iframe-context-click.png"),
    fullPage: true,
  });

  if ((await composer.count()) === 0) {
    const syntheticState = await trigger.evaluate((element) => {
      element.click();

      return window.__MESURER_IFRAME_CONTEXT_EVENTS__ ?? [];
    });

    await settle();

    const syntheticComposer = await composer.count();

    await writeFile(
      join(output, "iframe-context-synthetic-click.json"),
      `${JSON.stringify({
        events: syntheticState,
        composerCount: syntheticComposer,
      }, null, 2)}\n`,
      "utf8",
    );

    assert.fail(
      `Physical iframe Context trigger click did not open the composer. ${JSON.stringify(contextClickState)}`,
    );
  }

  await composer.waitFor({ state: "visible", timeout: 5000 });
  await composer.locator("textarea").fill("Iframe context acceptance");
  await clickDocumentUi(
    composer.getByRole("button", { name: "Add note", exact: true }),
    "iframe Context Add note",
  );
  await composer.waitFor({ state: "hidden" });

  const marker = contextRoot.locator("[data-mesurer-annotation-marker='true']").first();
  const highlight = contextRoot.locator("[data-mesurer-annotation-target-highlight='true']").first();

  await marker.waitFor({ state: "visible" });
  await highlight.waitFor({ state: "visible" });

  const highlightBox = await highlight.boundingBox();

  assert(highlightBox, "Iframe annotation must render its ownership highlight");

  for (const [key, actual, expected] of [
    ["left", highlightBox.x, geometry.expected.left],
    ["top", highlightBox.y, geometry.expected.top],
    ["width", highlightBox.width, geometry.expected.width],
    ["height", highlightBox.height, geometry.expected.height],
  ]) {
    assert(
      Math.abs(actual - expected) <= 2,
      `Iframe annotation highlight ${key} must match projected target geometry. expected=${expected} actual=${actual}`,
    );
  }

  const annotationId = await marker.getAttribute("data-mesurer-annotation-id");

  assert(annotationId, "Iframe annotation marker must expose its annotation id");

  const annotationContext = await page.evaluate(
    async (id) => window.__MESURER_IFRAME_TEST__?.subject.context({ annotation: id }),
    annotationId,
  );

  const annotationTargetRect = annotationContext?.targets?.[0]?.inspection?.rect;

  assert(annotationTargetRect, "Annotation Context must resolve its iframe target");

  for (const [key, actual, expected] of [
    ["left", annotationTargetRect.left, geometry.expected.left],
    ["top", annotationTargetRect.top, geometry.expected.top],
    ["width", annotationTargetRect.width, geometry.expected.width],
    ["height", annotationTargetRect.height, geometry.expected.height],
  ]) {
    assert(
      Math.abs(actual - expected) <= 2,
      `Iframe annotation Context ${key} must stay projected. expected=${expected} actual=${actual}`,
    );
  }

  const screenshotPath = join(output, "iframe-selection.png");

  await page.screenshot({ path: screenshotPath, fullPage: true });

  await writeFile(
    join(output, "iframe-selection.json"),
    `${JSON.stringify({
      geometry,
      selectedBox,
      contextTargetRect,
      motionDetails: (await motionDetails.textContent()) ?? "",
      xrayState,
      triggerBox,
      highlightBox,
      annotationTargetRect,
      errors,
    }, null, 2)}\n`,
    "utf8",
  );

  assert.deepEqual(errors, [], `Iframe contract emitted browser errors: ${errors.join("\n")}`);

  console.log("Same-origin iframe selection, X-ray, and Context contract: PASS");
} finally {
  await browser.close();
}
