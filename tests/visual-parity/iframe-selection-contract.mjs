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
    const scaleX = frameRect.width / frame.offsetWidth;
    const scaleY = frameRect.height / frame.offsetHeight;

    return {
      frame: {
        left: frameRect.left,
        top: frameRect.top,
        width: frameRect.width,
        height: frameRect.height,
        clientLeft: frame.clientLeft,
        clientTop: frame.clientTop,
        scaleX,
        scaleY,
      },
      target: {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      },
      expected: {
        left: frameRect.left + (frame.clientLeft + targetRect.left) * scaleX,
        top: frameRect.top + (frame.clientTop + targetRect.top) * scaleY,
        width: targetRect.width * scaleX,
        height: targetRect.height * scaleY,
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

  await trigger.click();

  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");

  await composer.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("Iframe context acceptance");
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
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
