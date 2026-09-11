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

const selectionSnapshot = () => page.evaluate(async () => {
  const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
  if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
  const context = await subject.context();
  return {
    scope: context.scope.kind,
    targets: context.targets.map((target) => ({
      selector: target.inspection.selector,
      tag: target.inspection.tag,
      id: target.inspection.id,
    })),
  };
});

const shadowGeometry = () => page.evaluate(() => {
  const host = document.querySelector("#shadow-scroll-host");
  const root = host?.shadowRoot;
  const scroller = root?.querySelector("#shadow-scroll-shell");
  const target = root?.querySelector("#isolated-shadow-scroll-target");
  const trigger = document.querySelector("[data-mesurer-annotation-trigger='true']");
  if (!(scroller instanceof HTMLElement)) throw new Error("Expected cross-shadow scroller");
  if (!(target instanceof HTMLElement)) throw new Error("Expected cross-shadow target");
  if (!(trigger instanceof HTMLElement)) throw new Error("Expected annotation trigger");
  const snapshot = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  return {
    scroller: snapshot(scroller),
    target: snapshot(target),
    surface: snapshot(trigger),
  };
});

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const select = page.locator("button[data-mesurer-builtin='select']");
  await select.click();

  // Reproduce the user's actual failure through the public mounted UI. Open
  // direct Typography editing, click the visible card itself, then verify the
  // selected page element is still the selected page element. No DOM hit-test
  // mock or implementation attribute is accepted as proof.
  const target = page.locator("#isolated-scroll-target");
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  let targetRect = await box(target, "page target before Typography");
  await page.mouse.click(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2);

  const selectedChrome = page.locator("[data-mesurer-selected-measurement='true']").first();
  await selectedChrome.waitFor({ state: "visible" });
  const selectionBeforeTypography = await selectionSnapshot();
  assert.equal(selectionBeforeTypography.scope, "selection", "expected selection-scoped context before Typography");
  assert.deepEqual(
    selectionBeforeTypography.targets.map(({ id }) => id),
    ["isolated-scroll-target"],
    "the actual page target should be selected before Typography opens",
  );

  await page.mouse.dblclick(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2);
  const editor = page.locator("[data-mesurer-text-editor='true']");
  const inspectorCard = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await inspectorCard.waitFor({ state: "visible" });

  // Playwright actionability is intentional here: the click must physically
  // land on the rendered Typography surface in the real isolated ShadowRoot.
  await inspectorCard.click({ position: { x: 8, y: 8 } });
  await settle();

  const selectionAfterTypography = await selectionSnapshot();
  assert.deepEqual(
    selectionAfterTypography.targets,
    selectionBeforeTypography.targets,
    "clicking the rendered Typography card must not retarget Select to Mesurer UI",
  );
  assert.equal(await editor.count(), 1, "Typography click must keep the active page editor open");
  targetRect = await box(target, "page target after Typography click");
  assertSameBox(
    await box(selectedChrome, "selected page target after Typography click"),
    targetRect,
    "Typography click must leave selection chrome on the page target",
  );

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });

  // Reproduce the annotation failure in the topology that used to escape the
  // green suite: inspected content in a different ShadowRoot and overflow
  // scroller, while Mesurer remains isolated. Scroll it the way a user does and
  // require the visible annotation button to remain attached to the same target.
  const shadowHost = page.locator("#shadow-scroll-host");
  await shadowHost.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.evaluate(() => {
    const host = document.querySelector("#shadow-scroll-host");
    const scroller = host?.shadowRoot?.querySelector("#shadow-scroll-shell");
    if (!(scroller instanceof HTMLElement)) throw new Error("Expected cross-shadow scroller before selection");
    scroller.scrollTop = 340;
  });
  await settle();

  let shadow = await page.evaluate(() => {
    const host = document.querySelector("#shadow-scroll-host");
    const targetElement = host?.shadowRoot?.querySelector("#isolated-shadow-scroll-target");
    if (!(targetElement instanceof HTMLElement)) throw new Error("Expected cross-shadow target before selection");
    const rect = targetElement.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.click(shadow.x + shadow.width / 2, shadow.y + shadow.height / 2);

  const annotationTrigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await annotationTrigger.waitFor({ state: "visible" });
  let geometry = await shadowGeometry();
  let gap = boxGap(geometry.target, geometry.surface);
  assert(gap >= 5.5 && gap <= 6.5, `annotation should start at 6px clearance; gap=${gap.toFixed(2)}px`);

  const beforeNested = geometry;
  await page.mouse.move(
    geometry.scroller.x + Math.min(40, geometry.scroller.width / 2),
    geometry.scroller.y + Math.min(40, geometry.scroller.height / 2),
  );
  await page.mouse.wheel(0, 72);
  await settle();
  geometry = await shadowGeometry();
  assertRelativeOffset(beforeNested, geometry, "annotation during nested ShadowRoot scrolling");
  gap = boxGap(geometry.target, geometry.surface);
  assert(gap >= 5.5 && gap <= 6.5, `annotation should keep 6px nested-scroll clearance; gap=${gap.toFixed(2)}px`);

  const beforeWindow = geometry;
  await page.mouse.move(8, 8);
  await page.mouse.wheel(0, 80);
  await settle();
  geometry = await shadowGeometry();
  assertRelativeOffset(beforeWindow, geometry, "annotation during window scrolling");
  gap = boxGap(geometry.target, geometry.surface);
  assert(gap >= 5.5 && gap <= 6.5, `annotation should keep 6px window-scroll clearance; gap=${gap.toFixed(2)}px`);

  const shadowSelection = await selectionSnapshot();
  assert.deepEqual(
    shadowSelection.targets.map(({ id }) => id),
    ["isolated-shadow-scroll-target"],
    "scrolling must not change the actual selected page target",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Manual rejection scenarios pass end-to-end: Typography cannot become the selected page target, and annotation stays attached through real nested and window scrolling.");
} finally {
  await browser.close();
}
