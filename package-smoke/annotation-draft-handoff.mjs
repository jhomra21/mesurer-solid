import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192";
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
  await page.waitForFunction(() => Boolean(window.__HOST_READY__ && window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await page.waitForFunction(() => Boolean(
    document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"),
  ));

  await page.evaluate(() => {
    document.querySelector("#packed-annotation-handoff-target")?.remove();
    const target = document.createElement("button");
    target.id = "packed-annotation-handoff-target";
    target.type = "button";
    target.textContent = "Packed handoff target B";
    Object.assign(target.style, {
      position: "absolute",
      left: "800px",
      top: "650px",
      width: "260px",
      height: "72px",
      border: "1px solid #cbd5e1",
      borderRadius: "12px",
      background: "white",
      color: "#0f172a",
      font: "18px/1.3 ui-sans-serif, system-ui, sans-serif",
      zIndex: "1",
    });
    document.body.append(target);
  });

  await page.evaluate(async () => {
    await window.__MESURER__.command("builtin.select");
    await window.__MESURER__.select("[data-testid='consumer-counter']");
  });
  await settle();

  const trigger = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']",
  );
  const composer = page.locator(
    "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-composer='true']",
  );
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  await clickCenter(trigger, "packed selection A Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  await composer.locator("textarea").fill("abandoned draft A");

  const second = page.locator("#packed-annotation-handoff-target");
  const secondBox = await second.boundingBox();
  assert(secondBox, "packed selection B must have rendered geometry");
  const secondPoint = {
    x: secondBox.x + secondBox.width / 2,
    y: secondBox.y + secondBox.height / 2,
  };

  await page.mouse.move(secondPoint.x, secondPoint.y);
  await page.mouse.down();
  await composer.waitFor({ state: "detached", timeout: 1200 });
  await page.mouse.up();
  await settle();

  const selection = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));
  assert.equal(selection.targets.length, 1, "packed physical B click must leave one selected target");
  assert.equal(
    selection.targets[0]?.inspection.id,
    "packed-annotation-handoff-target",
    `packed physical B click must transfer selection to B: ${JSON.stringify(selection.targets)}`,
  );

  await trigger.waitFor({ state: "visible", timeout: 3000 });
  const handoff = await trigger.evaluate((element) => {
    const target = document.querySelector("#packed-annotation-handoff-target");
    if (!(target instanceof HTMLElement)) throw new Error("Missing packed B target");
    const targetRect = target.getBoundingClientRect();
    const triggerRect = element.getBoundingClientRect();
    return {
      mode: element.dataset.mesurerAnnotationScrollMode ?? null,
      target: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
      trigger: { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height },
    };
  });
  assert.equal(
    handoff.mode,
    "cached-delta",
    `packed handoff trigger must use the stable restored-selection path: ${JSON.stringify(handoff)}`,
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
    Math.hypot(targetCenter.x - triggerCenter.x, targetCenter.y - triggerCenter.y) < 200,
    `packed restored Add Note trigger must belong to B: ${JSON.stringify(handoff)}`,
  );

  await clickCenter(trigger, "packed selection B Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "packed selection B must not inherit A's abandoned draft",
  );

  assert.deepEqual(errors, [], `packed annotation handoff browser diagnostics: ${errors.join("\n")}`);
  console.log("Packed Solid 2 annotation draft handoff: PASS", {
    composerDismissedOnPointerDown: true,
    selectionTransferredOnPointerUp: true,
    restoredTriggerMode: handoff.mode,
    draftCleared: true,
  });
} finally {
  await browser.close();
}
