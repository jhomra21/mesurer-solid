import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const waitFrames = (count = 2) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}, count);

const readMeasuredSpacing = () => page.evaluate(() => {
  const island = document.querySelector("[data-mesurer-island='true']");
  const ring = document.querySelector("[data-mesurer-text-edit-ring='true']");
  const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
  const shell = document.querySelector("[data-mesurer-text-inspector-placement-shell='true']");
  if (!(island instanceof HTMLElement) || !island.shadowRoot
    || !(ring instanceof HTMLElement) || !(card instanceof HTMLElement) || !(shell instanceof HTMLElement)) return null;

  const ringRect = ring.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const readRect = (rect) => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  });
  const labels = [
    ...Array.from(document.body.querySelectorAll("[data-mesurer-measurement-label='true']")),
    ...Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-measurement-label='true']")),
  ].flatMap((label) => {
    if (!(label instanceof HTMLElement)) return [];
    const root = label.closest("[data-mesurer-measurement='true']");
    if (!(root instanceof HTMLElement)
      || root.getAttribute("data-mesurer-selected-measurement") !== "true") return [];
    const chrome = root.querySelector("[data-mesurer-measurement-chrome='true']");
    if (!(chrome instanceof HTMLElement)) return [];
    const labelRect = label.getBoundingClientRect();
    const chromeRect = chrome.getBoundingClientRect();
    if (labelRect.width <= 0 || labelRect.height <= 0 || chromeRect.width <= 0 || chromeRect.height <= 0) return [];
    const score = Math.abs(chromeRect.left - ringRect.left)
      + Math.abs(chromeRect.top - ringRect.top)
      + Math.abs(chromeRect.width - ringRect.width)
      + Math.abs(chromeRect.height - ringRect.height);
    return [{
      rect: readRect(labelRect),
      chrome: readRect(chromeRect),
      score,
      selected: root.getAttribute("data-mesurer-selected-measurement"),
      opacity: getComputedStyle(root).opacity,
    }];
  }).sort((left, right) => left.score - right.score);

  const label = labels[0] ?? null;
  const shared = {
    ring: readRect(ringRect),
    card: readRect(cardRect),
    label,
    marker: shell.getAttribute("data-mesurer-symmetric-measurement-spacing"),
    sourceMarker: shell.getAttribute("data-mesurer-symmetric-source-gap"),
    typographyMarker: shell.getAttribute("data-mesurer-symmetric-typography-gap"),
    anchorX: shell.style.getPropertyValue("--mesurer-native-anchor-x"),
    anchorY: shell.style.getPropertyValue("--mesurer-native-anchor-y"),
    shellLeft: shell.style.left,
    shellTop: shell.style.top,
    cardTranslate: card.style.translate,
  };
  if (!label) return {
    ...shared,
    sourceGap: null,
    typographyGap: null,
  };

  return {
    ...shared,
    sourceGap: label.rect.y - ringRect.bottom,
    typographyGap: cardRect.y - label.rect.bottom,
  };
});

