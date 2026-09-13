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
    if (!(root instanceof HTMLElement)) return [];
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
  if (!label) return {
    ring: readRect(ringRect),
    card: readRect(cardRect),
    label: null,
    sourceGap: null,
    typographyGap: null,
    marker: shell.getAttribute("data-mesurer-symmetric-measurement-spacing"),
    sourceMarker: shell.getAttribute("data-mesurer-symmetric-source-gap"),
    typographyMarker: shell.getAttribute("data-mesurer-symmetric-typography-gap"),
    anchorY: shell.style.getPropertyValue("--mesurer-native-anchor-y"),
  };

  return {
    ring: readRect(ringRect),
    card: readRect(cardRect),
    label,
    sourceGap: label.rect.y - ringRect.bottom,
    typographyGap: cardRect.y - label.rect.bottom,
    marker: shell.getAttribute("data-mesurer-symmetric-measurement-spacing"),
    sourceMarker: shell.getAttribute("data-mesurer-symmetric-source-gap"),
    typographyMarker: shell.getAttribute("data-mesurer-symmetric-typography-gap"),
    anchorY: shell.style.getPropertyValue("--mesurer-native-anchor-y"),
  };
});

const assertSymmetric = (state, phase) => {
  if (!state?.label) throw new Error(`${phase}: Mesurer dimensions pill geometry was unavailable: ${JSON.stringify(state)}`);
  if (state.label.score > 4) {
    throw new Error(`${phase}: nearest Mesurer dimensions pill does not track the edit ring: ${JSON.stringify(state)}`);
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

  // Reproduce the consumer race that escaped the old synthetic test: after the
  // clearance calculation is correct, a later anchor owner rewrites the shell
  // by +7px. Mesurer must re-measure the rendered surfaces and remove exactly
  // that error instead of trusting the stale shell coordinate.
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
    afterLateRewrite,
  });
} finally {
  await page.close();
  await browser.close();
}
