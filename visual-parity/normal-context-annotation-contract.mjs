import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.NORMAL_CONTEXT_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1162, height: 494 },
  deviceScaleFactor: 2,
  userAgent: "CodexBrowser Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
});
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.addInitScript(() => {
  Object.defineProperty(window, "__codexWebMcpModelContext", {
    configurable: true,
    value: {},
  });
});

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickDocumentUi = async (locator, label) => {
  await locator.waitFor({ state: "visible" });
  const rect = await box(locator, label);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  // The protected renderer lives above ordinary page content. A real pointer
  // approaches a document-backed Mesurer control before the press, which lets
  // the shared passthrough boundary expose that exact control. Keep the hit-test
  // assertion physical, and report the actual owner if that handoff ever fails.
  await page.mouse.move(x, y);
  const hitState = await locator.evaluate((element) => {
    const describe = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        id: node.id || null,
        className: typeof node.className === "string" ? node.className : null,
        layer: node.dataset.mesurerLayer ?? null,
        root: node.dataset.mesurerRoot ?? null,
        island: node.dataset.mesurerIsland ?? null,
        annotationPanel: node.dataset.mesurerAnnotationPanel ?? null,
        annotationMarker: node.dataset.mesurerAnnotationMarker ?? null,
        annotationTrigger: node.dataset.mesurerAnnotationTrigger ?? null,
        selectedMeasurement: node.dataset.mesurerSelectedMeasurement ?? null,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
        position: style.position,
      };
    };
    const rect = element.getBoundingClientRect();
    const actual = element.ownerDocument.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const contextRoot = element.closest("[data-mesurer-context-root='true']");
    const island = element.ownerDocument.querySelector("[data-mesurer-island='true']");
    const rendererRoot = island instanceof HTMLElement
      ? island.shadowRoot?.querySelector("[data-mesurer-root='true']")
        ?? island.querySelector("[data-mesurer-root='true']")
      : null;
    return {
      ownsHit: Boolean(actual && (actual === element || element.contains(actual))),
      actual: describe(actual),
      actualParent: describe(actual?.parentElement ?? null),
      expected: describe(element),
      contextRoot: describe(contextRoot),
      rendererRoot: describe(rendererRoot),
      passthrough: rendererRoot instanceof HTMLElement
        ? rendererRoot.dataset.mesurerDocumentUiPassthrough ?? null
        : null,
      passthroughStyles: element.ownerDocument.querySelectorAll(
        "style[data-mesurer-document-ui-passthrough-style='true']",
      ).length + (island?.shadowRoot?.querySelectorAll(
        "style[data-mesurer-document-ui-passthrough-style='true']",
      ).length ?? 0),
    };
  });
  assert.equal(
    hitState.ownsHit,
    true,
    `${label} did not own its visible pointer location after physical pointer approach: ${JSON.stringify(hitState)}`,
  );
  await page.mouse.click(x, y);
};

const openSettings = async () => {
  const button = page.locator("button[data-mesurer-builtin='settings']");
  await button.waitFor({ state: "visible" });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.waitFor({ state: "visible" });
  return dialog;
};

const saveNote = async (composer, text) => {
  await composer.waitFor({ state: "visible" });
  const textarea = composer.locator("textarea");
  await clickDocumentUi(textarea, "annotation note textarea");
  await textarea.fill(text);
  await clickDocumentUi(composer.getByRole("button", { name: "Add note", exact: true }), "Add note submit button");
  await composer.waitFor({ state: "hidden" });
};

const assertDocumentSurface = async (locator, label) => {
  assert.equal(
    await locator.getAttribute("data-mesurer-annotation-scroll-mode"),
    "document",
    `${label} must use document scroll ownership`,
  );
  assert.equal(
    await locator.evaluate((element) => getComputedStyle(element).position),
    "absolute",
    `${label} must use absolute document positioning`,
  );
  assert.equal(
    await locator.evaluate((element) => element.style.getPropertyValue("position-anchor")),
    "",
    `${label} must not depend on CSS anchor positioning for window scrolling`,
  );
  assert.equal(
    await locator.evaluate((element) => element.style.getPropertyValue("--mesurer-nested-scroll-y")),
    "",
    `${label} must not use JS window-scroll compensation`,
  );
};

