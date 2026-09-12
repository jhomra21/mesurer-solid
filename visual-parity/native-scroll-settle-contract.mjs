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
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));
  return { context, page };
};

const settle = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const waitForScrollIdle = async (page) => {
  await page.waitForTimeout(140);
  await settle(page);
};

const box = async (locator, name) => {
  const value = await locator.boundingBox();
  assert(value, `${name}: expected rendered geometry`);
  return value;
};

const relativeOffset = (target, surface) => ({
  x: surface.x - target.x,
  y: surface.y - target.y,
});

const assertSameOffset = (beforeTarget, beforeSurface, afterTarget, afterSurface, name, tolerance = 1.5) => {
  const before = relativeOffset(beforeTarget, beforeSurface);
  const after = relativeOffset(afterTarget, afterSurface);
  for (const key of ["x", "y"]) {
    assert(
      Math.abs(after[key] - before[key]) <= tolerance,
      `${name}: ${key} offset changed; before=${before[key]} after=${after[key]}`,
    );
  }
};

const assertSameBox = (actual, expected, name, tolerance = 1.5) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${name}: ${key} drifted; expected=${expected[key]} actual=${actual[key]}`,
    );
  }
};

const assertMoved = (before, after, name, minimum = 15) => {
  assert(
    Math.hypot(after.x - before.x, after.y - before.y) >= minimum,
    `${name}: expected visible movement; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
};

const verifyDirectEditSettle = async () => {
  stage("direct-edit: load fresh isolated fixture");
  const { context, page } = await openFixture("direct-edit");
  try {
    const select = page.locator("button[data-mesurer-builtin='select']");
    await select.click();

    const target = page.locator("#isolated-scroll-target");
    await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await settle(page);
    let targetBox = await box(target, "direct-edit target before opening");
    await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

    const editor = page.locator("[data-mesurer-text-editor='true']");
    const ring = page.locator("[data-mesurer-text-edit-ring='true']");
    const highlight = page.locator("[data-mesurer-text-selection-highlight='true']").first();
    const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
    await editor.waitFor({ state: "visible" });
    await ring.waitFor({ state: "visible" });
    await highlight.waitFor({ state: "visible" });
    await inspector.waitFor({ state: "visible" });

    const before = {
      target: await box(target, "direct-edit target before wheel"),
      ring: await box(ring, "direct-edit ring before wheel"),
      highlight: await box(highlight, "direct-edit highlight before wheel"),
      inspector: await box(inspector, "direct-edit Typography before wheel"),
    };

    stage("direct-edit: real wheel then wait past scroll-idle settle");
    await page.mouse.wheel(0, 64);
    await waitForScrollIdle(page);

    const after = {
      target: await box(target, "direct-edit target after settle"),
      ring: await box(ring, "direct-edit ring after settle"),
      highlight: await box(highlight, "direct-edit highlight after settle"),
      inspector: await box(inspector, "direct-edit Typography after settle"),
    };
    assertMoved(before.target, after.target, "direct-edit source under wheel scroll");
    assertSameBox(after.ring, after.target, "direct-edit ring after scroll settle");
    assertSameOffset(before.target, before.highlight, after.target, after.highlight, "direct-edit highlight after scroll settle");
    assertSameOffset(before.target, before.inspector, after.target, after.inspector, "direct-edit Typography after scroll settle");

    stage("direct-edit: source and Typography leave viewport together");
    await page.mouse.wheel(0, 1200);
    await waitForScrollIdle(page);
    targetBox = await box(target, "direct-edit source after leaving viewport");
    assert(targetBox.y + targetBox.height < 1, `direct-edit source should be above viewport: ${JSON.stringify(targetBox)}`);
    const inspectorAfterExit = await inspector.boundingBox();
    if (inspectorAfterExit) {
      assert(
        inspectorAfterExit.y + inspectorAfterExit.height < 1 || inspectorAfterExit.y >= VIEWPORT.height,
        `direct-edit Typography stayed in viewport after source left: ${JSON.stringify(inspectorAfterExit)}`,
      );
    }
  } finally {
    await context.close();
  }
};

