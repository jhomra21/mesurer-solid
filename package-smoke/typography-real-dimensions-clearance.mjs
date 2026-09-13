import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const waitFrames = (count = 2) => page.evaluate(async (frames) => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}, count);
const overlaps = (a, b) => a && b
  && Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) > 0
  && Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) > 0;

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
  if (!targetBox) throw new Error("Dimensions-clearance target has no geometry");
  const x = targetBox.x + targetBox.width / 2;
  const y = targetBox.y + targetBox.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.mouse.dblclick(x, y);
  await page.locator("[data-mesurer-text-editor='true']").waitFor({ state: "visible", timeout: 5000 });
  await page.locator("[data-mesurer-text-inspector-info='true']").waitFor({ state: "visible", timeout: 5000 });
  await waitFrames(3);

  const state = await page.evaluate(() => {
    const island = document.querySelector("[data-mesurer-island='true']");
    const ring = document.querySelector("[data-mesurer-text-edit-ring='true']");
    const card = document.querySelector("[data-mesurer-text-inspector-info='true']");
    const shell = document.querySelector("[data-mesurer-text-inspector-placement-shell='true']");
    if (!(island instanceof HTMLElement) || !island.shadowRoot
      || !(ring instanceof HTMLElement) || !(card instanceof HTMLElement) || !(shell instanceof HTMLElement)) return null;

    const readRect = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const ringRect = ring.getBoundingClientRect();
    const expectedLabelTop = ringRect.bottom + 2;
    const expectedLabelCenter = ringRect.left + ringRect.width / 2;
    const candidates = [
      ...Array.from(document.body.querySelectorAll("[data-mesurer-measurement-label='true']")).map((label) => ({ label, layer: "document" })),
      ...Array.from(island.shadowRoot.querySelectorAll("[data-mesurer-measurement-label='true']")).map((label) => ({ label, layer: "shadow" })),
    ].flatMap(({ label, layer }) => {
      if (!(label instanceof HTMLElement)) return [];
      const root = label.closest("[data-mesurer-measurement='true']");
      if (!(root instanceof HTMLElement)) return [];
      const rootStyle = getComputedStyle(root);
      const labelStyle = getComputedStyle(label);
      if (rootStyle.display === "none" || rootStyle.visibility === "hidden" || Number(rootStyle.opacity) <= 0.01) return [];
      if (labelStyle.display === "none" || labelStyle.visibility === "hidden" || Number(labelStyle.opacity) <= 0.01) return [];
      const rect = label.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      const center = rect.left + rect.width / 2;
      return [{
        layer,
        selected: root.getAttribute("data-mesurer-selected-measurement"),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        score: Math.abs(rect.top - expectedLabelTop) + Math.abs(center - expectedLabelCenter),
      }];
    }).sort((left, right) => left.score - right.score);

    return {
      ring: readRect(ring),
      card: readRect(card),
      label: candidates[0] ?? null,
      clearance: shell.getAttribute("data-mesurer-measurement-label-clearance"),
      placement: card.getAttribute("data-mesurer-text-inspector-placement"),
    };
  });

  if (!state) throw new Error("Packed dimensions-clearance state is unavailable");
  const expectedLabelBand = {
    x: state.ring.x,
    y: state.ring.y + state.ring.height + 2,
    width: state.ring.width,
    height: 20,
  };
  const canonicalBelow = {
    x: state.card.x,
    y: state.ring.y + state.ring.height + 8,
    width: state.card.width,
    height: state.card.height,
  };
  if (!overlaps(canonicalBelow, expectedLabelBand)) {
    throw new Error(`Fixture no longer reproduces the dimensions-label lane conflict: ${JSON.stringify({ state, expectedLabelBand, canonicalBelow })}`);
  }
  if (state.clearance !== "true") {
    throw new Error(`Typography did not claim proactive dimensions-pill clearance: ${JSON.stringify({ state, expectedLabelBand })}`);
  }
  if (overlaps(state.card, expectedLabelBand)) {
    throw new Error(`Typography still occupies the standard dimensions-pill lane: ${JSON.stringify({ state, expectedLabelBand })}`);
  }
  if (state.label && state.label.score <= 16 && overlaps(state.card, state.label.rect)) {
    throw new Error(`Typography still overlaps a visible real dimensions pill: ${JSON.stringify(state)}`);
  }
  if (state.placement === "below") {
    const gap = state.card.y - (expectedLabelBand.y + expectedLabelBand.height);
    if (gap < 7.5) {
      throw new Error(`Typography below-lane clearance is less than 8px: ${JSON.stringify({ gap, state, expectedLabelBand })}`);
    }
  }

  console.log("Packed Solid 2 proactive dimensions-pill clearance: PASS", { state, expectedLabelBand });
} finally {
  await page.close();
  await browser.close();
}
