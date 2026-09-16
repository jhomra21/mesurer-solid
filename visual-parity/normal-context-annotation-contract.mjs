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
  await composer.locator("textarea").fill(text);
  await composer.getByRole("button", { name: "Add note", exact: true }).click();
  await composer.waitFor({ state: "hidden" });
};

const assertNativeSurface = async (locator, label, anchorPrefix = "--mesurer-annotation-") => {
  assert.equal(await locator.getAttribute("data-mesurer-annotation-scroll-mode"), "native-anchor", `${label} must use native target anchoring`);
  assert.equal(await locator.evaluate((element) => getComputedStyle(element).position), "fixed", `${label} must use a fixed anchor positioning context`);
  const anchor = await locator.evaluate((element) => getComputedStyle(element).getPropertyValue("position-anchor").trim());
  assert(anchor.startsWith(anchorPrefix), `${label} lost its source anchor: ${anchor || "<empty>"}`);
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
    marker: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']"),
    panel: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']"),
    highlight: read("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']"),
  });
  const frames = [capture()];
  for (let index = 0; index < steps; index += 1) {
    window.scrollBy(0, delta);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // The geometry read happens in the frame callback immediately before that
    // frame can paint. A one-frame catch-up therefore fails this contract.
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

  const trigger = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await trigger.count(), 1, "expected one Add Note trigger");
  await assertNativeSurface(trigger, "Add Note trigger", "--mesurer-annotation-trigger-");
  assert.equal(
    await trigger.evaluate((element) => Boolean(element.closest("[data-mesurer-context-root='true']")?.closest("[data-mesurer-root='true']"))),
    true,
    "Context trigger must remain inside the canonical Mesurer root",
  );

  const triggerFrames = await captureFrameSeries(6, 8);
  assertFrameAttachment(triggerFrames, ["trigger"]);

  const triggerBox = await box(trigger, "trigger after pre-note scroll");
  await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  const composer = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']");
  await composer.waitFor({ state: "visible" });
  await assertNativeSurface(composer, "Add Note composer", "--mesurer-annotation-trigger-");
  const composerFrames = await captureFrameSeries(4, 6);
  assertFrameAttachment(composerFrames, ["composer"]);
  await saveNote(composer, "Normal playground annotation acceptance");

  let markers = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  await markers.first().waitFor({ state: "visible" });
  assert.equal(await markers.count(), 1, "first saved annotation marker missing");
  const marker = markers.first();
  assert.equal(await marker.getAttribute("data-mesurer-annotation-number"), "1", "first marker must be numbered 1");
  await assertNativeSurface(marker, "saved annotation marker");

  const panel = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  await assertNativeSurface(panel, "open annotation panel");
  assert.equal(await panel.locator("[data-mesurer-annotation-panel-badge='true']").textContent(), "1", "panel number must match marker");
  await trigger.waitFor({ state: "visible" });
  assert.equal(await trigger.count(), 1, "Add Note must remain available while a panel is open");

  const highlight = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-target-highlight='true']");
  await highlight.waitFor({ state: "visible" });
  await assertNativeSurface(highlight, "annotation ownership highlight");

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

  await panel.getByRole("button", { name: "Close annotation" }).click();
  await panel.waitFor({ state: "hidden" });

  // Add notes 2 and 3 after scrolling. This is the user's reported failure
  // shape: a newly mounted third marker must remain visibly owned by the target.
  await marker.click();
  await panel.waitFor({ state: "visible" });
  await trigger.click();
  await panel.waitFor({ state: "hidden" });
  await saveNote(composer, "Second annotation on the same selected element");
  markers = page.locator("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']");
  assert.equal(await markers.count(), 2, "second annotation marker missing");

  await trigger.click();
  await saveNote(composer, "Third annotation on the same selected element");
  assert.equal(await markers.count(), 3, "third annotation marker missing");

  const markerState = await page.evaluate(() => {
    const targetElement = document.querySelector(".hero h1");
    if (!(targetElement instanceof HTMLElement)) return null;
    const targetRect = targetElement.getBoundingClientRect();
    const values = [...document.querySelectorAll("[data-mesurer-context-root='true'] [data-mesurer-annotation-marker='true']")].map((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x < targetRect.left ? targetRect.left - x : x > targetRect.right ? x - targetRect.right : 0;
      const dy = y < targetRect.top ? targetRect.top - y : y > targetRect.bottom ? y - targetRect.bottom : 0;
      return {
        number: element.getAttribute("data-mesurer-annotation-number"),
        distance: Math.hypot(dx, dy),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        anchor: getComputedStyle(element).getPropertyValue("position-anchor").trim(),
      };
    });
    return values;
  });
  assert(markerState, "could not measure repeated markers");
  for (const state of markerState) {
    assert(state.anchor.startsWith("--mesurer-annotation-"), `marker ${state.number} lost source anchor`);
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
  console.log(`Normal Context annotation E2E (${browserVersion}, DPR ${dpr}): every pre-paint scroll frame keeps Add Note, composer, saved markers, panel, and ownership highlight source-attached; the panel moves with its page point; three same-target notes stay nearby and separate; Add Note remains available while a note is open; and ownership stays one clean target boundary: PASS`);
} finally {
  await browser.close();
}
