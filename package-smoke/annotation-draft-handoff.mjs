import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const cases = [
  {
    name: "Packed Solid 2 mount",
    url: process.env.SOLID2_PACKAGE_URL ?? "http://127.0.0.1:4192",
  },
  {
    name: "Packed React external injection",
    url: process.env.REACT_URL ?? "http://127.0.0.1:4190",
    injectPath: process.env.REACT_INJECT_SCRIPT_PATH
      ?? "/tmp/mesurer-react/node_modules/mesurer-solid/dist/inject-script.js",
  },
];

const browser = await chromium.launch({ headless: true });

const settle = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickCenter = async (page, locator, label) => {
  const box = await locator.boundingBox();
  assert(box, `${label} must have rendered geometry`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const selectionId = async (page) => {
  const selection = await page.evaluate(() => window.__MESURER__.context({ scope: "selection" }));
  assert.equal(selection.targets.length, 1, `expected exactly one selected target: ${JSON.stringify(selection.targets)}`);
  return selection.targets[0]?.inspection.id ?? null;
};

const addTargets = (page) => page.evaluate(() => {
  document.querySelector("#packed-annotation-api-handoff-target")?.remove();
  document.querySelector("#packed-annotation-handoff-target")?.remove();
  document.documentElement.style.minHeight = "1800px";
  document.body.style.minHeight = "1800px";

  const makeTarget = (id, text, left, top) => {
    const target = document.createElement("button");
    target.id = id;
    target.type = "button";
    target.textContent = text;
    Object.assign(target.style, {
      position: "absolute",
      left,
      top,
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
  };

  makeTarget("packed-annotation-api-handoff-target", "Packed API handoff target", "740px", "470px");
  makeTarget("packed-annotation-handoff-target", "Packed physical handoff target B", "800px", "650px");
});

async function openDraft(page, trigger, composer, value, label) {
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  await clickCenter(page, trigger, `${label} Add Note trigger`);
  await composer.waitFor({ state: "visible", timeout: 3000 });
  await composer.locator("textarea").fill(value);
}

async function assertFreshComposer(page, trigger, composer, label) {
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  await clickCenter(page, trigger, `${label} restored Add Note trigger`);
  await composer.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    `${label} must not inherit the abandoned draft`,
  );
  await composer
    .getByRole("button", { name: "Close note composer" })
    .evaluate((button) => button.click());
  await composer.waitFor({ state: "detached", timeout: 3000 });
}

async function assertScrollOwnership(page, trigger) {
  await trigger.waitFor({ state: "visible", timeout: 3000 });
  const before = await page.evaluate(() => {
    const target = document.querySelector("#packed-annotation-handoff-target");
    const trigger = document.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(target instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      throw new Error("Missing physical handoff target or Add Note trigger");
    }
    const targetRect = target.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      targetTop: targetRect.top,
      triggerTop: triggerRect.top,
      relativeTop: triggerRect.top - targetRect.top,
      mode: trigger.dataset.mesurerAnnotationScrollMode ?? null,
    };
  });

  await page.evaluate(() => window.scrollBy({ top: 240, behavior: "instant" }));
  await settle(page);

  const after = await page.evaluate(() => {
    const target = document.querySelector("#packed-annotation-handoff-target");
    const trigger = document.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(target instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      throw new Error("Missing physical handoff target or Add Note trigger after scroll");
    }
    const targetRect = target.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      targetTop: targetRect.top,
      triggerTop: triggerRect.top,
      relativeTop: triggerRect.top - targetRect.top,
    };
  });

  const scrollDelta = after.scrollY - before.scrollY;
  assert(Math.abs(scrollDelta - 240) < 1, `expected a 240px scroll, got ${scrollDelta}`);
  assert(
    Math.abs((after.targetTop - before.targetTop) + scrollDelta) < 0.75,
    `physical target did not follow compositor scroll exactly: ${JSON.stringify({ before, after })}`,
  );
  assert(
    Math.abs((after.triggerTop - before.triggerTop) + scrollDelta) < 0.75,
    `restored Add Note trigger did not follow compositor scroll exactly: ${JSON.stringify({ before, after })}`,
  );
  assert(
    Math.abs(after.relativeTop - before.relativeTop) < 0.75,
    `restored Add Note trigger drifted relative to B: ${JSON.stringify({ before, after })}`,
  );

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(page);
  return before.mode;
}

async function dispatchLegacyMouse(page, type, point) {
  await page.evaluate(({ eventType, x, y }) => {
    const target = document.querySelector("#packed-annotation-handoff-target");
    if (!(target instanceof HTMLElement)) throw new Error("Missing legacy mouse handoff target");
    target.dispatchEvent(new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: eventType === "mousedown" ? 1 : 0,
      clientX: x,
      clientY: y,
      view: window,
    }));
  }, { eventType: type, x: point.x, y: point.y });
}

