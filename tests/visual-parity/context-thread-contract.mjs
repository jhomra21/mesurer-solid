import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Failure modes this contract guards against:
// - a reply creates another annotation/marker or changes the saved baseline;
// - reply text is absent from the rendered thread, Context, or clipboard;
// - Enter, Shift+Enter, blank input, or IME composition submit incorrectly;
// - editing/deleting a reply mutates the original note or deletes the thread;
// - resolved notes cannot be reopened or are omitted from explicit Context;
// - reload loses replies/status or changes stable annotation identity;
// - asynchronous delivery cleanup removes feedback changed after it was queued.
const url = process.env.CONTEXT_THREAD_URL ?? "http://127.0.0.1:4192/";

const output = process.env.CONTEXT_THREAD_OUT ?? join(dirname(fileURLToPath(import.meta.url)), "context-thread-artifacts");

await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1162, height: 700 } });

const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));

page.on("console", (message) => {
  if (message.type() === "error" || message.text().includes("STRICT_READ_UNTRACKED")) {
    errors.push(message.text());
  }
});

const settle = () => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));

const getAnnotations = (note) => page.evaluate((needle) => {
  for (const key of Object.keys(sessionStorage)) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key));
      const annotation = value.annotations?.find((item) => item.note === needle);

      if (annotation) return annotation;
    } catch {}
  }

  return null;
}, note);

const clickAtCenter = async (locator) => {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }).then(({ x, y }) => page.mouse.move(x, y));
  await locator.click();
};

