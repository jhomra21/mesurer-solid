import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.RESPONSIVE_CONTEXT_URL ?? "http://127.0.0.1:4190/responsive-preview.html";

const output = process.env.RESPONSIVE_CONTEXT_OUT ?? "responsive-context-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];

const warnings = [];

await page.addInitScript(() => {
  const listeners = [];
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const observe = MutationObserver.prototype.observe;
  const disconnect = MutationObserver.prototype.disconnect;
  const observers = [];
  MutationObserver.prototype.observe = function(target, options) {
    observers.push({ observer: this, target, disconnected: false });

    return observe.call(this, target, options);
  };

  MutationObserver.prototype.disconnect = function() {
    for (const item of observers) if (item.observer === this) item.disconnected = true;

    return disconnect.call(this);
  };

  window.__contextContractObservers = observers;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (["scroll", "load", "resize"].includes(type)) listeners.push({ target: this, type, listener, capture: options === true || Boolean(options?.capture) });

    return add.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const capture = options === true || Boolean(options?.capture);
    const index = listeners.findIndex((item) => item.target === this && item.type === type && item.listener === listener && item.capture === capture);

    if (index >= 0) listeners.splice(index, 1);

    return remove.call(this, type, listener, options);
  };

  window.__contextContractListeners = listeners;
});

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error" || message.text().includes("STRICT_READ_UNTRACKED")) errors.push(message.text());
  else if (message.type() === "warning") warnings.push(message.text());
});

const frames = page.locator("iframe[data-mesurer-responsive-frame]");

const markers = page.locator("[data-mesurer-annotation-marker='true']");

const settle = () => page.evaluate(() => window.__MESURER__.stable(3));

const annotations = () => page.evaluate(() => window.__MESURER__.annotations());