const verifyStandaloneTypographySettle = async () => {
  stage("standalone: load fresh isolated fixture");
  const { context, page } = await openFixture("standalone");
  try {
    const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
    await typography.click();

    const target = page.locator("#isolated-scroll-target");
    await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await settle(page);
    let targetBox = await box(target, "standalone target before hover");
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

    const hoverBox = page.locator(".mesurer-ti-box[data-state='visible']").first();
    const hoverCard = page.locator(".mesurer-ti-card[data-state='visible']").first();
    await hoverBox.waitFor({ state: "visible" });
    await hoverCard.waitFor({ state: "visible" });

    const hoverBefore = {
      target: await box(target, "standalone target before wheel"),
      surface: await box(hoverBox, "standalone Typography box before wheel"),
      card: await box(hoverCard, "standalone Typography card before wheel"),
    };
    assertSameBox(hoverBefore.surface, hoverBefore.target, "standalone Typography box before wheel");

    stage("standalone: hover card follows source through settled wheel scroll");
    await page.mouse.wheel(0, 48);
    await waitForScrollIdle(page);
    const hoverAfter = {
      target: await box(target, "standalone target after wheel"),
      surface: await box(hoverBox, "standalone Typography box after wheel"),
      card: await box(hoverCard, "standalone Typography card after wheel"),
    };
    assertMoved(hoverBefore.target, hoverAfter.target, "standalone Typography source under wheel scroll");
    assertSameBox(hoverAfter.surface, hoverAfter.target, "standalone Typography box after scroll settle");
    assertSameOffset(hoverBefore.target, hoverBefore.card, hoverAfter.target, hoverAfter.card, "standalone Typography card after scroll settle");

    stage("standalone: click-pinned card remains source-linked until dragged");
    targetBox = hoverAfter.target;
    await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    const pinnedCard = page.locator(".mesurer-ti-card:has(.mesurer-ti-close)").first();
    await pinnedCard.waitFor({ state: "visible" });

    const pinnedBefore = {
      target: await box(target, "click-pinned source before wheel"),
      card: await box(pinnedCard, "click-pinned Typography card before wheel"),
    };
    await page.mouse.wheel(0, 48);
    await waitForScrollIdle(page);
    const pinnedAfter = {
      target: await box(target, "click-pinned source after wheel"),
      card: await box(pinnedCard, "click-pinned Typography card after wheel"),
    };
    assertMoved(pinnedBefore.target, pinnedAfter.target, "click-pinned source under wheel scroll");
    assertSameOffset(pinnedBefore.target, pinnedBefore.card, pinnedAfter.target, pinnedAfter.card, "click-pinned Typography follows source after settle");

    stage("standalone: explicit drag detaches card into manual viewport placement");
    const dragStart = pinnedAfter.card;
    await page.mouse.move(dragStart.x + dragStart.width / 2, dragStart.y + 20);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + dragStart.width / 2 + 80, dragStart.y + 60, { steps: 6 });
    await page.mouse.up();
    await settle(page);

    const draggedBeforeScroll = await box(pinnedCard, "dragged Typography card before viewport-stability probe");
    assertMoved(dragStart, draggedBeforeScroll, "dragged Typography card", 20);
    const sourceBeforeDetachedScroll = await box(target, "source before detached-card scroll");

    await page.mouse.wheel(0, 48);
    await waitForScrollIdle(page);
    const draggedAfterScroll = await box(pinnedCard, "dragged Typography card after viewport-stability probe");
    const sourceAfterDetachedScroll = await box(target, "source after detached-card scroll");
    assertMoved(sourceBeforeDetachedScroll, sourceAfterDetachedScroll, "source after detached-card wheel scroll");
    assertSameBox(draggedAfterScroll, draggedBeforeScroll, "explicitly dragged Typography card stays at manual viewport position");
  } finally {
    await context.close();
  }
};

try {
  await verifyDirectEditSettle();
  await verifyStandaloneTypographySettle();
  assert.deepEqual(browserErrors, [], `browser diagnostics: ${browserErrors.join("\n")}`);
  stage("PASS");
  console.log("Native scroll-settle E2E passed: direct-edit, hover, and click-pinned Typography follow their source; only a real dragged pin becomes viewport-stable.");
} finally {
  clearTimeout(hardTimeout);
  stage("close browser");
  await browser.close().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
