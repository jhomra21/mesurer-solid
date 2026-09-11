import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const assertRelativeOffset = (before, after, stage) => {
  for (const key of ["x", "y"]) {
    const beforeOffset = before.surface[key] - before.target[key];
    const afterOffset = after.surface[key] - after.target[key];
    assert(
      Math.abs(afterOffset - beforeOffset) <= 1.5,
      `${stage}: ${key} offset changed; before=${beforeOffset} after=${afterOffset}`,
    );
  }
};

const boxGap = (a, b) => {
  const horizontal = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const vertical = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(horizontal, vertical);
};

const shadowTargetBox = () => page.evaluate(() => {
  const host = document.querySelector("#shadow-scroll-host");
  const target = host?.shadowRoot?.querySelector("#isolated-shadow-scroll-target");
  if (!(target instanceof HTMLElement)) throw new Error("Expected cross-shadow target");
  const rect = target.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});

const sampleShadowScroll = (source, deltaY) => page.evaluate(
  ({ scrollSource, scrollDelta }) => new Promise((resolve, reject) => {
    const host = document.querySelector("#shadow-scroll-host");
    const root = host?.shadowRoot;
    const scroller = root?.querySelector("#shadow-scroll-shell");
    const target = root?.querySelector("#isolated-shadow-scroll-target");
    const trigger = document.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(scroller instanceof HTMLElement)) return reject(new Error("Expected cross-shadow scroller"));
    if (!(target instanceof HTMLElement)) return reject(new Error("Expected cross-shadow target"));
    if (!(trigger instanceof HTMLElement)) return reject(new Error("Expected annotation trigger"));

    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => ({ target: snapshot(target), surface: snapshot(trigger) });
    const before = state();
    const timer = window.setTimeout(() => reject(new Error(`Timed out waiting for ${scrollSource} scroll`)), 3_000);
    const finish = () => {
      window.clearTimeout(timer);
      resolve({ before, after: state() });
    };

    if (scrollSource === "nested") {
      scroller.addEventListener("scroll", finish, { once: true });
      scroller.scrollBy({ top: scrollDelta, behavior: "instant" });
    } else {
      window.addEventListener("scroll", finish, { capture: true, once: true });
      window.scrollBy({ top: scrollDelta, behavior: "instant" });
    }
  }),
  { scrollSource: source, scrollDelta: deltaY },
);

