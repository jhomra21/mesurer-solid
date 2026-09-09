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

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const waitForScrollIdle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 140));
  await settle();
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.waitFor({ state: "visible" });
  await select.click();

  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetBox = await box(target, "target before direct edit");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const editor = page.locator("[data-mesurer-text-editor='true']");
  const highlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
  await editor.waitFor({ state: "attached" });
  await highlight.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector("[data-mesurer-text-selection-highlight='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "offset"
  ));

  targetBox = await box(target, "target before selected-text settle probe");
  const highlightBefore = await box(highlight, "selected-text highlight before scroll");
  const offsetBefore = relativeOffset(targetBox, highlightBefore);

  await page.evaluate(() => window.scrollBy({ top: 48, behavior: "instant" }));
  await waitForScrollIdle();

  targetBox = await box(target, "target after selected-text scroll settles");
  const highlightAfter = await box(highlight, "selected-text highlight after scroll settles");
  const offsetAfter = relativeOffset(targetBox, highlightAfter);
  assertSameOffset(offsetBefore, offsetAfter, "selected-text highlight after scroll settle");

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });

  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  await typography.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await box(target, "target before standalone Typography probe");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const typographyBox = page.locator(".mesurer-ti-box[data-state='visible']");
  const typographyCard = page.locator(".mesurer-ti-card[data-state='visible']");
  await typographyBox.waitFor({ state: "visible" });
  await typographyCard.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector(".mesurer-ti-box[data-state='visible']")?.getAttribute("data-mesurer-native-scroll-anchor") === "box"
  ));

  assertSameBox(await box(typographyBox, "Typography box before scroll"), targetBox, "Typography box before scroll");
  const cardBefore = await box(typographyCard, "Typography card before scroll");
  const cardOffsetBefore = relativeOffset(targetBox, cardBefore);

  const immediate = await page.evaluate(() => new Promise((resolve, reject) => {
    const targetElement = document.querySelector("#isolated-scroll-target");
    const typographySurface = document.querySelector(".mesurer-ti-box[data-state='visible']");
    const typographyPanel = document.querySelector(".mesurer-ti-card[data-state='visible']");
    if (!(targetElement instanceof HTMLElement)) return reject(new Error("Expected target for Typography scroll probe"));
    if (!(typographySurface instanceof HTMLElement)) return reject(new Error("Expected Typography box for scroll probe"));
    if (!(typographyPanel instanceof HTMLElement)) return reject(new Error("Expected Typography card for scroll probe"));
    const snapshot = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    window.addEventListener("scroll", () => resolve({
      target: snapshot(targetElement),
      typographyBox: snapshot(typographySurface),
      typographyCard: snapshot(typographyPanel),
    }), { capture: true, once: true });
    window.scrollBy({ top: 32, behavior: "instant" });
  }));

  assertSameBox(immediate.typographyBox, immediate.target, "standalone Typography box in scroll event");
  assertSameOffset(
    cardOffsetBefore,
    relativeOffset(immediate.target, immediate.typographyCard),
    "standalone Typography card in scroll event",
  );

  await waitForScrollIdle();
  targetBox = await box(target, "target after standalone Typography scroll settles");
  assertSameBox(
    await box(typographyBox, "Typography box after scroll settles"),
    targetBox,
    "standalone Typography box after scroll settles",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Native selected-text and standalone Typography surfaces stay stable through scroll settle: PASS");
} finally {
  await browser.close();
}
