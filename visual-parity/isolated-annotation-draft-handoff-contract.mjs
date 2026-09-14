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

const clickCenter = async (locator, label) => {
  const box = await locator.boundingBox();
  assert(box, `${label} must have rendered geometry`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER_ISOLATED_SCROLL_TEST__?.subject));

  const subjectSelect = async (selector) => page.evaluate(async (nextSelector) => {
    const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
    if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
    await subject.select(nextSelector);
  }, selector);

  await page.locator("#isolated-scroll-target").evaluate((element) => element.scrollIntoView({ block: "center" }));
  await settle();

  await page.evaluate(() => {
    document.querySelector("#isolated-annotation-handoff-target")?.remove();
    const target = document.createElement("button");
    target.id = "isolated-annotation-handoff-target";
    target.type = "button";
    target.textContent = "Second annotation selection target";
    Object.assign(target.style, {
      position: "absolute",
      left: "72px",
      top: `${window.scrollY + 690}px`,
      width: "320px",
      height: "64px",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      background: "white",
      color: "#0f172a",
      font: "18px/1.3 ui-sans-serif, system-ui, sans-serif",
    });
    document.body.append(target);
  });

  await subjectSelect("#isolated-scroll-target");
  await settle();

  const trigger = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']",
  );
  const composer = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-composer='true']",
  );
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  await clickCenter(trigger, "first selection Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  await composer.locator("textarea").fill("abandoned draft A");

  const second = page.locator("#isolated-annotation-handoff-target");
  await second.waitFor({ state: "visible" });
  const secondBox = await second.boundingBox();
  assert(secondBox, "second page selection target must have rendered geometry");
  const secondPoint = {
    x: secondBox.x + secondBox.width / 2,
    y: secondBox.y + secondBox.height / 2,
  };

  // This is the real-consumer failure mode: the draft must be abandoned on the
  // external pointerdown itself, before Select consumes pointerup to commit B.
  // If the composer survives pointerdown it can keep owning the interaction and
  // the selection-change subscriber never gets a chance to repair the state.
  await page.mouse.move(secondPoint.x, secondPoint.y);
  await page.mouse.down();
  await composer.waitFor({ state: "detached", timeout: 1200 });
  await page.mouse.up();
  await settle();

  const selectionContext = await page.evaluate(async () => {
    const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
    if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
    return subject.context({ scope: "selection" });
  });
  assert.equal(selectionContext.targets.length, 1, "physical B click must leave exactly one selected context target");
  assert.equal(
    selectionContext.targets[0]?.inspection.id,
    "isolated-annotation-handoff-target",
    `physical B click must transfer selection ownership to B: ${JSON.stringify(selectionContext.targets)}`,
  );

  await trigger.waitFor({ state: "visible", timeout: 3000 });
  await settle();

  const handoff = await page.evaluate(() => {
    const target = document.querySelector("#isolated-annotation-handoff-target");
    const nextTrigger = document.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(target instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) {
      throw new Error("Missing second target or restored Add Note trigger");
    }
    const targetRect = target.getBoundingClientRect();
    const triggerRect = nextTrigger.getBoundingClientRect();
    return {
      target: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
      trigger: { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height },
      mode: nextTrigger.dataset.mesurerAnnotationScrollMode ?? null,
    };
  });
  assert.equal(
    handoff.mode,
    "cached-delta",
    `the first trigger restored after abandoning A must avoid Chromium's stale native-anchor handoff: ${JSON.stringify(handoff)}`,
  );
  const targetCenter = {
    x: handoff.target.left + handoff.target.width / 2,
    y: handoff.target.top + handoff.target.height / 2,
  };
  const triggerCenter = {
    x: handoff.trigger.left + handoff.trigger.width / 2,
    y: handoff.trigger.top + handoff.trigger.height / 2,
  };
  assert(
    Math.hypot(targetCenter.x - triggerCenter.x, targetCenter.y - triggerCenter.y) < 220,
    `restored Add Note trigger must belong to B: ${JSON.stringify(handoff)}`,
  );

  await clickCenter(trigger, "second selection Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "selection handoff must discard A's abandoned annotation draft before B opens",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Isolated annotation draft handoff: PASS", {
    composerDismissedOnPointerDown: true,
    selectionTransferredOnPointerUp: true,
    restoredTriggerMode: handoff.mode,
    draftCleared: true,
  });
} finally {
  await browser.close();
}
