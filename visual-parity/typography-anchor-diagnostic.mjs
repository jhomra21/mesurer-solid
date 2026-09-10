import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.TYPOGRAPHY_ANCHOR_URL ?? "http://127.0.0.1:4174/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const assertSameBox = (actual, expected, stage) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const relativeOffset = (target, surface) => ({
  x: surface.x - target.x,
  y: surface.y - target.y,
});

const assertSameOffset = (before, after, stage) => {
  for (const key of ["x", "y"]) {
    assert(
      Math.abs(after[key] - before[key]) <= 1.5,
      `${stage}: ${key} offset changed; before=${before[key]} after=${after[key]}`,
    );
  }
};

const snapshot = () => page.evaluate(() => {
  const target = document.querySelector(".feature-copy .kicker");
  const box = document.querySelector(".mesurer-ti-box[data-state='visible']");
  const card = document.querySelector(".mesurer-ti-card[data-state='visible']");
  if (!(target instanceof HTMLElement)) throw new Error("Missing target");
  if (!(box instanceof HTMLElement)) throw new Error("Missing Typography box");
  if (!(card instanceof HTMLElement)) throw new Error("Missing Typography card");
  const rect = (element) => {
    const value = element.getBoundingClientRect();
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  const state = (element) => {
    const computed = getComputedStyle(element);
    return {
      rect: rect(element),
      nativeAnchor: element.dataset.mesurerNativeScrollAnchor ?? null,
      nativeOwner: element.dataset.mesurerNativeScrollOwner ?? null,
      inlinePosition: element.style.position,
      inlineLeft: element.style.left,
      inlineTop: element.style.top,
      computedPosition: computed.position,
      computedLeft: computed.left,
      computedTop: computed.top,
      positionAnchor: computed.getPropertyValue("position-anchor").trim(),
    };
  };
  const parent = box.parentElement;
  const parentStyle = parent ? getComputedStyle(parent) : null;
  return {
    scrollY: window.scrollY,
    target: {
      rect: rect(target),
      anchorName: getComputedStyle(target).getPropertyValue("anchor-name").trim(),
      inlineAnchorName: target.style.getPropertyValue("anchor-name"),
    },
    box: state(box),
    card: state(card),
    parent: parent ? {
      tag: parent.tagName,
      id: parent.id,
      inspectorUi: parent.dataset.mesurerInspectorUi ?? null,
      inlinePosition: parent.style.position,
      computedPosition: parentStyle?.position ?? null,
      inlineInset: parent.style.inset,
      computedInset: parentStyle?.inset ?? null,
      parentTag: parent.parentElement?.tagName ?? null,
    } : null,
  };
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  await typography.waitFor({ state: "visible" });
  await typography.evaluate((button) => button.click());
  await page.waitForFunction(() => document.querySelector("button[data-mesurer-builtin='text-inspector']")?.getAttribute("aria-pressed") === "true");

  const target = page.locator(".feature-copy .kicker");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Missing target geometry");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.locator(".mesurer-ti-box[data-state='visible']").waitFor({ state: "visible" });
  await page.locator(".mesurer-ti-card[data-state='visible']").waitFor({ state: "visible" });

  const before = await snapshot();
  assertSameBox(before.box.rect, before.target.rect, "Typography before scroll");
  const cardOffsetBefore = relativeOffset(before.target.rect, before.card.rect);

  const immediate = await page.evaluate(() => new Promise((resolve) => {
    const state = () => {
      const target = document.querySelector(".feature-copy .kicker");
      const box = document.querySelector(".mesurer-ti-box[data-state='visible']");
      const card = document.querySelector(".mesurer-ti-card[data-state='visible']");
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { x: value.x, y: value.y, width: value.width, height: value.height };
      };
      const css = (element) => {
        const computed = getComputedStyle(element);
        return {
          rect: rect(element),
          nativeAnchor: element.dataset.mesurerNativeScrollAnchor ?? null,
          nativeOwner: element.dataset.mesurerNativeScrollOwner ?? null,
          computedPosition: computed.position,
          positionAnchor: computed.getPropertyValue("position-anchor").trim(),
          computedTop: computed.top,
        };
      };
      return {
        scrollY: window.scrollY,
        target: target instanceof HTMLElement ? {
          rect: rect(target),
          anchorName: getComputedStyle(target).getPropertyValue("anchor-name").trim(),
        } : null,
        box: box instanceof HTMLElement ? css(box) : null,
        card: card instanceof HTMLElement ? css(card) : null,
      };
    };
    window.addEventListener("scroll", () => resolve(state()), { capture: true, once: true });
    window.scrollBy({ top: 32, behavior: "instant" });
  }));

  assert(immediate.target && immediate.box && immediate.card, "Typography immediate scroll state must be complete");
  assertSameBox(immediate.box.rect, immediate.target.rect, "Typography in scroll event");
  assertSameOffset(
    cardOffsetBefore,
    relativeOffset(immediate.target.rect, immediate.card.rect),
    "Typography card in scroll event",
  );

  await new Promise((resolve) => setTimeout(resolve, 140));
  const settled = await snapshot();
  assertSameBox(settled.box.rect, settled.target.rect, "Typography after scroll settle");
  assertSameOffset(
    cardOffsetBefore,
    relativeOffset(settled.target.rect, settled.card.rect),
    "Typography card after scroll settle",
  );
  assert.equal(settled.box.nativeAnchor, "box", "Typography box must settle onto native box anchoring");
  assert.equal(settled.card.nativeAnchor, "offset", "Typography card must settle onto native offset anchoring");
  assert.equal(settled.box.nativeOwner, "typography", "Typography box native owner");
  assert.equal(settled.card.nativeOwner, "typography", "Typography card native owner");

  console.log(JSON.stringify({ before, immediate, settled }, null, 2));
  console.log("Standalone Typography stays target-locked during scroll and after native-anchor settle: PASS");
} finally {
  await browser.close();
}
