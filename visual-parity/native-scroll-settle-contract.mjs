import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";
const WAIT_TIMEOUT_MS = 5_000;
const HARD_TIMEOUT_MS = 60_000;
const VIEWPORT = { width: 1280, height: 900 };

const hardTimeout = setTimeout(() => {
  console.error(`native-scroll-settle contract exceeded ${HARD_TIMEOUT_MS}ms`);
  process.exit(124);
}, HARD_TIMEOUT_MS);

const withTimeout = (promise, stage, timeoutMs = WAIT_TIMEOUT_MS) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`${stage} exceeded ${timeoutMs}ms`)),
    timeoutMs,
  )),
]);

const stage = (name) => console.log(`[native-scroll-settle] ${name}`);

const browser = await chromium.launch({ headless: true });
const browserErrors = [];

const openFixture = async (name) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(10_000);
  page.on("pageerror", (error) => browserErrors.push(`${name}: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`${name}: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject),
    undefined,
    { timeout: WAIT_TIMEOUT_MS },
  );
  return { context, page };
};

const closeContext = (context, name) => withTimeout(context.close(), `${name} context close`, 5_000);

const box = async (locator, name) => {
  const value = await withTimeout(locator.boundingBox(), `${name} geometry`);
  assert(value, `${name}: expected rendered geometry`);
  return value;
};

const assertSameBox = (actual, expected, name) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= 1.5,
      `${name}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const relativeOffset = (target, surface) => ({
  x: surface.x - target.x,
  y: surface.y - target.y,
});

const assertSameOffset = (before, after, name) => {
  for (const key of ["x", "y"]) {
    assert(
      Math.abs(after[key] - before[key]) <= 1.5,
      `${name}: ${key} offset changed; before=${before[key]} after=${after[key]}`,
    );
  }
};

const settle = (page, name) => withTimeout(
  page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  })),
  `${name} animation-frame settle`,
);

const waitForScrollIdle = async (page, name) => {
  await new Promise((resolve) => setTimeout(resolve, 140));
  await settle(page, name);
};

const verifySelectedTextSettle = async () => {
  stage("selected-text: load fresh fixture");
  const { context, page } = await openFixture("selected-text");
  try {
    stage("selected-text: enter select mode");
    const select = page.locator("button[data-mesurer-builtin='select']");
    await select.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
    await select.click({ timeout: WAIT_TIMEOUT_MS });

    stage("selected-text: open direct edit");
    const target = page.locator("#isolated-scroll-target");
    await withTimeout(
      target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" })),
      "selected-text target scrollIntoView",
    );
    await settle(page, "selected-text target");
    let targetBox = await box(target, "target before direct edit");
    await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

    const editor = page.locator("[data-mesurer-text-editor='true']");
    const highlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
    await editor.waitFor({ state: "attached", timeout: WAIT_TIMEOUT_MS });
    await highlight.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
    await page.waitForFunction(
      () => document.querySelector("[data-mesurer-text-selection-highlight='true']")?.getAttribute("data-mesurer-native-scroll-anchor") === "offset",
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );

    stage("selected-text: verify post-scroll settle stability");
    targetBox = await box(target, "target before selected-text settle probe");
    const highlightBefore = await box(highlight, "selected-text highlight before scroll");
    const offsetBefore = relativeOffset(targetBox, highlightBefore);

    await withTimeout(
      page.evaluate(() => window.scrollBy({ top: 48, behavior: "instant" })),
      "selected-text scroll",
    );
    await waitForScrollIdle(page, "selected-text");

    targetBox = await box(target, "target after selected-text scroll settles");
    const highlightAfter = await box(highlight, "selected-text highlight after scroll settles");
    const offsetAfter = relativeOffset(targetBox, highlightAfter);
    assertSameOffset(offsetBefore, offsetAfter, "selected-text highlight after scroll settle");
  } finally {
    await closeContext(context, "selected-text");
  }
};

const verifyStandaloneTypography = async () => {
  stage("Typography: load fresh fixture");
  const { context, page } = await openFixture("Typography");
  try {
    stage("Typography: activate standalone inspector");
    const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
    await typography.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
    // This is a fresh automation page dedicated to Typography. The separate
    // selected-text page above owns the direct-edit transition coverage, so no
    // stale element/input handle survives across top-level tool reconciliation.
    await withTimeout(typography.evaluate((button) => button.click()), "Typography activation");
    await page.waitForFunction(
      () => window.__MESURER_ISOLATED_SCROLL_TEST__?.subject?.root
        ?.querySelector("button[data-mesurer-builtin='text-inspector']")
        ?.getAttribute("aria-pressed") === "true",
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );

    const target = page.locator("#isolated-scroll-target");
    await withTimeout(
      target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" })),
      "Typography target scrollIntoView",
    );
    await settle(page, "Typography target");
    let targetBox = await box(target, "target before standalone Typography probe");
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

    const typographyBox = page.locator(".mesurer-ti-box[data-state='visible']");
    const typographyCard = page.locator(".mesurer-ti-card[data-state='visible']");
    await typographyBox.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
    await typographyCard.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
    await page.waitForFunction(
      () => document.querySelector(".mesurer-ti-box[data-state='visible']")?.getAttribute("data-mesurer-native-scroll-anchor") === "box",
      undefined,
      { timeout: WAIT_TIMEOUT_MS },
    );

    assertSameBox(await box(typographyBox, "Typography box before scroll"), targetBox, "Typography box before scroll");
    const cardBefore = await box(typographyCard, "Typography card before scroll");
    const cardOffsetBefore = relativeOffset(targetBox, cardBefore);

    stage("Typography: verify immediate scroll stability");
    const immediate = await withTimeout(page.evaluate(({ timeoutMs }) => new Promise((resolve, reject) => {
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
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const deltaY = window.scrollY + 32 <= maxScrollY ? 32 : window.scrollY >= 32 ? -32 : 0;
      if (!deltaY) return reject(new Error("Expected available document scroll range for Typography probe"));

      const timer = window.setTimeout(() => {
        reject(new Error(`Typography scroll probe did not receive a scroll event within ${timeoutMs}ms`));
      }, timeoutMs);
      window.addEventListener("scroll", () => {
        window.clearTimeout(timer);
        resolve({
          target: snapshot(targetElement),
          typographyBox: snapshot(typographySurface),
          typographyCard: snapshot(typographyPanel),
        });
      }, { capture: true, once: true });
      window.scrollBy({ top: deltaY, behavior: "instant" });
    }), { timeoutMs: WAIT_TIMEOUT_MS }), "Typography immediate scroll probe");

    assertSameBox(immediate.typographyBox, immediate.target, "standalone Typography box in scroll event");
    assertSameOffset(
      cardOffsetBefore,
      relativeOffset(immediate.target, immediate.typographyCard),
      "standalone Typography card in scroll event",
    );

    stage("Typography: verify post-settle stability");
    await waitForScrollIdle(page, "Typography");
    targetBox = await box(target, "target after standalone Typography scroll settles");
    assertSameBox(
      await box(typographyBox, "Typography box after scroll settles"),
      targetBox,
      "standalone Typography box after scroll settles",
    );
  } finally {
    await closeContext(context, "Typography");
  }
};

try {
  await verifySelectedTextSettle();
  await verifyStandaloneTypography();
  assert.deepEqual(browserErrors, [], `browser diagnostics: ${browserErrors.join("\n")}`);
  stage("PASS");
  console.log("Native selected-text and standalone Typography surfaces stay stable through scroll settle: PASS");
} finally {
  clearTimeout(hardTimeout);
  stage("close browser");
  await withTimeout(browser.close(), "browser close", 5_000).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