const click = async (locator) => {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

const open = async () => {
  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").first().locator("#inspection-target").waitFor();
  await settle();
};

const close = async () => {
  await page.getByRole("button", { name: "Close Responsive", exact: true }).click();
  await frames.waitFor({ state: "detached" });
  await settle();
};

const save = async (note) => {
  const trigger = await page.locator("[data-mesurer-annotation-trigger='true']").boundingBox();
  assert(trigger);
  await page.mouse.move(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  await page.mouse.click(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  const input = page.locator("[data-mesurer-annotation-composer='true'] textarea");
  await input.fill(note);
  await input.press("Enter");
  await click(page.getByRole("button", { name: "Close annotation", exact: true }));
  await settle();

  return (await annotations()).find((item) => item.note === note);
};

const selectPreview = async (index) => {
  const target = frames.nth(index);

  const point = await target.evaluate((frame) => {
    const rect = frame.getBoundingClientRect();
    const source = frame.contentDocument.querySelector("#inspection-target").getBoundingClientRect();
    const scale = rect.width / frame.offsetWidth;

    return { x: rect.left + (source.left + source.width / 2) * scale, y: rect.top + (source.top + source.height / 2) * scale };
  });

  await page.mouse.move(point.x, point.y, { steps: 3 });
  await page.mouse.click(point.x, point.y);
  await page.locator("[data-mesurer-annotation-trigger='true']").waitFor();
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__MESURER__.ready());
  await page.evaluate(() => window.__MESURER__.select("#inspection-target"));
  const root = await save("Root note");
  assert.equal(root.anchor.targets[0].viewport, undefined);
  await open();
  assert.equal(await markers.count(), 0, "Root markers are hidden in Responsive");
  await page.evaluate(async () => {
    const host = await window.__responsiveMount.ready;
    const plugin = host.plugin("mesurer.context");
    host.remove("mesurer.context");
    await host.load(plugin);
  });
  await selectPreview(0);
  const lateTrigger = page.locator("[data-mesurer-annotation-trigger='true']");
  await lateTrigger.waitFor({ state: "visible" });
  await click(lateTrigger);
  const lateInput = page.locator("[data-mesurer-annotation-composer='true'] textarea");
  await lateInput.fill("Late preview note");
  await lateInput.press("Enter");
  await click(page.getByRole("button", { name: "Close annotation", exact: true }));
  assert((await annotations()).some((item) =>
    item.note === "Late preview note" && item.anchor.targets[0].viewport?.previewId),
  "Context re-enabled after opening Responsive saves a preview-scoped note");
  const lateAnnotation = (await annotations()).find((item) => item.note === "Late preview note");
  await click(page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${lateAnnotation.id}']`));
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "Escape closes the preview note without closing Responsive");
  await click(page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${lateAnnotation.id}']`));
  await click(page.getByRole("button", { name: "Delete annotation", exact: true }));
  assert.equal((await annotations()).length, 1, "Late preview annotation can be saved and removed");
  const a = await save("Viewport A");
  const scope = a.anchor.targets[0].viewport;
  assert.deepEqual(scope, { url: url.split("#")[0], width: 393, height: 852, previewId: scope.previewId });
  assert.equal(a.anchor.targets[0].selector, "#inspection-target");
  const baseline = structuredClone(a.baseline);
  assert.equal(await markers.count(), 1);
  const markerBox = await markers.boundingBox();
  assert(markerBox);
  const context = await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), a.id);
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 1,
    "reading a preview annotation's Context does not close, reopen, or otherwise alter Responsive");
  assert.deepEqual(context.previewViewport, scope);
  assert.deepEqual(context.targets[0].viewport, scope);
  assert.equal(context.coordinateSpace, "viewport-css-px");

  const projected = await frames.first().evaluate((frame) => {
    const r = frame.getBoundingClientRect();
    const t = frame.contentDocument.querySelector("#inspection-target").getBoundingClientRect();
    const scale = r.width / frame.offsetWidth;

    return { left: r.left + t.left * scale, top: r.top + t.top * scale, width: t.width * scale, height: t.height * scale };
  });

  for (const key of Object.keys(projected)) assert(Math.abs(context.targets[0].inspection.rect[key] - projected[key]) < 1, key);
  assert(Math.abs(markerBox.x - projected.left) < projected.width + 80 && Math.abs(markerBox.y - projected.top) < projected.height + 80,
    "Saved marker stays next to its projected source, not the unscaled iframe coordinates");
  assert.deepEqual((await page.evaluate((id) => window.__MESURER__.capturePlan({ annotation: id }), a.id)).previewViewport, scope);
  assert.equal(await frames.first().evaluate((frame) => frame.contentDocument.querySelectorAll("[data-mesurer-context-root]").length), 0);

  await page.getByLabel("Add a size").selectOption("393x852");
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(1).locator("#inspection-target").waitFor();
  await selectPreview(1);
  const duplicate = await save("Duplicate viewport note");
  assert.equal(duplicate.anchor.targets[0].viewport.width, scope.width);
  assert.equal(duplicate.anchor.targets[0].viewport.height, scope.height);
  assert.notEqual(duplicate.anchor.targets[0].viewport.previewId, scope.previewId,
    "Duplicate-size previews retain distinct Context preview identities");
  assert.deepEqual(
    (await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), duplicate.id)).previewViewport,
    duplicate.anchor.targets[0].viewport,
    "Context binds the note to its duplicate preview rather than the matching-size sibling",
  );
  await click(page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${duplicate.id}']`));
  await click(page.getByRole("button", { name: "Delete annotation", exact: true }));
  await page.getByLabel("Remove preview").nth(1).click();

  const nestedTarget = page.frameLocator("iframe[data-mesurer-responsive-frame]")
    .frameLocator("[data-testid='nested-preview-frame']").getByTestId("nested-inspection-target");

  await click(nestedTarget);
  const nested = await save("Nested preview note");
  assert.equal(nested.anchor.targets[0].domPath[0].kind, "frame");
  await frames.first().evaluate((frame) => {
    const target = frame.contentDocument.querySelector("[data-testid='nested-preview-frame']")
      .contentDocument.querySelector("[data-testid='nested-inspection-target']");

    target.replaceWith(target.cloneNode(true));
  });
  await settle();
  assert.equal((await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), nested.id)).scope.targetStatus, "connected");
  await click(page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${nested.id}']`));
  await click(page.getByRole("button", { name: "Delete annotation", exact: true }));
  assert.equal((await annotations()).length, 2, "Deleting a preview note preserves root and other notes");

  await frames.first().evaluate((frame) => {
    const doc = frame.contentDocument;
    const host = doc.createElement("div");
    host.id = "context-shadow-host";
    const target = doc.createElement("button");
    target.id = "shadow-target";
    target.textContent = "Shadow target";
    host.attachShadow({ mode: "open" }).append(target);
    doc.querySelector("main").prepend(host);
  });
  await click(page.frameLocator("iframe[data-mesurer-responsive-frame]").locator("#shadow-target"));
  const shadow = await save("Shadow preview note");
  assert.deepEqual(shadow.anchor.targets[0].domPath, [{ kind: "shadow", selector: "#context-shadow-host" }]);
  const shadowMarker = page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${shadow.id}']`);
  assert.equal(await frames.first().evaluate((frame) => frame.contentWindow.__contextContractObservers.some((item) =>
    item.target === frame.contentDocument.querySelector("#context-shadow-host").shadowRoot && !item.disconnected)), true,
  "Context also observes the target's open shadow root");
  const beforeShadowMove = await shadowMarker.boundingBox();
  assert(beforeShadowMove);
  await frames.first().evaluate((frame) => {
    frame.contentDocument.querySelector("#context-shadow-host").shadowRoot.querySelector("#shadow-target").style.marginTop = "48px";
  });
  await settle();
  const afterShadowMove = await shadowMarker.boundingBox();
  assert(afterShadowMove && afterShadowMove.y > beforeShadowMove.y + 20,
    `Shadow-root mutation repositions the projected marker (${beforeShadowMove.y} -> ${afterShadowMove?.y})`);
  assert.equal((await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), shadow.id)).scope.targetStatus, "connected");
  await frames.first().evaluate((frame) => {
    frame.contentDocument.querySelector("#context-shadow-host").shadowRoot.querySelector("#shadow-target").remove();
  });
  await settle();
  assert.equal((await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), shadow.id)).scope.targetStatus, "stale");
  assert.equal(await shadowMarker.isVisible(), false, "Removing a shadow target hides its marker");
  await frames.first().evaluate((frame) => {
    const host = frame.contentDocument.querySelector("#context-shadow-host");
    const target = frame.contentDocument.createElement("button");
    target.id = "shadow-target";
    target.textContent = "Shadow target";
    target.style.marginTop = "48px";
    host.shadowRoot.append(target);
  });
  await settle();
  assert.equal((await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), shadow.id)).scope.targetStatus, "connected");
  await click(shadowMarker);
  await click(page.getByRole("button", { name: "Delete annotation", exact: true }));

  await page.getByLabel("Add a size").selectOption("375x667");
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(1).locator("#inspection-target").waitFor();
  const second = page.locator("[data-preview]").nth(1);
  await second.getByLabel("Width", { exact: true }).fill("393");
  await second.getByLabel("Width", { exact: true }).press("Tab");
  await settle();
  await selectPreview(1);
  const b = await save("Viewport B");
  assert.equal(b.anchor.targets[0].viewport.height, 667);
  assert.equal(await markers.count(), 2);
  await frames.first().evaluate((frame) => {
    window.__removedContextDocument = frame.contentDocument;
    window.__removedContextWindow = frame.contentWindow;
    window.__removedContextListeners = frame.contentWindow.__contextContractListeners;
    window.__removedContextShadowRoot = frame.contentDocument.querySelector("#context-shadow-host")?.shadowRoot;
    window.__removedContextObservers = frame.contentWindow.__contextContractObservers;
  });
  await page.locator("[data-preview]").first().getByLabel("Remove preview").click();
  await settle();
  assert.deepEqual(await page.evaluate(() => {
    const doc = window.__removedContextDocument;

    return window.__removedContextListeners.filter((item) =>
      (item.target === doc && ["scroll", "load"].includes(item.type))
      || (item.target === window.__removedContextWindow && item.type === "resize")).map((item) => ({ type: item.type, name: item.listener.name }));
  }), [], "Removed preview releases document and viewport watchers");
  assert.equal(await page.evaluate(() => window.__removedContextObservers.some((item) =>
    item.target === window.__removedContextShadowRoot && item.disconnected)), true, "Removed preview disconnects its shadow-root observer");
  assert.equal(await markers.count(), 1, "Removed A must not migrate to same-width B");
  assert.equal((await page.evaluate((id) => window.__MESURER__.context({ annotation: id }), a.id)).scope.targetStatus, "stale");
  await page.getByLabel("Add a size").selectOption("393x852");
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(1).locator("#inspection-target").waitFor();
  await settle();
  assert.equal(await markers.count(), 2, "Exact recreated viewport rebinds");
  assert.deepEqual((await annotations()).find((item) => item.id === a.id).baseline, baseline);

  await frames.nth(1).evaluate((frame) => { frame.contentWindow.history.pushState({}, "", "?spa-route=other"); });
  await settle();
  assert.equal(await markers.count(), 1, "Same-document preview navigation immediately hides notes from the old URL");
  await frames.nth(1).evaluate((frame) => { frame.contentWindow.history.replaceState({}, "", "/responsive-preview.html"); });
  await settle();
  assert.equal(await markers.count(), 2, "Returning to the exact preview URL restores the marker");

  await frames.nth(1).evaluate((frame) => {
    window.__navigatedContextDocument = frame.contentDocument;
    window.__navigatedContextListeners = frame.contentWindow.__contextContractListeners;
    frame.src = `${frame.src}?other-route=1`;
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-mesurer-island]").shadowRoot.querySelectorAll("iframe[data-mesurer-responsive-frame]")[1];

    return frame.contentDocument?.URL.includes("other-route=1") && frame.contentDocument.readyState === "complete";
  });
  await settle();
  assert.equal(await markers.count(), 1, "Same dimensions at another URL must not bind A");
  assert.equal(await page.evaluate(() => window.__navigatedContextListeners.filter((item) =>
    item.listener.name === "scheduleRefresh").length), 0, "Navigation releases old-document Context listeners");
  await selectPreview(1);
  const c = await save("Other URL");
  assert(c.anchor.targets[0].viewport.url.includes("other-route=1"));
  await selectPreview(1);
  await page.keyboard.press("Delete");
  assert((await annotations()).some((item) => item.id === root.id), "Preview Delete must preserve root notes");
  await page.screenshot({ path: join(output, "viewport-notes.png") });
  await close();
  assert.equal(await markers.count(), 1, "Only root markers appear after closing");
  await open();
  await settle();
  assert.equal(await markers.count(), 2, "Reopen reloads original URL and restores A and B, not other URL");
  await close();
  await page.evaluate(() => history.pushState({}, "", "?route=second"));
  await settle();
  assert.equal((await annotations()).length, 0);
  await page.evaluate(() => history.back());
  await page.waitForURL(url);
  await settle();
  assert.equal((await annotations()).length, 4, "Page records return on route restoration");
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => window.__MESURER__.ready());
  assert.equal((await annotations()).length, 4, "Saved preview records survive a same-tab reload");
  assert.equal(await markers.count(), 1);
  await open();
  assert.equal(await markers.count(), 1, "Reload resets sizes to default A without restoring B or another URL");
  await frames.first().evaluate((frame) => {
    window.__removedContextDocument = frame.contentDocument;
    window.__removedContextWindow = frame.contentWindow;
    window.__removedContextListeners = frame.contentWindow.__contextContractListeners;
  });
  await page.evaluate(() => window.__responsiveMount.dispose());
  assert.equal(await frames.count(), 0);
  assert.equal(await markers.count(), 0);
  assert.equal(await page.evaluate(() => {
    const doc = window.__removedContextDocument;

    return window.__removedContextListeners.filter((item) =>
      (item.target === doc && ["scroll", "load"].includes(item.type))
      || (item.target === window.__removedContextWindow && item.type === "resize")).length;
  }), 0, "Disposal releases preview Context watchers");
  assert.deepEqual(errors, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ passed: true, scope, projected, context, annotationIds: [root.id, a.id, b.id, c.id], errors, warnings }, null, 2));
  console.log("Responsive Context contract passed");
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  await writeFile(join(output, "failure.json"), JSON.stringify({ error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