try {
  await page.addInitScript(() => {
    const key = `mesurer-parity-playground:mesurer.context:${location.origin}:${location.pathname}`;

    if (sessionStorage.getItem(key) !== null) return;

    const rect = { left: 12, top: 12, width: 24, height: 24 };

    sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      annotations: [{
        id: "malformed-reply-seed",
        note: "Restore valid duplicate reply",
        createdAt: 1,
        anchor: { kind: "region", rect },
        baseline: { targets: [], guides: [], measurements: [], distances: [] },
        replies: [
          null,
          { id: "same", text: null, createdAt: 1 },
          { id: "same", text: "VALID REPLY", createdAt: 2 },
          { id: "other", text: "Other valid", createdAt: 3 },
        ],
      }],
    }));
  });
  await page.goto(url, { waitUntil: "networkidle" });
  const seeded = await page.evaluate(() => window.__MESURER__.annotations());
  assert.deepEqual(
    seeded.find((item) => item.id === "malformed-reply-seed")?.replies?.map(({ text }) => text),
    ["VALID REPLY", "Other valid"],
    "a malformed entry must not claim a later valid reply id",
  );
  await page.locator("button[data-mesurer-builtin='select']").click();
  const targetBox = await page.locator(".hero h1").boundingBox();
  assert(targetBox);
  await page.mouse.click(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  const addNote = page.locator("[data-mesurer-annotation-trigger='true']");
  await clickAtCenter(addNote);

  const noteComposer = page.locator("[data-mesurer-annotation-composer='true']");
  const noteInput = noteComposer.locator("textarea");
  await noteInput.fill("Preserve the original review note.");
  await noteInput.press("Enter");
  await noteComposer.waitFor({ state: "hidden" });
  await settle();

  const initial = await getAnnotations("Preserve the original review note.");
  assert(initial, "the original note should be saved");
  const originalBaseline = structuredClone(initial.baseline);
  const originalAnchor = structuredClone(initial.anchor);
  const markerSelector = `[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${initial.id}']`;
  const marker = page.locator(markerSelector);
  await clickAtCenter(marker);

  const panel = page.locator("[data-mesurer-annotation-panel='true']");
  await panel.waitFor({ state: "visible" });
  assert.match(await panel.innerText(), /Preserve the original review note\./);
  const resolveButton = panel.getByRole("button", { name: "Resolve note", exact: true });
  assert.equal(await resolveButton.locator("svg").count(), 1);
  assert.equal(await resolveButton.evaluate((button) => button.textContent.trim()), "");
  assert.equal(await resolveButton.getAttribute("aria-pressed"), "false");

  const openCheckColors = await resolveButton.locator("[data-mesurer-annotation-resolve-check='true']").evaluate((path) => ({
    check: getComputedStyle(path).stroke,
    circle: getComputedStyle(path.ownerSVGElement.querySelector("circle")).stroke,
  }));

  assert.equal(openCheckColors.check, openCheckColors.circle, "unresolved check must be drawn in the icon color, not the card surface");

  const headerGeometry = await panel.locator("[aria-label='Drag annotation panel']").evaluate((header) => {
    const title = header.querySelector("div > div:first-child");
    const subtitle = header.querySelector("div > div:last-child");
    const titleRect = title.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();

    return {
      titleHeight: title.scrollHeight,
      titleClientHeight: title.clientHeight,
      titleTop: titleRect.top,
      titleBottom: titleRect.bottom,
      headerTop: headerRect.top,
      headerBottom: headerRect.bottom,
      subtitleLineHeight: getComputedStyle(subtitle).lineHeight,
      subtitleHeight: subtitle.getBoundingClientRect().height,
      subtitleWhiteSpace: getComputedStyle(subtitle).whiteSpace,
    };
  });

  assert(headerGeometry.titleHeight <= headerGeometry.titleClientHeight, "header title must not be clipped");
  assert(headerGeometry.titleTop >= headerGeometry.headerTop && headerGeometry.titleBottom <= headerGeometry.headerBottom,
    `header title must sit inside the header: ${JSON.stringify(headerGeometry)}`);
  assert.equal(headerGeometry.subtitleWhiteSpace, "nowrap");
  assert.equal(headerGeometry.subtitleHeight, Number.parseFloat(headerGeometry.subtitleLineHeight),
    "subtitle stays on one line");

  const borderColor = await panel.locator("[data-mesurer-annotation-thread-history='true'] + div")
    .evaluate((element) => getComputedStyle(element).borderTopColor);

  assert.notEqual(borderColor, "rgb(0, 0, 0)");

  await page.screenshot({ path: `${output}/note-card-light.png` });
  const replyInput = panel.getByRole("textbox", { name: /reply to note/i });
  await replyInput.fill("First reply, sent by button.");

  const sendReply = panel.getByRole("button", { name: /send reply/i });

  const sendColors = await sendReply.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    icon: getComputedStyle(button.querySelector("svg path")).color,
  }));

  assert.equal(sendColors.background, "rgb(13, 153, 255)");
  assert.equal(sendColors.icon, "rgb(255, 255, 255)", "enabled send arrow must be white on its accent fill");
  await clickAtCenter(sendReply);
  await settle();
  await replyInput.waitFor({ state: "visible" });
  assert.equal(await replyInput.inputValue(), "", "successful send clears the draft");
  assert.equal(await page.locator(markerSelector).count(), 1, "reply must not create a marker");
  assert.match(await panel.innerText(), /First reply, sent by button\./);

  await replyInput.fill("Second reply, first line");
  await replyInput.press("Shift+Enter");
  await replyInput.type("second line");
  await replyInput.press("Enter");
  await settle();
  assert.equal(await replyInput.evaluate((element) => element.style.height), "34px");
  assert.equal(await replyInput.evaluate((element) => element.scrollTop), 0);
  assert.match(await panel.innerText(), /First reply, sent by button\.[\s\S]*Second reply, first line\nsecond line/);
  assert.equal(await page.locator(markerSelector).count(), 1);

  const beforeEdit = await getAnnotations("Preserve the original review note.");
  const firstReplyRow = panel.locator(`[data-mesurer-annotation-reply='${beforeEdit.replies[0].id}']`);
  await clickAtCenter(firstReplyRow.getByRole("button", { name: /more actions for reply/i }));
  await clickAtCenter(firstReplyRow.getByRole("button", { name: "Edit", exact: true }));
  const editInput = firstReplyRow.getByRole("textbox", { name: "Edit reply" });
  await editInput.fill("Edited first reply.");
  await editInput.press("Enter");
  await settle();
  assert.match(await firstReplyRow.innerText(), /Edited first reply\./);

  const secondReplyId = beforeEdit.replies[1].id;
  const secondReplyRow = panel.locator(`[data-mesurer-annotation-reply='${secondReplyId}']`);
  await clickAtCenter(secondReplyRow.getByRole("button", { name: /more actions for reply/i }));
  await clickAtCenter(secondReplyRow.getByRole("button", { name: "Delete", exact: true }));
  const replyDeleteDialog = page.getByRole("dialog", { name: "Delete reply", exact: true });
  await replyDeleteDialog.waitFor({ state: "visible" });

  const replySurface = await replyDeleteDialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
    rect: (() => {
      const { x, y, width, height } = element.getBoundingClientRect();

      return { x, y, width, height };
    })(),
    panel: (() => {
      const { x, y, width, height } = element.closest("[data-mesurer-annotation-panel]").getBoundingClientRect();

      return { x, y, width, height };
    })(),
  }));

  assert.notEqual(replySurface.background, "rgba(0, 0, 0, 0)", "confirmation surface must be opaque");
  assert.notEqual(replySurface.shadow, "none", "confirmation must have a floating shadow");
  assert(replySurface.rect.x >= replySurface.panel.x && replySurface.rect.x + replySurface.rect.width <= replySurface.panel.x + replySurface.panel.width,
    "reply confirmation stays inside the card horizontally");
  assert(replySurface.rect.y >= replySurface.panel.y && replySurface.rect.y + replySurface.rect.height <= replySurface.panel.y + replySurface.panel.height,
    "reply confirmation stays inside the card vertically");
  assert.match(await replyDeleteDialog.innerText(), /Delete this reply\?/);
  await clickAtCenter(replyDeleteDialog.getByRole("button", { name: "No", exact: true }));
  assert.match(await panel.innerText(), /second line/, "cancel preserves the reply");
  await clickAtCenter(secondReplyRow.getByRole("button", { name: /more actions for reply/i }));
  await clickAtCenter(secondReplyRow.getByRole("button", { name: "Delete", exact: true }));
  await clickAtCenter(secondReplyRow.getByRole("button", { name: "Yes", exact: true }));
  await settle();
  assert.equal(await panel.locator("[data-mesurer-annotation-reply]").count(), 1);

  const withReplies = await getAnnotations("Preserve the original review note.");
  assert.equal(withReplies.id, initial.id);
  assert.deepEqual(withReplies.baseline, originalBaseline, "replies must not rewrite baseline evidence");
  assert.deepEqual(withReplies.anchor, originalAnchor, "replies must preserve target identity");
  assert.deepEqual(withReplies.replies.map(({ text }) => text), [
    "Edited first reply.",
  ]);

  const moreActions = firstReplyRow.getByRole("button", { name: /more actions for reply/i });
  await clickAtCenter(moreActions);
  await clickAtCenter(firstReplyRow.getByRole("button", { name: "Edit", exact: true }));
  const cancelEditInput = firstReplyRow.getByRole("textbox", { name: "Edit reply" });
  assert.equal(await cancelEditInput.evaluate((element) => document.activeElement === element),
    true,
    "opening edit moves keyboard focus into its textarea");
  await cancelEditInput.fill("discard this edit");
  await page.mouse.move(20, 20);
  await settle();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Edit reply",
    "runtime notifications preserve edit focus");
  await page.keyboard.press("Escape");
  assert.equal(await firstReplyRow.getByRole("textbox", { name: "Edit reply" }).count(), 0,
    "first Escape cancels editing only");

  const selectionBeforeCardClose = await page.evaluate(async () =>
    (await window.__MESURER__.context({ scope: "selection" })).targets.length);

  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.equal(await page.locator("[data-mesurer-responsive-stage]").count(), 0,
    "closing a root note does not change another global surface");
  assert.equal(await page.evaluate(async () =>
    (await window.__MESURER__.context({ scope: "selection" })).targets.length),
  selectionBeforeCardClose,
  "closing the note does not clear selection");
  await clickAtCenter(marker);

  await page.getByRole("button", { name: "Close annotation", exact: true }).click();
  const secondTarget = page.locator(".hero p").first();
  const secondTargetBox = await secondTarget.boundingBox();
  assert(secondTargetBox);
  await page.mouse.click(secondTargetBox.x + secondTargetBox.width / 2, secondTargetBox.y + secondTargetBox.height / 2);
  await clickAtCenter(page.locator("[data-mesurer-annotation-trigger='true']"));
  const secondComposer = page.locator("[data-mesurer-annotation-composer='true'] textarea");
  await secondComposer.fill("Second parent note.");
  await secondComposer.press("Enter");
  await settle();
  const secondAnnotation = await getAnnotations("Second parent note.");
  assert(secondAnnotation);
  const secondMarker = page.locator(`[data-mesurer-annotation-marker='true'][data-mesurer-annotation-id='${secondAnnotation.id}']`);
  await page.getByRole("button", { name: "Close annotation", exact: true }).click();
  await clickAtCenter(marker);
  const firstParentInput = page.locator("[data-mesurer-annotation-panel='true']").getByRole("textbox", { name: /reply to note/i });
  await firstParentInput.fill("Draft belongs to first parent");
  await clickAtCenter(secondMarker);
  assert.equal(await page.locator("[data-mesurer-annotation-panel='true']").getAttribute("data-mesurer-annotation-id"), initial.id,
    "the first outside marker click cannot switch the draft parent");
  assert.equal(await firstParentInput.inputValue(), "Draft belongs to first parent");
  await firstParentInput.press("Enter");
  await settle();
  assert.deepEqual((await getAnnotations("Preserve the original review note.")).replies.map(({ text }) => text), [
    "Edited first reply.",
    "Draft belongs to first parent",
  ]);
  assert.equal((await getAnnotations("Second parent note.")).replies?.length ?? 0, 0,
    "the draft is never submitted to the second annotation");
  await firstParentInput.press("Escape");
  await panel.waitFor({ state: "hidden" });

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clickAtCenter(marker);
  await clickAtCenter(panel.getByRole("button", { name: "Copy annotation context" }));
  await page.waitForFunction(() =>
    navigator.clipboard.readText().then((value) => value.includes("Edited first reply.")));
  const contextText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(contextText, /Replies[\s\S]*Edited first reply\./);

  await clickAtCenter(panel.getByRole("button", { name: /resolve note/i }));
  await settle();
  const resolvedButton = panel.getByRole("button", { name: "Reopen note", exact: true });
  assert.equal(await resolvedButton.locator("svg").count(), 1);
  assert.equal(await resolvedButton.evaluate((button) => button.textContent.trim()), "");
  assert.equal(await resolvedButton.getAttribute("aria-pressed"), "true");

  const resolveColors = await resolvedButton.locator("[data-mesurer-annotation-resolve-check='true']").evaluate((path) => ({
    check: getComputedStyle(path).stroke,
    fill: getComputedStyle(path.ownerSVGElement.querySelector("circle")).fill,
  }));

  assert.notEqual(resolveColors.check, resolveColors.fill, "resolved check stroke must contrast with its circle fill");
  await page.screenshot({ path: `${output}/note-card-resolved.png` });
  const resolved = await getAnnotations("Preserve the original review note.");
  assert.equal(resolved.status, "resolved");
  assert(Number.isFinite(resolved.resolvedAt));
  assert.equal((await page.locator(markerSelector).getAttribute("data-mesurer-annotation-status")), "resolved");
  await clickAtCenter(panel.getByRole("button", { name: "Copy annotation context" }));
  await page.waitForFunction(() =>
    navigator.clipboard.readText().then((value) => value.includes("Status: resolved")));
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Status: resolved/);
  await clickAtCenter(panel.getByRole("button", { name: /reopen note/i }));
  assert.equal((await getAnnotations("Preserve the original review note.")).status, "open");
  const beforeReload = await getAnnotations("Preserve the original review note.");
  const repliesBeforeReload = structuredClone(beforeReload.replies);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__MESURER__));
  await page.evaluate(() => window.__MESURER__.ready());
  await settle();
  const restored = await getAnnotations("Preserve the original review note.");
  assert(restored, "same-tab reload should preserve the annotation");
  assert.deepEqual(restored.replies, repliesBeforeReload, "same-tab reload should preserve reply ids, order and timestamps");
  assert.deepEqual(restored.baseline, originalBaseline);
  assert.deepEqual(restored.anchor, originalAnchor);
  assert.equal(restored.status, "open");
  await clickAtCenter(marker);
  const restoredPanel = page.locator("[data-mesurer-annotation-panel='true']");
  const deleteNote = restoredPanel.getByRole("button", { name: "Delete annotation", exact: true });
  await clickAtCenter(deleteNote);
  const noteDialog = page.getByRole("dialog", { name: "Delete note", exact: true });
  await noteDialog.waitFor({ state: "visible" });
  assert(await getAnnotations("Preserve the original review note."));

  const noteSurface = await noteDialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
  }));

  assert.notEqual(noteSurface.background, "rgba(0, 0, 0, 0)", "note confirmation surface must be opaque");
  assert.notEqual(noteSurface.shadow, "none", "note confirmation must have a floating shadow");

  const noteBounds = await noteDialog.evaluate((element) => {
    const dialog = element.getBoundingClientRect();
    const panel = element.closest("[data-mesurer-annotation-panel]").getBoundingClientRect();

    return {
      insidePanel: dialog.left >= panel.left && dialog.right <= panel.right
        && dialog.top >= panel.top && dialog.bottom <= panel.bottom,
    };
  });

  assert(noteBounds.insidePanel, "note confirmation must remain inside the card bounds");
  await page.screenshot({ path: `${output}/note-card-delete-confirmation.png` });
  await page.keyboard.press("Escape");
  await noteDialog.waitFor({ state: "hidden" });
  assert.equal(await restoredPanel.isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Delete annotation");
  assert(await getAnnotations("Preserve the original review note."));
  await page.locator("[data-mesurer-context-root='true']").evaluate((root) => root.setAttribute("data-theme", "dark"));
  await clickAtCenter(deleteNote);
  const darkNoteDialog = page.getByRole("dialog", { name: "Delete note", exact: true });
  await darkNoteDialog.waitFor({ state: "visible" });

  const darkSurface = await darkNoteDialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
  }));

  assert.notEqual(darkSurface.background, "rgba(0, 0, 0, 0)", "dark confirmation surface must be opaque");
  assert.notEqual(darkSurface.shadow, "none", "dark confirmation must have a floating shadow");
  await page.screenshot({ path: `${output}/note-card-delete-confirmation-dark.png` });
  await page.keyboard.press("Escape");
  await darkNoteDialog.waitFor({ state: "hidden" });
  await page.locator("[data-mesurer-context-root='true']").evaluate((root) => root.setAttribute("data-theme", "light"));
  await clickAtCenter(deleteNote);
  await page.mouse.click(10, 10);
  await noteDialog.waitFor({ state: "hidden" });
  assert(await getAnnotations("Preserve the original review note."));
  await clickAtCenter(deleteNote);
  await clickAtCenter(page.getByRole("dialog", { name: "Delete note", exact: true }).getByRole("button", { name: "Yes", exact: true }));
  await restoredPanel.waitFor({ state: "hidden" });
  assert.equal(await getAnnotations("Preserve the original review note."), null);

  await writeFile(`${output}/result.json`, JSON.stringify({
    annotationId: initial.id,
    beforeBaseline: originalBaseline,
    afterBaseline: restored.baseline,
    repliesBeforeReload,
    repliesAfterReload: restored.replies,
    resolvedAt: resolved.resolvedAt,
    contextText,
    markerCountAfterReplies: 1,
    persisted: beforeReload.id === initial.id && restored.id === initial.id,
  }, null, 2));
  await page.screenshot({ path: `${output}/replied-thread.png`, fullPage: true });
  await clickAtCenter(secondMarker);
  await page.locator("[data-mesurer-context-root='true']").evaluate((root) => root.setAttribute("data-theme", "dark"));
  await settle();
  await page.screenshot({ path: `${output}/note-card-dark.png` });
  assert.deepEqual(errors, [], `browser diagnostics should be clean: ${errors.join("\n")}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  await page.context().tracing.stop({ path: `${output}/failure-trace.zip` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
