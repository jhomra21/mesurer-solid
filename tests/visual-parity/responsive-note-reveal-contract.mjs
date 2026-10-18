import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

// Covers explicit root/preview reveal, exact viewport recreation/reuse, target
// projection and card alignment, identity/ambiguity, eviction, cancellation,
// inaccessible siblings, ancestor-scroll preservation, and trigger focus.
const url = process.env.RESPONSIVE_NOTE_REVEAL_URL ?? "http://127.0.0.1:4194/responsive-preview.html";

const output = process.env.RESPONSIVE_NOTE_REVEAL_OUT ?? "responsive-note-reveal-artifacts";

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.setDefaultTimeout(8000);

const errors = [];

const revealEvidence = {};

page.on("pageerror", (error) => errors.push(error.stack || `${error.name}: ${error.message}`));

page.on("console", (message) => {
  if (message.type() === "error" || message.text().includes("STRICT_READ_UNTRACKED")) {
    errors.push(`${message.text()} @ ${JSON.stringify(message.location())}`);
  }
});

const notesTool = page.locator('button[data-mesurer-tool-id="context.notes"]');

const stage = page.locator("[data-mesurer-responsive-stage]");

const frames = page.locator("iframe[data-mesurer-responsive-frame]");

const annotations = () => page.evaluate(() => window.__MESURER__.annotations());

const settle = () => page.evaluate(() => window.__MESURER__.stable(3));

const click = async (locator) => {
  await locator.waitFor({ state: "visible" });
  assert.equal(await locator.isEnabled(), true, "a user click target must be enabled");
  const bounds = await locator.boundingBox();
  assert(bounds, "a user click target must have rendered geometry");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
};

const physicallySelect = async (locator) => {
  await locator.waitFor({ state: "visible" });
  const bounds = await locator.boundingBox();
  assert(bounds, "selected target must have rendered geometry");
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
};

const saveNote = async (text) => {
  await click(page.locator("[data-mesurer-annotation-trigger='true']"));
  const composer = page.locator("[data-mesurer-annotation-composer='true'] textarea");
  await composer.fill(text);
  await composer.press("Enter");
  await page.getByRole("button", { name: "Close annotation", exact: true }).waitFor({ state: "visible" });
  await click(page.getByRole("button", { name: "Close annotation", exact: true }));
  await settle();

  return (await annotations()).find((item) => item.note === text);
};

const selectPreviewTarget = async () => {
  const frame = frames.first();
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").first().locator("#inspection-target").waitFor();

  const bounds = await frame.evaluate((element) => {
    const rect = element.contentDocument.querySelector("#inspection-target").getBoundingClientRect();
    const frameRect = element.getBoundingClientRect();
    const scale = frameRect.width / element.offsetWidth;

    return { x: frameRect.left + (rect.left + rect.width / 2) * scale, y: frameRect.top + (rect.top + rect.height / 2) * scale };
  });

  await page.mouse.click(bounds.x, bounds.y);
  await page.locator("[data-mesurer-annotation-trigger='true']").waitFor();
};

const selectPreviewTargetAt = async (index) => {
  const frame = frames.nth(index);
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(index).locator("#inspection-target").waitFor();

  const bounds = await frame.evaluate((element) => {
    const rect = element.contentDocument.querySelector("#inspection-target").getBoundingClientRect();
    const frameRect = element.getBoundingClientRect();
    const scale = frameRect.width / element.offsetWidth;

    return { x: frameRect.left + (rect.left + rect.width / 2) * scale, y: frameRect.top + (rect.top + rect.height / 2) * scale };
  });

  await page.mouse.click(bounds.x, bounds.y);
  await page.locator("[data-mesurer-annotation-trigger='true']").waitFor();
};