const measureShadowScrollWork = (source, deltaY) => page.evaluate(
  ({ scrollSource, scrollDelta }) => new Promise((resolve, reject) => {
    const host = document.querySelector("#shadow-scroll-host");
    const root = host?.shadowRoot;
    const scroller = root?.querySelector("#shadow-scroll-shell");
    const target = root?.querySelector("#isolated-shadow-scroll-target");
    if (!(scroller instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      return reject(new Error("Expected cross-shadow target and scroller"));
    }

    const originalRect = target.getBoundingClientRect;
    let targetRectReads = 0;
    target.getBoundingClientRect = function mesurerRejectedAcceptanceRectProbe() {
      targetRectReads += 1;
      return originalRect.call(this);
    };

    const finish = () => {
      delete target.getBoundingClientRect;
      resolve({ targetRectReads });
    };

    if (scrollSource === "nested") scroller.scrollBy({ top: scrollDelta, behavior: "instant" });
    else window.scrollBy({ top: scrollDelta, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }),
  { scrollSource: source, scrollDelta: deltaY },
);

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  // Reproduce the manual screenshot failure: while Select is active, direct
  // editing opens the real unified Typography card. A physical click on that
  // card must stay inside Mesurer and must not turn the card into page selection.
  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetRect = await box(target, "manual-regression target before direct edit");
  await page.mouse.click(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2);

  const selectedChrome = page.locator(
    "[data-mesurer-selected-measurement='true'] > [data-mesurer-native-scroll-anchor='box']",
  ).first();
  await selectedChrome.waitFor({ state: "visible" });
  assertSameBox(await box(selectedChrome, "selected before Typography"), targetRect, "selected before Typography");

  await page.mouse.dblclick(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2);
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspectorShell = page.locator("[data-mesurer-text-inspector-placement-shell='true']");
  const inspectorCard = page.locator("[data-mesurer-text-inspector-info='true']");
  await ring.waitFor({ state: "visible" });
  await inspectorShell.waitFor({ state: "visible" });
  await inspectorCard.waitFor({ state: "visible" });

  const layers = await page.evaluate(() => {
    const editRing = document.querySelector("[data-mesurer-text-edit-ring='true']");
    const shell = document.querySelector("[data-mesurer-text-inspector-placement-shell='true']");
    if (!(editRing instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
      throw new Error("Expected edit ring and Typography shell");
    }
    return {
      ring: Number(getComputedStyle(editRing).zIndex),
      inspector: Number(getComputedStyle(shell).zIndex),
    };
  });
  assert(
    Number.isFinite(layers.ring) && Number.isFinite(layers.inspector) && layers.inspector > layers.ring,
    `Typography inspector must paint above page-linked edit chrome; ${JSON.stringify(layers)}`,
  );

  const cardRect = await box(inspectorCard, "Typography card before physical click");
  const clickPoint = { x: cardRect.x + 18, y: cardRect.y + 18 };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      insideInspector: Boolean(element?.closest("[data-mesurer-inspector-ui='true']")),
      tag: element?.tagName ?? null,
    };
  }, clickPoint);
  assert.equal(hit.insideInspector, true, `Typography click point must physically hit inspector UI; ${JSON.stringify(hit)}`);

  await page.mouse.click(clickPoint.x, clickPoint.y);
  await settle();
  targetRect = await box(target, "target after Typography click");
  assert.equal(
    await page.locator("[data-mesurer-selected-measurement='true']").count(),
    1,
    "clicking Typography must not create another page selection",
  );
  assertSameBox(
    await box(selectedChrome, "selected after Typography click"),
    targetRect,
    "clicking Typography must keep the inspected page target selected",
  );

  // End direct editing before reproducing the annotation failure.
  const editor = page.locator("[data-mesurer-text-editor='true']");
  if (await editor.count()) {
    await editor.focus();
    await page.keyboard.press("Escape");
    await editor.waitFor({ state: "detached" });
  }

  // Reproduce the topology missing from the old green gate: Mesurer is mounted
  // in its isolated top-layer ShadowRoot, while the selected page element lives
  // inside a different ShadowRoot and an overflow scroller. CSS anchor names
  // cannot cross that tree-scope boundary, so the trigger must use cached deltas.
  const shadowHost = page.locator("#shadow-scroll-host");
  await shadowHost.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => {
    const host = document.querySelector("#shadow-scroll-host");
    const scroller = host?.shadowRoot?.querySelector("#shadow-scroll-shell");
    if (!(scroller instanceof HTMLElement)) throw new Error("Expected cross-shadow scroller before selection");
    scroller.scrollTop = 340;
  });
  await settle();

  const shadowRect = await shadowTargetBox();
  await page.mouse.click(shadowRect.x + shadowRect.width / 2, shadowRect.y + shadowRect.height / 2);
  const annotationTrigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await annotationTrigger.waitFor({ state: "visible" });
  const annotationRect = await box(annotationTrigger, "cross-shadow annotation before scroll");
  const gap = boxGap(shadowRect, annotationRect);
  assert(gap >= 5.5 && gap <= 6.5, `cross-shadow annotation should start at 6px clearance; gap=${gap.toFixed(2)}px`);
  assert.equal(
    await annotationTrigger.getAttribute("data-mesurer-annotation-scroll-mode"),
    "cached-delta",
    "cross-shadow annotation must not pretend it has a resolvable native CSS anchor",
  );
  assert.equal(await annotationTrigger.getAttribute("data-mesurer-native-scroll-anchor"), null);
  assert.equal(await annotationTrigger.getAttribute("data-mesurer-nested-scroll-compensation"), "true");

  const nested = await sampleShadowScroll("nested", 48);
  assertRelativeOffset(nested.before, nested.after, "cross-shadow annotation in first nested scroll event");
  await settle();
  assert.deepEqual(
    await measureShadowScrollWork("nested", 20),
    { targetRectReads: 0 },
    "cross-shadow nested hot path must not chase target geometry",
  );

  const windowScroll = await sampleShadowScroll("window", 40);
  assertRelativeOffset(windowScroll.before, windowScroll.after, "cross-shadow annotation in first window scroll event");
  await settle();
  assert.deepEqual(
    await measureShadowScrollWork("window", 20),
    { targetRectReads: 0 },
    "cross-shadow window hot path must not chase target geometry",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Rejected manual acceptance cases now pass: Typography is a hard Select boundary and cross-shadow annotation stays attached without scroll-time geometry chasing.");
} finally {
  await browser.close();
}