const captureFrameSeries = async (steps, delta) => page.evaluate(async ({ steps, delta }) => {
  const read = (selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const capture = () => ({
    target: read(".hero h1"),
    trigger: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']"),
    composer: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']"),
    marker: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']"),
    panel: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']"),
    highlight: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']"),
  });
  const frames = [capture()];
  for (let index = 0; index < steps; index += 1) {
    window.scrollBy(0, delta);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Read in the frame callback immediately before paint. Any one-frame
    // catch-up between page content and annotation UI fails this contract.
    frames.push(capture());
  }
  return frames;
}, { steps, delta });

const assertFrameAttachment = (frames, names, tolerance = 1.5) => {
  const baseline = frames[0];
  assert(baseline?.target, "frame series lost its target");
  const offsets = Object.fromEntries(names.map((name) => {
    const rect = baseline[name];
    assert(rect, `frame series lost ${name} at baseline`);
    return [name, { x: rect.x - baseline.target.x, y: rect.y - baseline.target.y }];
  }));
  for (const [index, frame] of frames.entries()) {
    assert(frame?.target, `frame ${index} lost target`);
    for (const name of names) {
      const rect = frame[name];
      assert(rect, `frame ${index} lost ${name}`);
      const dx = rect.x - frame.target.x;
      const dy = rect.y - frame.target.y;
      assert(Math.abs(dx - offsets[name].x) <= tolerance, `${name} horizontal offset drifted on painted frame ${index}`);
      assert(Math.abs(dy - offsets[name].y) <= tolerance, `${name} vertical offset drifted on painted frame ${index}`);
    }
  }
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  let settings = await openSettings();
  let general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  let disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  let context = settings.getByRole("switch", { name: "Context", exact: true });
  if ((await context.getAttribute("aria-checked")) !== "true") await context.click();
  await page.waitForFunction(() => document.querySelector("[data-mesurer-plugin-toggle='mesurer.context']")?.getAttribute("aria-checked") === "true");
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await settings.waitFor({ state: "hidden" });

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-mesurer-tool-id='context.copy'] button").waitFor({ state: "visible" });
  settings = await openSettings();
  general = settings.getByRole("tab", { name: "General", exact: true });
  if ((await general.getAttribute("aria-selected")) !== "true") await general.click();
  disclosure = settings.locator("[data-mesurer-plugin-settings-disclosure='plugins']");
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  context = settings.getByRole("switch", { name: "Context", exact: true });
  assert.equal(await context.getAttribute("aria-checked"), "true", "Context did not restore enabled after reload");
  await page.locator("button[data-mesurer-builtin='settings']").click();
  await settings.waitFor({ state: "hidden" });

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.click();
  const target = page.locator(".hero h1");
  const targetBox = await box(target, "hero target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const selected = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selected.waitFor({ state: "visible" });
  const selectedBox = await box(selected, "selected hero chrome");
  assert(Math.abs(selectedBox.x - targetBox.x) <= 2 && Math.abs(selectedBox.y - targetBox.y) <= 2, "selection chrome must match its page target");

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  await contextRoot.waitFor({ state: "attached" });
  assert.equal(
    await contextRoot.getAttribute("data-mesurer-document-inspector-mount"),
    "true",
    "Context page evidence must use the document inspector mount",
  );
  assert.equal(
    await contextRoot.evaluate((element) => element.getRootNode() === document),
    true,
    "Context page evidence must live in the host document scroll tree",
  );
  assert.equal(
    await contextRoot.evaluate((element) => Boolean(element.closest("[data-mesurer-root='true']"))),
    false,
    "Context page evidence must not remain fixed inside the canonical viewport root",
  );

  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await trigger.count(), 1, "expected one Add Note trigger");
  await assertDocumentSurface(trigger, "Add Note trigger");

  const triggerFrames = await captureFrameSeries(6, 8);
  assertFrameAttachment(triggerFrames, ["trigger"]);

  await clickDocumentUi(trigger, "Add Note trigger after pre-note scroll");
  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  await assertDocumentSurface(composer, "Add Note composer");
  const composerFrames = await captureFrameSeries(4, 6);
  assertFrameAttachment(composerFrames, ["composer"]);
  await saveNote(composer, "Normal playground annotation acceptance");

  let markers = contextRoot.locator("[data-mesurer-annotation-marker='true']");
  await markers.first().waitFor({ state: "visible" });
  assert.equal(await markers.count(), 1, "first saved annotation marker missing");
  const marker = markers.first();
  assert.equal(await marker.getAttribute("data-mesurer-annotation-number"), "1", "first marker must be numbered 1");
  await assertDocumentSurface(marker, "saved annotation marker");

  const panel = contextRoot.locator("[data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  await assertDocumentSurface(panel, "open annotation panel");
  assert.equal(await panel.locator("[data-mesurer-annotation-panel-badge='true']").textContent(), "1", "panel number must match marker");
  await trigger.waitFor({ state: "visible" });
  assert.equal(await trigger.count(), 1, "Add Note must remain available while a panel is open");

  const highlight = contextRoot.locator("[data-mesurer-annotation-target-highlight='true']");
  await highlight.waitFor({ state: "visible" });
  await assertDocumentSurface(highlight, "annotation ownership highlight");

  const annotationFrames = await captureFrameSeries(10, 8);
  assertFrameAttachment(annotationFrames, ["marker", "panel", "highlight"]);
  const firstPanelY = annotationFrames[0].panel.y;
  const lastPanelY = annotationFrames.at(-1).panel.y;
  const firstTargetY = annotationFrames[0].target.y;
  const lastTargetY = annotationFrames.at(-1).target.y;
  assert(Math.abs(lastPanelY - firstPanelY) > 20, "open annotation panel stayed pinned to the viewport");
  assert(Math.abs((lastPanelY - firstPanelY) - (lastTargetY - firstTargetY)) <= 1.5, "open annotation panel did not remain on its page-relative point");

  const markerZIndex = Number(await marker.evaluate((element) => getComputedStyle(element).zIndex));
  const panelZIndex = Number(await panel.evaluate((element) => getComputedStyle(element).zIndex));
  assert(markerZIndex > panelZIndex, "saved markers must remain physically reachable above open panel");

  const highlightBox = await box(highlight, "annotation ownership highlight");
  const highlightedTarget = await box(target, "highlighted target");
  assert(Math.abs(highlightBox.x - highlightedTarget.x) <= 1.5, "ownership highlight x must match target");
  assert(Math.abs(highlightBox.y - highlightedTarget.y) <= 1.5, "ownership highlight y must match target");
  assert(Math.abs(highlightBox.width - highlightedTarget.width) <= 2, "ownership highlight width must match target");
  assert(Math.abs(highlightBox.height - highlightedTarget.height) <= 2, "ownership highlight height must match target");
  const highlightStyle = await highlight.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: Number.parseFloat(style.borderTopWidth),
      color: style.borderTopColor,
      background: style.backgroundColor,
      shadow: style.boxShadow,
      radius: style.borderRadius,
      sizing: style.boxSizing,
    };
  });
  assert(highlightStyle.width >= 1 && highlightStyle.width <= 1.5, `unexpected ownership edge width ${highlightStyle.width}`);
  assert.equal(highlightStyle.color, "rgb(13, 153, 255)");
  assert.equal(highlightStyle.background, "rgba(0, 0, 0, 0)");
  assert.equal(highlightStyle.shadow, "none");
  assert.equal(highlightStyle.radius, "0px");
  assert.equal(highlightStyle.sizing, "border-box");

  // The card is intentionally page-owned, so the scroll sequence above may
  // carry it completely out of the viewport. Bring the source back before the
  // physical close check rather than treating correct off-screen ownership as a
  // hit-test failure.
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  const restoredTargetBox = await box(target, "target restored for annotation close");
  const restoredPanelBox = await box(panel, "annotation panel restored for physical close");
  assert(
    Math.abs((restoredPanelBox.y - restoredTargetBox.y) - (annotationFrames[0].panel.y - annotationFrames[0].target.y)) <= 1.5,
    "annotation panel changed its target-relative page point after returning to view",
  );
  await clickDocumentUi(panel.getByRole("button", { name: "Close annotation" }), "Close annotation button");
  await panel.waitFor({ state: "hidden" });

  // Add notes 2 and 3 after scrolling. A newly mounted third marker must stay
  // close enough to its target that ownership is visually obvious.
  await clickDocumentUi(marker, "saved annotation marker 1");
  await panel.waitFor({ state: "visible" });
  await clickDocumentUi(trigger, "Add Note trigger while annotation is open");
  await panel.waitFor({ state: "hidden" });
  await saveNote(composer, "Second annotation on the same selected element");
  markers = contextRoot.locator("[data-mesurer-annotation-marker='true']");
  assert.equal(await markers.count(), 2, "second annotation marker missing");

  await clickDocumentUi(trigger, "Add Note trigger for third note");
  await saveNote(composer, "Third annotation on the same selected element");
  assert.equal(await markers.count(), 3, "third annotation marker missing");

  const markerState = await page.evaluate(() => {
    const targetElement = document.querySelector(".hero h1");
    if (!(targetElement instanceof HTMLElement)) return null;
    const targetRect = targetElement.getBoundingClientRect();
    return [...document.querySelectorAll("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']")].map((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x < targetRect.left ? targetRect.left - x : x > targetRect.right ? x - targetRect.right : 0;
      const dy = y < targetRect.top ? targetRect.top - y : y > targetRect.bottom ? y - targetRect.bottom : 0;
      return {
        number: element.getAttribute("data-mesurer-annotation-number"),
        distance: Math.hypot(dx, dy),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        mode: element.getAttribute("data-mesurer-annotation-scroll-mode"),
        position: getComputedStyle(element).position,
        anchor: element.style.getPropertyValue("position-anchor"),
      };
    });
  });
  assert(markerState, "could not measure repeated markers");
  for (const state of markerState) {
    assert.equal(state.mode, "document", `marker ${state.number} left document scroll ownership`);
    assert.equal(state.position, "absolute", `marker ${state.number} left document positioning`);
    assert.equal(state.anchor, "", `marker ${state.number} unexpectedly depends on CSS anchoring`);
    assert(state.distance <= 64, `marker ${state.number} drifted ${state.distance}px from target`);
  }
  for (let left = 0; left < markerState.length; left += 1) {
    for (let right = left + 1; right < markerState.length; right += 1) {
      const a = markerState[left].rect;
      const b = markerState[right].rect;
      const overlaps = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      assert.equal(overlaps, false, `markers ${left + 1} and ${right + 1} overlap`);
    }
  }

  const repeatedFrames = await captureFrameSeries(6, -6);
  assertFrameAttachment(repeatedFrames, ["marker", "panel"]);

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("\n")}`);
  const browserVersion = await browser.version();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  console.log(`Normal Context annotation E2E (${browserVersion}, DPR ${dpr}): document-owned annotation surfaces stay source-attached on every pre-paint scroll frame; the panel moves with its page point; three same-target notes stay nearby and separate; Add Note remains available while a note is open; and ownership stays one clean target boundary: PASS`);
} finally {
  await browser.close();
}