const assertSymmetric = (state, phase) => {
  if (!state?.label) throw new Error(`${phase}: Mesurer dimensions pill geometry was unavailable: ${JSON.stringify(state)}`);
  if (state.label.score > 4) {
    throw new Error(`${phase}: selected Mesurer dimensions pill does not track the edit ring: ${JSON.stringify(state)}`);
  }
  if (state.marker !== "true") {
    throw new Error(`${phase}: symmetric rendered-spacing owner is not active: ${JSON.stringify(state)}`);
  }
  if (Math.abs(state.sourceGap - 2) > 0.75) {
    throw new Error(`${phase}: element → pill gap is not Mesurer's 2px offset: ${JSON.stringify(state)}`);
  }
  if (Math.abs(state.typographyGap - state.sourceGap) > 0.75) {
    throw new Error(`${phase}: rendered pill spacing is asymmetric: ${JSON.stringify(state)}`);
  }
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"),
  ));
  await page.evaluate(() => window.__MESURER__.command("builtin.select"));

  const target = page.locator("[data-testid='consumer-sibling']");
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Symmetric-spacing target has no geometry");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.mouse.dblclick(x, y);
  await page.locator("[data-mesurer-text-editor='true']").waitFor({ state: "visible", timeout: 5000 });
  await page.locator("[data-mesurer-text-inspector-info='true']").waitFor({ state: "visible", timeout: 5000 });
  await page.waitForFunction(() => document.querySelector(
    "[data-mesurer-text-inspector-placement-shell='true']",
  )?.getAttribute("data-mesurer-symmetric-measurement-spacing") === "true");
  await waitFrames(4);

  const initial = await readMeasuredSpacing();
  assertSymmetric(initial, "initial placement");

  // A final-position assertion can miss visible jitter when two writers move a
  // surface apart and back within one pointer gesture. Sample the rendered card
  // on every animation frame and record style mutations on both placement
  // owners while the pointer crosses multiple hover targets.
  await page.evaluate(() => {
    const shell = document.querySelector("[data-mesurer-text-inspector-placement-shell='true']");
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    if (!(shell instanceof HTMLElement) || !(card instanceof HTMLElement)) {
      throw new Error("Missing Typography surfaces for pointer stability probe");
    }
    const probe = {
      active: true,
      samples: [],
      shellMutations: [],
      cardMutations: [],
      shellObserver: null,
      cardObserver: null,
    };
    probe.shellObserver = new MutationObserver((records) => {
      for (const record of records) {
        probe.shellMutations.push({
          oldValue: record.oldValue,
          style: shell.getAttribute("style"),
          anchorX: shell.style.getPropertyValue("--mesurer-native-anchor-x"),
          anchorY: shell.style.getPropertyValue("--mesurer-native-anchor-y"),
        });
      }
    });
    probe.cardObserver = new MutationObserver((records) => {
      for (const record of records) {
        probe.cardMutations.push({
          oldValue: record.oldValue,
          style: card.getAttribute("style"),
          translate: card.style.translate,
        });
      }
    });
    probe.shellObserver.observe(shell, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });
    probe.cardObserver.observe(card, { attributes: true, attributeFilter: ["style"], attributeOldValue: true });

    const sample = () => {
      if (!probe.active) return;
      const rect = card.getBoundingClientRect();
      probe.samples.push({
        x: rect.x,
        y: rect.y,
        anchorX: shell.style.getPropertyValue("--mesurer-native-anchor-x"),
        anchorY: shell.style.getPropertyValue("--mesurer-native-anchor-y"),
        shellLeft: shell.style.left,
        shellTop: shell.style.top,
        cardTranslate: card.style.translate,
      });
      requestAnimationFrame(sample);
    };
    window.__MESURER_POINTER_STABILITY_PROBE__ = probe;
    requestAnimationFrame(sample);
  });

  const counter = page.locator("[data-testid='consumer-counter']");
  const counterBox = await counter.boundingBox();
  if (!counterBox) throw new Error("Pointer-stability counter target has no geometry");
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.move(counterBox.x + 6, counterBox.y + 6, { steps: 6 });
    await waitFrames(1);
    await page.mouse.move(targetBox.x + targetBox.width - 6, targetBox.y + 6, { steps: 6 });
    await waitFrames(1);
    await page.mouse.move(1100, 700, { steps: 6 });
    await waitFrames(1);
  }
  await waitFrames(3);

  const pointerProbe = await page.evaluate(async () => {
    const probe = window.__MESURER_POINTER_STABILITY_PROBE__;
    if (!probe) throw new Error("Pointer stability probe disappeared");
    probe.active = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    probe.shellObserver?.disconnect();
    probe.cardObserver?.disconnect();
    const result = {
      samples: probe.samples,
      shellMutations: probe.shellMutations,
      cardMutations: probe.cardMutations,
    };
    delete window.__MESURER_POINTER_STABILITY_PROBE__;
    return result;
  });

  const pointerStable = await readMeasuredSpacing();
  assertSymmetric(pointerStable, "pointer hover stability");
  if (pointerProbe.samples.length < 8) {
    throw new Error(`Pointer probe did not sample enough rendered frames: ${pointerProbe.samples.length}`);
  }
  const movedFrame = pointerProbe.samples.find((sample) =>
    Math.abs(sample.x - initial.card.x) > 0.25 || Math.abs(sample.y - initial.card.y) > 0.25);
  if (movedFrame) {
    throw new Error(`Pointer motion visibly moved Typography during an intermediate frame: ${JSON.stringify({ initial, movedFrame, pointerProbe })}`);
  }
  const rewrittenAnchor = pointerProbe.samples.find((sample) =>
    sample.anchorX !== initial.anchorX || sample.anchorY !== initial.anchorY);
  if (rewrittenAnchor) {
    throw new Error(`Pointer motion rewrote Typography native anchoring during an intermediate frame: ${JSON.stringify({ initial, rewrittenAnchor, pointerProbe })}`);
  }
  if (Math.abs(pointerStable.card.x - initial.card.x) > 0.25
    || Math.abs(pointerStable.card.y - initial.card.y) > 0.25) {
    throw new Error(`Pointer motion changed final Typography geometry: ${JSON.stringify({ initial, pointerStable })}`);
  }
  if (pointerStable.anchorX !== initial.anchorX || pointerStable.anchorY !== initial.anchorY) {
    throw new Error(`Pointer motion changed final Typography native anchor: ${JSON.stringify({ initial, pointerStable })}`);
  }
  if (pointerProbe.shellMutations.length > 0 || pointerProbe.cardMutations.length > 0) {
    throw new Error(`Pointer motion mutated Typography placement styles: ${JSON.stringify(pointerProbe)}`);
  }

  // Reproduce the consumer race that escaped the old synthetic test: after the
  // clearance calculation is correct, a later anchor owner rewrites the shell
  // by +7px. Mesurer must re-measure the rendered surfaces and remove exactly
  // that visual error without making hover a placement input.
  await page.evaluate(() => {
    const shell = document.querySelector("[data-mesurer-text-inspector-placement-shell='true']");
    if (!(shell instanceof HTMLElement)) throw new Error("Missing Typography placement shell");
    const current = Number.parseFloat(shell.style.getPropertyValue("--mesurer-native-anchor-y"));
    if (!Number.isFinite(current)) throw new Error("Typography native anchor Y is unavailable");
    shell.style.setProperty("--mesurer-native-anchor-y", `${current + 7}px`);
  });
  await waitFrames(4);

  const afterLateRewrite = await readMeasuredSpacing();
  assertSymmetric(afterLateRewrite, "late +7px anchor rewrite");

  console.log("Packed Solid 2 Mesurer-measured symmetric dimensions spacing: PASS", {
    initial,
    pointerStable,
    pointerFrames: pointerProbe.samples.length,
    afterLateRewrite,
  });
} finally {
  await page.close();
  await browser.close();
}