async function runCase(testCase) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(testCase.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__HOST_READY__));
    if (testCase.injectPath) {
      const source = await readFile(testCase.injectPath, "utf8");
      await page.evaluate(source);
    }
    await page.waitForFunction(() => Boolean(window.__MESURER__));
    await page.evaluate(() => window.__MESURER__.ready());
    await page.waitForFunction(() => Boolean(
      document.querySelector("[data-mesurer-island='true']")?.shadowRoot?.querySelector("[data-mesurer-toolbar='true']"),
    ));
    await addTargets(page);

    const trigger = page.locator(
      "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-trigger='true']",
    );
    const composer = page.locator(
      "[data-mesurer-context-document-layer='true'] [data-mesurer-annotation-composer='true']",
    );

    await page.evaluate(async () => {
      await window.__MESURER__.command("builtin.select");
      await window.__MESURER__.select("[data-testid='consumer-counter']");
    });
    await settle(page);

    // The previous real-consumer failure also survived a public selection API
    // change. Prove transient draft ownership does not depend on an imperative
    // ContextActions controller becoming available after renderer settlement.
    await openDraft(page, trigger, composer, "programmatic abandoned draft A", testCase.name);
    await page.evaluate(() => window.__MESURER__.select("#packed-annotation-api-handoff-target"));
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await settle(page);
    assert.equal(
      await selectionId(page),
      "packed-annotation-api-handoff-target",
      `${testCase.name} public selection handoff must select the API target`,
    );
    await assertFreshComposer(page, trigger, composer, `${testCase.name} API handoff`);

    // Reset to A, then exercise the exact physical pointerdown→pointerup sequence
    // from manual acceptance. The composer must disappear during pointerdown,
    // before Select commits B on pointerup.
    await page.evaluate(() => window.__MESURER__.select("[data-testid='consumer-counter']"));
    await settle(page);
    await openDraft(page, trigger, composer, "abandoned draft A", testCase.name);

    const second = page.locator("#packed-annotation-handoff-target");
    const secondBox = await second.boundingBox();
    assert(secondBox, `${testCase.name} physical B must have rendered geometry`);
    const secondPoint = {
      x: secondBox.x + secondBox.width / 2,
      y: secondBox.y + secondBox.height / 2,
    };

    await page.mouse.move(secondPoint.x, secondPoint.y);
    await page.mouse.down();
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await page.mouse.up();
    await settle(page);

    assert.equal(
      await selectionId(page),
      "packed-annotation-handoff-target",
      `${testCase.name} physical B click must transfer selection ownership to B`,
    );

    await trigger.waitFor({ state: "visible", timeout: 3000 });
    const handoff = await trigger.evaluate((element) => {
      const target = document.querySelector("#packed-annotation-handoff-target");
      if (!(target instanceof HTMLElement)) throw new Error("Missing packed physical B target");
      const targetRect = target.getBoundingClientRect();
      const triggerRect = element.getBoundingClientRect();
      return {
        mode: element.dataset.mesurerAnnotationScrollMode ?? null,
        target: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
        trigger: { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height },
      };
    });
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
      `${testCase.name} restored Add Note trigger must belong to B: ${JSON.stringify(handoff)}`,
    );

    await assertFreshComposer(page, trigger, composer, `${testCase.name} physical handoff`);
    const physicalScrollMode = await assertScrollOwnership(page, trigger);

    // Some browser/agent hosts synthesize only legacy MouseEvents at the concrete
    // page node. That used to reproduce the manual failure exactly: the composer
    // stayed open on mousedown and A remained selected after mouseup. Keep the
    // normal PointerEvent path above, then prove this narrow compatibility path
    // abandons A before mouseup and transfers the same one-shot ownership to B.
    await page.evaluate(() => window.__MESURER__.select("[data-testid='consumer-counter']"));
    await settle(page);
    await openDraft(page, trigger, composer, "legacy abandoned draft A", `${testCase.name} legacy mouse`);

    const legacyBox = await second.boundingBox();
    assert(legacyBox, `${testCase.name} legacy B must have rendered geometry`);
    const legacyPoint = {
      x: legacyBox.x + legacyBox.width / 2,
      y: legacyBox.y + legacyBox.height / 2,
    };
    await dispatchLegacyMouse(page, "mousedown", legacyPoint);
    await composer.waitFor({ state: "detached", timeout: 1200 });
    await dispatchLegacyMouse(page, "mouseup", legacyPoint);
    await settle(page);

    assert.equal(
      await selectionId(page),
      "packed-annotation-handoff-target",
      `${testCase.name} legacy mouse B handoff must transfer selection ownership to B`,
    );
    await assertFreshComposer(page, trigger, composer, `${testCase.name} legacy mouse handoff`);
    const legacyScrollMode = await assertScrollOwnership(page, trigger);

    assert.deepEqual(errors, [], `${testCase.name} annotation handoff browser diagnostics: ${errors.join("\n")}`);
    console.log(`${testCase.name} annotation draft handoff: PASS`, {
      apiSelectionDiscardedDraft: true,
      composerDismissedOnPointerDown: true,
      selectionTransferredOnPointerUp: true,
      physicalRestoredTriggerMode: physicalScrollMode,
      legacyMouseComposerDismissedOnMouseDown: true,
      legacyMouseSelectionTransferredOnMouseUp: true,
      legacyRestoredTriggerMode: legacyScrollMode,
      compositorScrollDelta: -240,
      draftCleared: true,
    });
  } finally {
    await page.close();
  }
}

try {
  for (const testCase of cases) await runCase(testCase);
} finally {
  await browser.close();
}
