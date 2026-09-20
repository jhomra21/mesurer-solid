import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.ISOLATED_SELECTION_SCROLL_URL ?? "http://127.0.0.1:4174/isolated-scroll.html";

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  userAgent: "CodexBrowser Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
});

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.addInitScript(() => {
  Object.defineProperty(window, "__codexWebMcpModelContext", {
    configurable: true,
    value: {},
  });
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

const clickCenter = async (locator, label) => {
  const box = await locator.boundingBox();
  assert(box, `${label} must have rendered geometry`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);

  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    const trigger = element?.closest?.("[data-mesurer-annotation-trigger='true']") ?? null;
    const island = element?.closest?.("[data-mesurer-island='true']") ?? null;

    const rendererRoot = document.querySelector("[data-mesurer-island='true']")?.shadowRoot
      ?.querySelector("[data-mesurer-root='true']") ?? null;

    return {
      tag: element?.tagName ?? null,
      annotationTrigger: trigger instanceof HTMLElement,
      island: island instanceof HTMLElement,
      passthrough: rendererRoot instanceof HTMLElement
        ? rendererRoot.dataset.mesurerDocumentUiPassthrough ?? null
        : null,
    };
  }, point);

  assert.equal(
    hit.annotationTrigger,
    true,
    `${label} must physically own its hit point after pointer approach: ${JSON.stringify(hit)}`,
  );
  await page.mouse.down();
  await page.mouse.up();
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
    document.documentElement.style.minHeight = "1800px";
    document.body.style.minHeight = "1800px";
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

  const contextRoot = page.locator("[data-mesurer-context-root='true']");
  const trigger = contextRoot.locator("[data-mesurer-annotation-trigger='true']");
  const composer = contextRoot.locator("[data-mesurer-annotation-composer='true']");
  await trigger.waitFor({ state: "visible", timeout: 3000 });

  const topology = await trigger.evaluate((element) => {
    const root = element.closest("[data-mesurer-context-root='true']");

    return {
      hasContextRoot: root instanceof HTMLElement,
      rootIsDocument: root?.getRootNode() === document,
      documentMount: root instanceof HTMLElement ? root.dataset.mesurerDocumentInspectorMount ?? null : null,
      insideRenderer: Boolean(root?.closest("[data-mesurer-root='true']")),
      coordinateSpace: element.dataset.mesurerContextCoordinateSpace ?? null,
      scrollMode: element.dataset.mesurerAnnotationScrollMode ?? null,
      position: getComputedStyle(element).position,
    };
  });

  assert.deepEqual(topology, {
    hasContextRoot: true,
    rootIsDocument: true,
    documentMount: "true",
    insideRenderer: false,
    coordinateSpace: "document",
    scrollMode: "document",
    position: "absolute",
  }, `Context handoff UI must use the document scroll plane: ${JSON.stringify(topology)}`);

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

  // Reproduce a host that sends a physical press at the new coordinates without
  // first delivering a pointermove there. The draft must disappear during the
  // press itself, and the same gesture must remain owned by Select.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: secondPoint.x,
    y: secondPoint.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await composer.waitFor({ state: "detached", timeout: 1200 });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: secondPoint.x,
    y: secondPoint.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await cdp.detach();
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

  const readHandoff = () => page.evaluate(() => {
    const target = document.querySelector("#isolated-annotation-handoff-target");

    const nextTrigger = document.querySelector(
      "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
    );

    if (!(target instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) {
      throw new Error("Missing second target or document-owned Add Note trigger");
    }

    const targetRect = target.getBoundingClientRect();
    const triggerRect = nextTrigger.getBoundingClientRect();

    return {
      scrollY: window.scrollY,
      target: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
      trigger: { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height },
      mode: nextTrigger.dataset.mesurerAnnotationScrollMode ?? null,
      coordinateSpace: nextTrigger.dataset.mesurerContextCoordinateSpace ?? null,
      position: getComputedStyle(nextTrigger).position,
      cachedY: nextTrigger.style.getPropertyValue("--mesurer-nested-scroll-y"),
    };
  });

  const handoff = await readHandoff();
  assert.equal(handoff.mode, "document", `restored Add Note trigger must use document scrolling: ${JSON.stringify(handoff)}`);
  assert.equal(handoff.coordinateSpace, "document", "restored Add Note trigger must use document coordinates");
  assert.equal(handoff.position, "absolute", "restored Add Note trigger must use absolute document positioning");
  assert.equal(handoff.cachedY, "", "window scrolling must not use a cached JS delta");

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

  // Gate first-paint and settled geometry. Both must preserve the target-relative
  // offset because the page and Context now share one document scroll tree.
  const afterScroll = await page.evaluate(async () => {
    const snapshot = () => {
      const target = document.querySelector("#isolated-annotation-handoff-target");

      const action = document.querySelector(
        "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
      );

      if (!(target instanceof HTMLElement) || !(action instanceof HTMLElement)) {
        throw new Error("Missing handoff target or Add Note action during scroll");
      }

      const targetRect = target.getBoundingClientRect();
      const actionRect = action.getBoundingClientRect();

      return {
        scrollY: window.scrollY,
        targetTop: targetRect.top,
        triggerTop: actionRect.top,
        relativeTop: actionRect.top - targetRect.top,
        cachedY: action.style.getPropertyValue("--mesurer-nested-scroll-y"),
      };
    };

    window.scrollBy({ top: 240, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const firstPaint = snapshot();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    return { firstPaint, settled: snapshot() };
  });

  const scrollDelta = afterScroll.firstPaint.scrollY - handoff.scrollY;
  assert(Math.abs(scrollDelta - 240) < 1, `expected a 240px handoff scroll, got ${scrollDelta}`);

  for (const sample of [afterScroll.firstPaint, afterScroll.settled]) {
    assert(
      Math.abs(sample.relativeTop - (handoff.trigger.top - handoff.target.top)) < 0.75,
      `restored Add Note trigger drifted relative to B: ${JSON.stringify({ handoff, afterScroll })}`,
    );
    assert.equal(sample.cachedY, "", "window scrolling must not write cached JS compensation");
  }

  await clickCenter(trigger, "second selection Add Note trigger");
  await composer.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(
    await composer.locator("textarea").inputValue(),
    "",
    "selection handoff must discard A's abandoned annotation draft before B opens",
  );

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join("\n")}`);
  console.log("Isolated annotation draft handoff: PASS", {
    documentContextOwnership: true,
    triggerOwnsPhysicalHitPoint: true,
    composerDismissedOnPointerDown: true,
    selectionTransferredOnPointerUp: true,
    restoredTriggerMode: handoff.mode,
    compositorScrollDelta: -240,
    draftCleared: true,
  });
} finally {
  await browser.close();
}
