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

  const trigger = page.locator(
    "[data-mesurer-context-root='true'] [data-mesurer-annotation-trigger='true']",
  );
  const composer = page.locator(
    "[data-mesurer-context-root='true'] [data-mesurer-annotation-composer='true']",
  );
  await trigger.waitFor({ state: "visible", timeout: 3000 });

  const topology = await trigger.evaluate((element) => {
    const contextRoot = element.closest("[data-mesurer-context-root='true']");
    const rendererRoot = element.closest("[data-mesurer-root='true']");
    return {
      hasContextRoot: contextRoot instanceof HTMLElement,
      hasRendererRoot: rendererRoot instanceof HTMLElement,
      contextInsideRenderer: Boolean(contextRoot && rendererRoot && rendererRoot.contains(contextRoot)),
      legacyContextDocumentLayers: document.querySelectorAll("[data-mesurer-context-document-layer='true']").length,
      legacyDocumentInspectorRuntimes: document.querySelectorAll("[data-mesurer-document-inspector-runtime='true']").length,
    };
  });
  assert.deepEqual(topology, {
    hasContextRoot: true,
    hasRendererRoot: true,
    contextInsideRenderer: true,
    legacyContextDocumentLayers: 0,
    legacyDocumentInspectorRuntimes: 0,
  }, `Context handoff UI must be owned only by the canonical renderer root: ${JSON.stringify(topology)}`);

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
  // first delivering a pointermove there. The draft must still disappear during
  // pointerdown itself, and the same physical gesture must remain owned by Select.
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
    const subject = window.__MESURER_ISOLATED_SCROLL_TEST__?.subject;
    if (!subject) throw new Error("Expected mounted isolated Mesurer subject");
    const target = document.querySelector("#isolated-annotation-handoff-target");
    const nextTrigger = subject.root.querySelector("[data-mesurer-annotation-trigger='true']");
    if (!(target instanceof HTMLElement) || !(nextTrigger instanceof HTMLElement)) {
      throw new Error("Missing second target or canonical-root Add Note trigger");
    }
    const targetRect = target.getBoundingClientRect();
    const triggerRect = nextTrigger.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      target: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
      trigger: { left: triggerRect.left, top: triggerRect.top, width: triggerRect.width, height: triggerRect.height },
      mode: nextTrigger.dataset.mesurerAnnotationScrollMode ?? null,
    };
  });

  const handoff = await readHandoff();
  assert(
    handoff.mode === "native-anchor" || handoff.mode === "cached-delta",
    `restored Add Note trigger must expose a supported scroll owner: ${JSON.stringify(handoff)}`,
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

  // Gate the observable invariant: target and trigger move together through an
  // ordinary compositor-owned window scroll with no drift or catch-up frame.
  await page.evaluate(() => window.scrollBy({ top: 240, behavior: "instant" }));
  await settle();
  const afterScroll = await readHandoff();
  const scrollDelta = afterScroll.scrollY - handoff.scrollY;
  assert(Math.abs(scrollDelta - 240) < 1, `expected a 240px handoff scroll, got ${scrollDelta}`);
  assert(
    Math.abs((afterScroll.target.top - handoff.target.top) + scrollDelta) < 0.75,
    `B must follow window scroll exactly: ${JSON.stringify({ handoff, afterScroll })}`,
  );
  assert(
    Math.abs((afterScroll.trigger.top - handoff.trigger.top) + scrollDelta) < 0.75,
    `restored Add Note trigger must follow B exactly: ${JSON.stringify({ handoff, afterScroll })}`,
  );
  assert(
    Math.abs(
      (afterScroll.trigger.top - afterScroll.target.top)
      - (handoff.trigger.top - handoff.target.top),
    ) < 0.75,
    `restored Add Note trigger must not drift relative to B: ${JSON.stringify({ handoff, afterScroll })}`,
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
    canonicalRootOwnership: true,
    composerDismissedOnPointerDown: true,
    selectionTransferredOnPointerUp: true,
    restoredTriggerMode: handoff.mode,
    compositorScrollDelta: -240,
    draftCleared: true,
  });
} finally {
  await browser.close();
}
