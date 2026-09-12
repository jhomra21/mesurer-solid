import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/";
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

const waitForScrollIdle = async () => {
  await page.waitForTimeout(140);
  await settle();
};

const box = async (locator, stage) => {
  const value = await locator.boundingBox();
  assert(value, `${stage}: expected rendered geometry`);
  return value;
};

const assertSameBox = (actual, expected, stage, tolerance = 1.5) => {
  for (const key of ["x", "y", "width", "height"]) {
    assert(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${stage}: ${key} drifted; target=${expected[key]} surface=${actual[key]}`,
    );
  }
};

const assertSameOffset = (beforeTarget, beforeSurface, afterTarget, afterSurface, stage, tolerance = 1.5) => {
  for (const key of ["x", "y"]) {
    const before = beforeSurface[key] - beforeTarget[key];
    const after = afterSurface[key] - afterTarget[key];
    assert(
      Math.abs(after - before) <= tolerance,
      `${stage}: ${key} offset changed; before=${before} after=${after}`,
    );
  }
};

const assertMoved = (before, after, stage, minimum = 15) => {
  assert(
    Math.hypot(after.x - before.x, after.y - before.y) >= minimum,
    `${stage}: expected rendered movement; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
};

const sampleRealWheel = async (deltaY, selectors) => {
  const samplePromise = page.evaluate(({ selectors: requested }) => new Promise((resolve, reject) => {
    const snapshot = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => Object.fromEntries(
      Object.entries(requested).map(([name, selector]) => [name, snapshot(document.querySelector(selector))]),
    );
    const before = state();
    if (!before.target) return reject(new Error("real-wheel probe expected target geometry"));
    const timer = window.setTimeout(() => reject(new Error("real-wheel probe did not receive a scroll event")), 3000);
    window.addEventListener("scroll", () => {
      window.clearTimeout(timer);
      resolve({ before, after: state(), scrollY: window.scrollY });
    }, { capture: true, once: true });
  }), { selectors });

  await page.mouse.wheel(0, deltaY);
  return samplePromise;
};

const monitorWheelContinuity = async (deltaY, selectors, durationMs = 220) => {
  const monitor = page.evaluate(({ selectors: requested, durationMs: duration }) => new Promise((resolve, reject) => {
    const snapshot = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const state = () => Object.fromEntries(
      Object.entries(requested).map(([name, selector]) => [name, snapshot(document.querySelector(selector))]),
    );
    const before = state();
    if (!before.target) return reject(new Error("continuity probe expected target geometry before wheel"));
    const frames = [];
    let startedAt = 0;
    const timeout = window.setTimeout(() => reject(new Error("continuity probe did not receive a scroll event")), 3000);
    const tick = (now) => {
      frames.push({ at: now - startedAt, state: state() });
      if (now - startedAt >= duration) {
        window.clearTimeout(timeout);
        resolve({ before, frames, after: state() });
        return;
      }
      requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", () => {
      startedAt = performance.now();
      requestAnimationFrame(tick);
    }, { capture: true, once: true });
  }), { selectors, durationMs });

  await page.mouse.wheel(0, deltaY);
  return monitor;
};

try {
  await page.goto(url, { waitUntil: "networkidle" });

  const arrange = page.locator("button[data-mesurer-tool-id='arrange']");
  const target = page.locator(".feature-copy .kicker");
  await arrange.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();

  let targetBox = await box(target, "target before selection");
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const selected = page.locator("[data-mesurer-selected-measurement='true'] > div").first();
  await selected.waitFor({ state: "visible" });
  assertSameBox(await box(selected, "selection before wheel"), targetBox, "selection before wheel");

  const selectedWheel = await sampleRealWheel(80, {
    target: ".feature-copy .kicker",
    selected: "[data-mesurer-selected-measurement='true'] > div",
  });
  assert(selectedWheel.before.selected && selectedWheel.after.selected, "selection wheel probe expected selected geometry");
  assertMoved(selectedWheel.before.target, selectedWheel.after.target, "selected page target under real wheel");
  assertSameBox(selectedWheel.before.selected, selectedWheel.before.target, "selection at wheel start");
  assertSameBox(selectedWheel.after.selected, selectedWheel.after.target, "selection inside wheel scroll event");

  targetBox = selectedWheel.after.target;
  await page.mouse.dblclick(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const editor = page.locator("[data-mesurer-text-editor='true']");
  const ring = page.locator("[data-mesurer-text-edit-ring='true']");
  const inspector = page.locator("[data-mesurer-text-inspector-info='true']");
  await editor.waitFor({ state: "visible" });
  await ring.waitFor({ state: "visible" });
  await inspector.waitFor({ state: "visible" });

  // Change rendered geometry through an actual Typography control before the
  // scroll probe. This recreates the reported settle boundary where selection
  // chrome previously appeared to disappear while measurement state refreshed.
  const lineInput = inspector.locator("[data-mesurer-text-style-input='line']");
  await lineInput.waitFor({ state: "visible" });
  const lineBefore = await target.evaluate((element) => getComputedStyle(element).lineHeight);
  const desiredLine = lineBefore === "36px" ? "42px" : "36px";
  const lineBox = await box(lineInput, "Typography Line control before continuity probe");
  await page.mouse.click(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(desiredLine);
  await page.keyboard.press("Enter");
  await settle();
  assert.equal(
    await target.evaluate((element) => getComputedStyle(element).lineHeight),
    desiredLine,
    "Typography Line control did not change target geometry before continuity probe",
  );
  const continuityStartTarget = await box(target, "target before continuous wheel probe");
  const continuityStartSelected = await box(selected, "selection before continuous wheel probe");
  const continuityStartRing = await box(ring, "edit ring before continuous wheel probe");
  const continuityStartInspector = await box(inspector, "Typography card before continuous wheel probe");
  assertSameBox(continuityStartSelected, continuityStartTarget, "selection before continuous wheel probe");
  assertSameBox(continuityStartRing, continuityStartTarget, "edit ring before continuous wheel probe");

  // Sample every animation frame from the physical wheel event through and past
  // the 80ms live-measurement refresh. This catches a user-visible teardown or
  // one-frame catch-up that start/end-only assertions would miss.
  const continuity = await monitorWheelContinuity(48, {
    target: ".feature-copy .kicker",
    selected: "[data-mesurer-selected-measurement='true'] > div",
    ring: "[data-mesurer-text-edit-ring='true']",
    inspector: "[data-mesurer-text-inspector-info='true']",
  });
  assert(continuity.frames.length >= 4, `expected multiple continuity frames, got ${continuity.frames.length}`);
  let moved = false;
  for (const [index, frame] of continuity.frames.entries()) {
    const current = frame.state;
    for (const name of ["target", "selected", "ring", "inspector"]) {
      assert(current[name], `continuity frame ${index} at ${frame.at.toFixed(1)}ms lost rendered ${name}`);
    }
    if (Math.abs(current.target.y - continuity.before.target.y) > 15) moved = true;
    assertSameBox(current.selected, current.target, `selection continuity frame ${index}`);
    assertSameBox(current.ring, current.target, `edit-ring continuity frame ${index}`);
    assertSameOffset(
      continuity.before.target,
      continuity.before.inspector,
      current.target,
      current.inspector,
      `Typography continuity frame ${index}`,
      2,
    );
  }
  assert(moved, "continuous wheel probe did not materially move the page target");

  await waitForScrollIdle();
  const settledTarget = await box(target, "direct-edit target after scroll settle");
  assertSameBox(await box(selected, "selection after scroll settle"), settledTarget, "selection after scroll settle");
  assertSameBox(await box(ring, "edit ring after scroll settle"), settledTarget, "edit ring after scroll settle");
  assertSameOffset(
    continuity.before.target,
    continuity.before.inspector,
    settledTarget,
    await box(inspector, "Typography card after scroll settle"),
    "Typography card after scroll settle",
    2,
  );

  await editor.focus();
  await page.keyboard.press("Escape");
  await editor.waitFor({ state: "detached" });
  await arrange.click();

  const typography = page.locator("button[data-mesurer-builtin='text-inspector']");
  await typography.click();
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await settle();
  targetBox = await box(target, "standalone Typography target before hover");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

  const typographyBox = page.locator(".mesurer-ti-box[data-state='visible']").first();
  const typographyCard = page.locator(".mesurer-ti-card[data-state='visible']").first();
  await typographyBox.waitFor({ state: "visible" });
  await typographyCard.waitFor({ state: "visible" });

  const typographyWheel = await sampleRealWheel(48, {
    target: ".feature-copy .kicker",
    typographyBox: ".mesurer-ti-box[data-state='visible']",
    typographyCard: ".mesurer-ti-card[data-state='visible']",
  });
  assert(typographyWheel.before.typographyBox && typographyWheel.after.typographyBox, "standalone wheel probe expected Typography box geometry");
  assert(typographyWheel.before.typographyCard && typographyWheel.after.typographyCard, "standalone wheel probe expected Typography card geometry");
  assertMoved(typographyWheel.before.target, typographyWheel.after.target, "standalone Typography target under real wheel");
  assertSameBox(typographyWheel.before.typographyBox, typographyWheel.before.target, "standalone Typography box at wheel start");
  assertSameBox(typographyWheel.after.typographyBox, typographyWheel.after.target, "standalone Typography box inside wheel event");
  assertSameOffset(
    typographyWheel.before.target,
    typographyWheel.before.typographyCard,
    typographyWheel.after.target,
    typographyWheel.after.typographyCard,
    "standalone Typography card inside wheel event",
  );

  await waitForScrollIdle();
  const typographySettledTarget = await box(target, "standalone Typography target after settle");
  assertSameBox(
    await box(typographyBox, "standalone Typography box after settle"),
    typographySettledTarget,
    "standalone Typography box after settle",
  );
  assertSameOffset(
    typographyWheel.before.target,
    typographyWheel.before.typographyCard,
    typographySettledTarget,
    await box(typographyCard, "standalone Typography card after settle"),
    "standalone Typography card after settle",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Selection scroll E2E passed: physical wheel input keeps selection, edit ring, direct-edit Typography, and standalone Typography attached to their real source; animation-frame sampling proves selected chrome does not disappear through the live-measurement settle boundary.");
} finally {
  await browser.close();
}