const setPreviewSize = async (index, width, height) => {
  const preview = page.locator("[data-preview]").nth(index);
  const widthInput = preview.locator("input[data-responsive-width]");
  const heightInput = preview.locator("input[data-responsive-height]");
  await widthInput.fill(String(width));
  await widthInput.press("Enter");
  await heightInput.fill(String(height));
  await heightInput.press("Enter");
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(index).locator("#inspection-target").waitFor();
};

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => window.__MESURER__.ready());

  const rootStart = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await page.evaluate(() => window.__MESURER__.context());
  await page.evaluate(() => window.__MESURER__.review());
  assert.equal(await stage.count(), 0, "reading Context/review must not reveal a saved note");

  await page.locator("button[data-mesurer-builtin='select']").click();
  const rootTarget = page.locator("#inspection-target");
  await physicallySelect(rootTarget);
  const rootNote = await saveNote("Root note should remain on the page");
  assert(rootNote);

  await page.locator("button[data-mesurer-builtin='responsive']").click();
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").first().locator("#inspection-target").waitFor();
  await page.locator("[data-preview]").first().locator("input[data-responsive-width]").fill("500");
  await page.locator("[data-preview]").first().locator("input[data-responsive-width]").press("Enter");
  await page.locator("[data-preview]").first().locator("input[data-responsive-height]").fill("700");
  await page.locator("[data-preview]").first().locator("input[data-responsive-height]").press("Enter");
  await selectPreviewTarget();
  const previewNote = await saveNote("Preview note with a searchable reply");
  assert(previewNote);
  assert(previewNote.anchor.targets[0].viewport?.previewId);
  await page.screenshot({ path: join(output, "preview-note-open.png"), fullPage: true });
  await page.locator("[data-mesurer-annotation-marker='true']").waitFor();
  const reply = page.locator("[data-mesurer-annotation-panel='true']").getByRole("textbox", { name: /reply to note/i });

  if (await reply.count()) {
    await reply.fill("Needle from reply text");
    await reply.press("Enter");
  } else {
    await click(page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id="${previewNote.id}"]`));
    const panelReply = page.locator("[data-mesurer-annotation-panel='true']").getByRole("textbox", { name: /reply to note/i });
    await panelReply.fill("Needle from reply text");
    await panelReply.press("Enter");
  }

  await settle();
  await page.getByLabel("Add a size").selectOption("430x932");
  await page.frameLocator("iframe[data-mesurer-responsive-frame]").nth(1).locator("#inspection-target").waitFor();
  await click(page.getByLabel("Remove preview").first());
  assert.equal(await frames.count(), 1, "removing a saved note's preview preserves the note");
  assert.deepEqual(await frames.first().evaluate((frame) => [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]), [430, 932]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await stage.waitFor({ state: "detached" });
  const saved = await annotations();
  assert.equal(saved.find((item) => item.id === previewNote.id).replies?.[0]?.text, "Needle from reply text");

  await notesTool.waitFor({ state: "visible" });
  assert.equal(await notesTool.getAttribute("aria-expanded"), "false");
  await click(notesTool);
  const panel = page.getByRole("dialog", { name: "Notes" });
  await panel.waitFor({ state: "visible" });
  assert.equal(await notesTool.getAttribute("aria-expanded"), "true", "Notes trigger reflects the rendered panel");
  await page.screenshot({ path: join(output, "notes-list.png"), fullPage: true });

  const search = panel.getByRole("searchbox", { name: /search notes/i });
  await search.fill("Needle from reply text");
  const previewRow = panel.getByRole("button", { name: /Preview note with a searchable reply/ });
  await previewRow.waitFor({ state: "visible" });
  assert.equal(await panel.getByRole("button", { name: /Root note should remain on the page/ }).count(), 0,
    "search includes reply text and filters unrelated notes");
  await search.fill("");
  const previewRootScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await previewRow.click();
  await stage.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-mesurer-island]")?.shadowRoot;

    return [...root?.querySelectorAll("iframe[data-mesurer-responsive-frame]") ?? []]
      .some((frame) => frame.contentWindow.innerWidth === 500 && frame.contentWindow.innerHeight === 700);
  }, undefined, { timeout: 10000 });

  const viewportSizes = await frames.evaluateAll((items) => items.map((frame) =>
    [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]));

  assert(viewportSizes.some(([width, height]) => width === 500 && height === 700),
    `reveal recreates the exact saved viewport, got ${JSON.stringify(viewportSizes)}`);
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`)
    .waitFor({ state: "visible", timeout: 7000 });
  assert.equal(await panel.isVisible(), true, "Notes stays open while Responsive and the note card open");
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), previewRootScroll,
    "revealing a preview note preserves the root page scroll");
  await page.screenshot({ path: join(output, "revealed-preview.png"), fullPage: true });

  const recreatedSizes = await frames.evaluateAll((items) => items.map((frame) =>
    [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]));

  const initiallyRecreated = recreatedSizes.findIndex(([width, height]) => width === 500 && height === 700);
  assert(initiallyRecreated >= 0, "saved viewport was recreated after preview removal");
  await page.keyboard.press("Escape");
  await setPreviewSize(initiallyRecreated, 1000, 700);
  await previewRow.click();
  await page.waitForFunction(() => [...document.querySelector("[data-mesurer-island]")?.shadowRoot
    .querySelectorAll("iframe[data-mesurer-responsive-frame]") ?? []]
    .some((frame) => frame.contentWindow?.innerWidth === 500 && frame.contentWindow?.innerHeight === 700
      && frame.contentDocument?.querySelector("#inspection-target")));

  const resizedBackSizes = await frames.evaluateAll((items) => items.map((frame) =>
    [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]));

  assert(resizedBackSizes.some(([width, height]) => width === 500 && height === 700),
    "resizing the original preview away recreates the exact saved viewport");

  const ownerIndex = await frames.evaluateAll((items) => items.findIndex((frame) =>
    frame.contentWindow.innerWidth === 500 && frame.contentWindow.innerHeight === 700
    && frame.contentDocument.querySelector("#inspection-target")));

  assert(ownerIndex >= 0, "the exact saved preview is present");
  const ownerLocator = frames.nth(ownerIndex);
  const row = page.locator("[data-mesurer-responsive-row]");
  await row.evaluate((element) => {
    const max = element.scrollHeight - element.clientHeight;
    element.scrollTop = Math.min(70, max);
  });

  const scrollBeforeReuse = await page.evaluate(() => {
    const rowElement = document.querySelector("[data-mesurer-island]")?.shadowRoot.querySelector("[data-mesurer-responsive-row]");

    return { root: [scrollX, scrollY], row: [rowElement.scrollLeft, rowElement.scrollTop] };
  });

  const ownerFrameHandle = await ownerLocator.elementHandle();
  const ownerContentFrame = await ownerFrameHandle.contentFrame();
  let ownerNavigations = 0;

  const countOwnerNavigation = (navigatedFrame) => {
    if (navigatedFrame === ownerContentFrame) ownerNavigations += 1;
  };

  page.on("framenavigated", countOwnerNavigation);
  const targetMarker = page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id="${previewNote.id}"]`);
  await page.keyboard.press("Escape");
  await previewRow.click();
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`).waitFor({ state: "visible" });
  page.off("framenavigated", countOwnerNavigation);
  assert.equal(ownerNavigations, 0, "reusing the exact viewport does not reload its iframe");
  const ownerBounds = await ownerLocator.boundingBox();
  const rowBounds = await row.boundingBox();
  assert(ownerBounds && rowBounds);
  assert(ownerBounds.x >= rowBounds.x && ownerBounds.x + ownerBounds.width <= rowBounds.x + rowBounds.width,
    "the owning saved preview, not merely any preview, is visible in the row");

  const projectedTarget = await ownerLocator.evaluate((frame) => {
    const target = frame.contentDocument.querySelector("#inspection-target");
    const rect = target.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const scale = frameRect.width / frame.offsetWidth;

    return { left: frameRect.left + rect.left * scale, top: frameRect.top + rect.top * scale,
      right: frameRect.left + rect.right * scale, bottom: frameRect.top + rect.bottom * scale };
  });

  const markerBounds = await targetMarker.boundingBox();
  assert(markerBounds, "the target's projected annotation marker is rendered");
  const markerCenter = { x: markerBounds.x + markerBounds.width / 2, y: markerBounds.y + markerBounds.height / 2 };
  assert(markerCenter.x >= projectedTarget.left - 24 && markerCenter.x <= projectedTarget.right + 24
    && markerCenter.y >= projectedTarget.top - 24 && markerCenter.y <= projectedTarget.bottom + 24,
  "the marker is projected over the actual target geometry");
  const cardBounds = await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`).boundingBox();
  assert(cardBounds && Math.abs(cardBounds.x - markerBounds.x) < 500 && Math.abs(cardBounds.y - markerBounds.y) < 500,
    "the opened note card remains aligned near its owning target marker");

  const scrollAfterReuse = await page.evaluate(() => {
    const rowElement = document.querySelector("[data-mesurer-island]")?.shadowRoot.querySelector("[data-mesurer-responsive-row]");

    return { root: [scrollX, scrollY], row: [rowElement.scrollLeft, rowElement.scrollTop] };
  });

  assert.deepEqual(scrollAfterReuse.root, scrollBeforeReuse.root, "preview reveal preserves root scroll");
  assert.equal(scrollAfterReuse.row[1], scrollBeforeReuse.row[1], "preview reveal preserves vertical Responsive row scroll");
  revealEvidence.recreatedFrames = await frames.evaluateAll((items) => items.map((frame) => ({
    id: frame.dataset.mesurerResponsivePreviewId,
    size: [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight],
    bounds: (() => { const rect = frame.getBoundingClientRect();

 return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; })(),
  })));
  revealEvidence.targetGeometry = { projectedTarget, markerBounds, cardBounds };
  revealEvidence.scrollMatrix = { before: scrollBeforeReuse, after: scrollAfterReuse };

  const selectedIdentity = await ownerLocator.getAttribute("data-mesurer-responsive-preview-id");
  await page.keyboard.press("Escape");
  await selectPreviewTargetAt(ownerIndex);
  const identityNote = await saveNote("Original identity preference");
  assert(identityNote);
  await setPreviewSize(0, 500, 700);

  const duplicateIds = await frames.evaluateAll((items) => items
    .filter((frame) => frame.contentWindow.innerWidth === 500 && frame.contentWindow.innerHeight === 700)
    .map((frame) => frame.dataset.mesurerResponsivePreviewId));

  assert.equal(duplicateIds.length, 2, "fixture contains duplicate exact preview sizes");
  const identityRow = panel.getByRole("button", { name: /Original identity preference/ });
  const identityFrameHandle = await ownerLocator.elementHandle();
  const identityFrame = await identityFrameHandle.contentFrame();
  let identityFrameNavigations = 0;

  const countIdentityNavigation = (navigatedFrame) => {
    if (navigatedFrame === identityFrame) identityFrameNavigations += 1;
  };

  page.on("framenavigated", countIdentityNavigation);
  await identityRow.click();
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${identityNote.id}"]`).waitFor();
  page.off("framenavigated", countIdentityNavigation);
  assert.equal(identityFrameNavigations, 0, "exact original preview identity is reused without iframe reload");
  const identityCard = await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${identityNote.id}"]`).boundingBox();

  assert(identityCard, "the original-identity note card is visible");

  const candidateGeometry = await frames.evaluateAll((items) => items
    .filter((frame) => frame.contentWindow.innerWidth === 500 && frame.contentWindow.innerHeight === 700)
    .map((frame) => {
      const target = frame.contentDocument.querySelector("#inspection-target").getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const scale = frameRect.width / frame.offsetWidth;

      return { id: frame.dataset.mesurerResponsivePreviewId,
        left: frameRect.left + target.left * scale, right: frameRect.left + target.right * scale,
        top: frameRect.top + target.top * scale, bottom: frameRect.top + target.bottom * scale };
    }));

  const cardCenterIdentity = { x: identityCard.x + identityCard.width / 2, y: identityCard.y + identityCard.height / 2 };

  const identityOwner = candidateGeometry
    .map((bounds) => ({ ...bounds, distance: Math.hypot(cardCenterIdentity.x - (bounds.left + bounds.right) / 2,
      cardCenterIdentity.y - (bounds.top + bounds.bottom) / 2) }))
    .sort((a, b) => a.distance - b.distance)[0];

  assert.equal(identityOwner?.id, selectedIdentity, "duplicate exact sizes prefer the note's original preview id");
  revealEvidence.duplicateIdentities = { savedPreviewId: selectedIdentity, matchingPreviewIds: duplicateIds, projectedOwnerId: identityOwner?.id };

  await page.keyboard.press("Escape");
  await previewRow.click();
  await panel.getByRole("status").filter({ hasText: "More than one matching preview" }).waitFor({ state: "visible" });
  assert.equal(await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`).count(), 0,
    "a missing original identity with duplicate exact sizes is refused as ambiguous");

  const duplicateFrameIndex = await frames.evaluateAll((items, originalId) => items.findIndex((frame) =>
    frame.contentWindow.innerWidth === 500 && frame.contentWindow.innerHeight === 700
    && frame.dataset.mesurerResponsivePreviewId !== originalId), selectedIdentity);

  const identityIndex = await frames.evaluateAll((items, originalId) => items.findIndex((frame) =>
    frame.dataset.mesurerResponsivePreviewId === originalId), selectedIdentity);

  await setPreviewSize(identityIndex, 600, 700);
  await setPreviewSize(duplicateFrameIndex, 550, 700);
  const remainingSlots = 6 - await frames.count();

  for (const size of ["412x915", "375x812", "360x780", "744x1133"].slice(0, remainingSlots)) {
    const priorCount = await frames.count();
    await page.getByLabel("Add a size").selectOption(size);
    await page.waitForFunction((count) => document.querySelector("[data-mesurer-island]")?.shadowRoot
      .querySelectorAll("iframe[data-mesurer-responsive-frame]").length === count + 1, priorCount);
    await page.frameLocator("iframe[data-mesurer-responsive-frame]").last().locator("#inspection-target").waitFor();
  }

  assert.equal(await frames.count(), 6, "six preview slots are occupied before reveal eviction");
  const idsBeforeEviction = await frames.evaluateAll((items) => items.map((frame) => frame.dataset.mesurerResponsivePreviewId));
  await previewRow.click();
  await page.waitForFunction(() => [...document.querySelector("[data-mesurer-island]")?.shadowRoot
    .querySelectorAll("iframe[data-mesurer-responsive-frame]") ?? []]
    .some((frame) => {
      try {
        return frame.contentWindow?.innerWidth === 500 && frame.contentWindow?.innerHeight === 700
          && frame.contentDocument?.querySelector("#inspection-target");
      } catch {
        return false;
      }
    }), undefined, { timeout: 10000 });
  assert.equal(await frames.count(), 6, "reveal keeps the stage at six previews");
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`)
    .waitFor({ state: "visible" });
  const idsAfterEviction = await frames.evaluateAll((items) => items.map((frame) => frame.dataset.mesurerResponsivePreviewId));
  assert.deepEqual(idsAfterEviction.slice(0, 5), idsBeforeEviction.slice(0, 5),
    "six-preview reveal preserves the first five preview identities and evicts only the last");
  assert(!idsAfterEviction.includes(idsBeforeEviction[5]), "the last preview identity is evicted");
  revealEvidence.eviction = { before: idsBeforeEviction, after: idsAfterEviction };

  const reusedPreviewIndex = idsAfterEviction.length - 1;
  const inaccessibleHandle = await frames.nth(duplicateFrameIndex).elementHandle();
  await inaccessibleHandle.evaluate((frame) => {
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get() {
        throw new DOMException("Sibling preview document is inaccessible", "SecurityError");
      },
    });
  });
  assert.equal(await inaccessibleHandle.evaluate((frame) => {
    try {
      return frame.contentDocument;
    } catch (error) {
      return error.name;
    }
  }), "SecurityError", "sibling frame reports an inaccessible document");
  await click(page.locator(`[data-mesurer-note-id="${previewNote.id}"]`));
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`).waitFor();
  revealEvidence.inaccessibleSibling = {
    skippedPreviewId: idsBeforeEviction[duplicateFrameIndex],
    owningPreviewId: idsAfterEviction[reusedPreviewIndex],
  };
  await page.keyboard.press("Escape");
  assert.equal(await stage.count(), 1, "Escape closes the note card before Responsive");

  const openRootBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const rootRow = page.locator(`[data-mesurer-note-id="${rootNote.id}"]`);
  await rootRow.waitFor({ state: "visible" });
  await click(rootRow);
  await stage.waitFor({ state: "detached" });
  await page.waitForFunction((id) => {
    const marker = document.querySelector(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id="${id}"]`);

    return marker?.getAttribute("aria-expanded") === "true";
  }, rootNote.id, { timeout: 3000 });
  await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${rootNote.id}"]`).waitFor();
  assert.equal(await page.evaluate(() => ({ x: scrollX, y: scrollY })).then((point) =>
    point.x === openRootBefore.x && point.y === openRootBefore.y), true,
  "opening a visible root note does not move the page unnecessarily");
  assert.equal(await panel.isVisible(), true, "Notes stays open while the selected note card opens");

  const resolveNote = page.getByRole("button", { name: "Resolve note", exact: true });
  await resolveNote.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((id) =>
    window.__MESURER__.annotations().then((items) => items.some((item) => item.id === id && item.status === "resolved")),
  rootNote.id);
  await panel.getByLabel("Filter notes").selectOption("resolved");
  await panel.getByRole("button", { name: /Root note should remain on the page/ }).waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await panel.getByRole("button", { name: /Preview note with a searchable reply/ }).count(), 0,
    "Resolved filter keeps the resolved note and excludes open notes");

  const resolvedRowOpacity = await panel.getByRole("button", { name: /Root note should remain on the page/ }).evaluate((button) =>
    getComputedStyle(button.parentElement).opacity);

  assert.equal(Number(resolvedRowOpacity) < 1, true, "resolved notes render muted");

  const closeNotes = panel.getByRole("button", { name: "Close Notes", exact: true });
  await click(closeNotes);
  await panel.waitFor({ state: "hidden" });

  const mouseCloseFocus = await notesTool.evaluate((element) => {
    const root = element.getRootNode();

    return (root instanceof ShadowRoot ? root.activeElement : element.ownerDocument.activeElement) === element;
  });

  assert.equal(mouseCloseFocus, true, "mouse activation of Close Notes returns focus to its trigger");
  await click(notesTool);
  await panel.waitFor({ state: "visible" });
  await panel.getByLabel("Filter notes").selectOption("resolved");

  const keyboardCloseNotes = panel.getByRole("button", { name: "Close Notes", exact: true });
  await keyboardCloseNotes.focus();
  await page.keyboard.press("Enter");
  await panel.waitFor({ state: "hidden" });

  const closeButtonFocus = await notesTool.evaluate((element) => {
    const root = element.getRootNode();

    return (root instanceof ShadowRoot ? root.activeElement : element.ownerDocument.activeElement) === element;
  });

  assert.equal(closeButtonFocus, true, "keyboard activation of Close Notes returns focus to its trigger");
  await click(notesTool);
  await panel.waitFor({ state: "visible" });
  await panel.getByLabel("Filter notes").selectOption("open");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await notesTool.getAttribute("aria-expanded"), "false");

  const focusState = await notesTool.evaluate((element) => {
    const root = element.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : element.ownerDocument.activeElement;

    return { matches: active === element, active: active?.outerHTML.slice(0, 180), root: root.constructor.name };
  });

  assert.equal(focusState.matches, true, `closing Notes with Escape restores focus to its toolbar trigger: ${JSON.stringify(focusState)}`);
  await page.keyboard.press("b");
  await stage.waitFor({ state: "visible" });

  const currentSizes = await frames.evaluateAll((items) => items.map((frame) =>
    [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight]));

  const delayedSavedPreview = currentSizes.findIndex(([width, height]) => width === 500 && height === 700);

  if (delayedSavedPreview >= 0) await setPreviewSize(delayedSavedPreview, 1000, 700);
  await click(notesTool);
  await panel.waitFor({ state: "visible" });
  let releaseNavigation;
  let navigationStarted;
  const waitingForNavigation = new Promise((resolve) => { navigationStarted = resolve; });
  await page.route("**/responsive-preview.html", async (route) => {
    if (route.request().isNavigationRequest() && route.request().frame().parentFrame()) {
      await new Promise((resolve) => { releaseNavigation = resolve; navigationStarted(); });
    }

    await route.continue();
  });
  await panel.getByRole("button", { name: /Preview note with a searchable reply/ }).click();
  await waitingForNavigation;
  await panel.getByRole("button", { name: "Close Notes", exact: true }).click();
  await row.evaluate((element) => { element.scrollLeft = 0; });
  const beforeLateLoad = await row.evaluate((element) => element.scrollLeft);
  const delayedFrameIds = await frames.evaluateAll((items) => items.map((frame) => frame.dataset.mesurerResponsivePreviewId));
  releaseNavigation();
  await page.waitForFunction(() => [...document.querySelector("[data-mesurer-island]")?.shadowRoot
    .querySelectorAll("iframe[data-mesurer-responsive-frame]") ?? []]
    .some((frame) => {
      try {
        return frame.contentWindow?.innerWidth === 500 && frame.contentWindow?.innerHeight === 700
          && frame.contentDocument?.querySelector("#inspection-target");
      } catch {
        return false;
      }
    }));
  await settle();
  const afterLateLoad = await row.evaluate((element) => element.scrollLeft);
  assert.equal(afterLateLoad, beforeLateLoad, "closing Notes aborts delayed reveal before any late horizontal scroll");
  revealEvidence.delayedCancellation = { frameIds: delayedFrameIds, beforeLeft: beforeLateLoad, afterLeft: afterLateLoad };
  assert.equal(await panel.count(), 0, "a cancelled delayed reveal does not reopen Notes");
  assert.equal(await page.locator(`[data-mesurer-annotation-panel='true'][data-mesurer-annotation-id="${previewNote.id}"]`).count(), 0,
    "a cancelled delayed reveal does not open the note card");
  await page.unroute("**/responsive-preview.html");
  await page.keyboard.press("Escape");
  await stage.waitFor({ state: "detached" });

  const outcome = {
    url,
    rootNoteId: rootNote.id,
    previewNoteId: previewNote.id,
    identityNoteId: identityNote.id,
    savedPreview: previewNote.anchor.targets[0].viewport,
    rootStart,
    revealEvidence,
    diagnostics: errors,
    rendered: {
      notesToolExpanded: await notesTool.getAttribute("aria-expanded"),
      notesPanelOpenAfterReveal: await panel.count(),
    },
  };

  assert.deepEqual(errors, [], `Browser diagnostics: ${errors.join("\n")}`);
  await writeFile(join(output, "result.json"), `${JSON.stringify(outcome, null, 2)}\n`);
  console.log(`Responsive note reveal contract passed. Evidence: ${output}`);
} catch (error) {
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true, timeout: 5000 }).catch(() => undefined);
  await writeFile(join(output, "failure.json"), `${JSON.stringify({ url, errors, error: String(error) }, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
