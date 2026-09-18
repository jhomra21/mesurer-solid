---
name: mesurer-ui
description: Use Mesurer for frontend UI implementation, review, debugging, layout, spacing, sizing, typography, responsive work, design/Figma implementation, screenshots, or any request to inspect existing Mesurer/Measure state. Preserve live human state, consume saved intent before editing source, and verify the real rendered result before claiming completion.
---

# Mesurer UI workflow

Mesurer is shared visual state between the person reviewing a page and the coding agent editing it. The rendered page is the integration boundary.

The normal coding-agent workflow requires no Mesurer MCP server, chat-delivery daemon, or Send-to-agent callback. Use the browser/evaluation channel the harness already owns and read `window.__MESURER__` directly. The optional `codex()` plugin and local Codex companion are a separate human-initiated convenience for routing Context feedback to explicitly registered Codex threads.

When the current agent is Codex and the user has explicitly asked for Codex delivery, or the live Mesurer instance already has `mesurer.codex` enabled, ensure the packaged local companion is ready from the Codex process. Do not expect browser JavaScript to spawn a local executable.

A meaningful Mesurer step must return evidence the agent actually uses.

## Reuse the live instance

Never reinject, dispose, or replace Mesurer just because this skill loaded. A person may already have selected elements, guides, measurements, annotations, Arrange intent, text/style Desired intent, plugin state, or a screenshot preview open.

Discover first:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, use that exact instance.

If it is absent, evaluate the packaged `assets/inject-script.js` through the browser control the harness already has. Do not add Mesurer to application source, create another browser/CDP connection, or start a Mesurer-specific server merely to inspect a page that is already controllable.

Injection reuses a connected instance by default. `window.__MESURER_CONFIG__ = { reuseExisting: false }` is destructive and belongs only in explicit testing/tooling scenarios.

Normal injection leaves the optional human Screenshot plugin disabled. If that camera tool is required, configure `{ screenshot: true }` before first injection. Do not reinject a live instance just to enable it.

## Inventory broad Mesurer requests

If the user says “check Mesurer,” “check Measure,” “look at Mesurer context,” or otherwise refers broadly to what they selected, moved, annotated, measured, or edited, do not assume `context()` is the whole message.

Collect the live channels first:

```js
await window.__MESURER__.ready()

const capabilities = window.__MESURER__.capabilities().capabilities
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()
const arrangements = capabilities.arrange
  ? await window.__MESURER__.arrangements()
  : []
const textEdits = capabilities.textEdit
  ? await window.__MESURER__.textEdits()
  : []

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Resolve relevant saved records before HMR can replace their targets:

```js
const annotationContexts = await Promise.all(
  annotations.map((annotation) =>
    window.__MESURER__.context({ annotation: annotation.id })
  ),
)

const arrangeIntents = await Promise.all(
  arrangements.map((intent) => window.__MESURER__.arrange(intent.id)),
)

const textEditIntents = await Promise.all(
  textEdits.map((intent) => window.__MESURER__.textEdit(intent.id)),
)
```

Bring forward whatever matters: selection, target-bound notes, Arrange Before/Desired geometry, text Before/Desired copy/style deltas, guides, measurements, held distances, exact inspection, layout/style state, rulers/X-ray, and any human screenshot preview that must be preserved.

Do not clear or replace a channel until its relevant evidence has been consumed.

## Treat Arrange as visual intent

Arrange describes the requested rendered geometry, not how source should implement it.

```js
const intent = await window.__MESURER__.arrange(arrangeId)
```

A 96px Desired offset does not mean production CSS should use `transform: translateX(96px)`. Inspect the surrounding layout and implement the appropriate flex/grid, gap, margin, sizing, ordering, component structure, or other semantic rule.

Arrange can be activated before a selection exists and enables Select automatically. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Before source edits, retain the Arrange id, exact target identity, Before geometry, and Desired geometry. Capture Before/Desired through the existing harness when screenshots materially help.

After source edits:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Live removes the temporary Arrange preview before measuring source output.

Arrange preview ownership is conservative. Mesurer restores an older inline transform only while the current value and priority still match the exact preview Mesurer applied. If the host application changes the transform, preserve that host value; do not force Mesurer to restore an obsolete baseline to make a test pass.

If review is still numerically wrong, continue editing. If target status is stale or partial, do not silently bind the intent to another element.

## Treat text editing as copy and typography intent

The human-facing inspection tool is **Typography**. The internal compatibility id remains `text-inspector`; do not automate normal application work by guessing toolbar labels.

Direct editing starts by double-click/double-tap while Select or Typography is active. Arrange keeps Select active, so editing works while Arrange remains selected.

The editor exposes direct B/I/U, Font, Size, Weight, rendered-page colors, custom color, and a separate Text/H1/H2/H3 semantic preset popup. Missing heading levels are not invented.

The target boundary follows browser editability semantics:

- native form controls stay native;
- descendants that inherit `contenteditable` stay under page/browser editing;
- a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer direct-text target when the ordinary one-unambiguous-direct-text-node rules pass;
- ambiguous mixed/nested rich text is not turned into a fake rich-text editor.

If Typography was already explicitly selected, the direct-edit session suppresses the older hover/pinned Typography surface so there is one live Typography card for the field. Closing the editor restores the normal surface without deselecting Typography.

Direct edit also owns the field's visible selection lane. The ordinary selected MeasurementBox stays logically mounted but its duplicate border is paint-suppressed, the selected dimensions pill remains available, and the source-linked Typography card must not move merely because the pointer moves. The selection-adjacent Add Note button is intentionally hidden only while the editor is active and returns afterward. Existing saved annotations remain durable; do not infer that Context disappeared because this transient button is absent.

In constrained viewports the Typography card may scroll internally. Its custom Family, Size, and Weight popup stays attached to the trigger inside that scrolling card and remains part of the same Mesurer interaction surface; page scrolling still moves the source-linked card and popup together. Do not “fix” a popup by making it independent viewport furniture or by adding page-scroll geometry work.

For normal application work, read saved intent instead of automating the editor UI:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

Treat Desired copy/style as a visual/source requirement, not a request to paste Mesurer's temporary DOM style into production. Reuse the application's semantic props, classes, design tokens, CSS variables, theme values, or stylesheet rules where appropriate.

Preview ownership is also conservative. While the DOM still equals Mesurer's previously owned text/style value, undo and redo can transition it to the restored Desired value. If the application changes the text or inline style itself, Mesurer relinquishes ownership and preserves the host value through later history and cleanup.

Final verification must use Live source with the Desired preview inactive. Keep the intent; do not clear history merely to expose Live.

## Respect presentation controls and inspector ownership

Saved intent and visible presentation are separate. By default, both human presentation switches are OFF:

- **Settings → General → Keep text changes**: OFF means Typography shows saved Desired text/style while it owns presentation, but Select/other tools restore the original page. ON keeps saved text/style visible outside Typography.
- **Settings → General → Keep Arrange changes**: OFF means Arrange shows saved Desired transforms while it owns presentation, but Select/other tools restore the original page. ON keeps saved Arrange presentation visible outside Arrange.

The user can open Settings with the gear button or `Cmd/Ctrl+,`. Changing either switch changes presentation policy only; it must not delete or rewrite saved intent/history. Do not mistake an Original-looking page in Select for missing intent—read the saved Text/Arrange records first.

Mesurer UI is never inspected-page content. Treat `[data-mesurer-root]`, `[data-mesurer-island]`, and `[data-mesurer-inspector-ui]` surfaces as hard selection/hit-test boundaries. Do not look through a Typography card, annotation surface, toolbar, or inspector shell to select page content underneath it.

An Add Note composer is transient and belongs to the exact selection that opened it. If the human changes selection before saving, Mesurer closes that unsaved composer and shows the normal small Add Note trigger for the new selection instead of carrying the draft card to another target. Saved annotations survive same-tab reloads and conservatively rebind through stored selector/fingerprint identity; do not re-create or duplicate a note merely because the host page reloaded. Add Note, saved markers, saved annotation panels, and the composer are protected inspector UI: live page hover/selection chrome paints underneath them. Several notes on one target keep separate nearby markers, and Add Note remains available while a saved note is open.

Scroll ownership is split deliberately:

- page-linked selection boxes, edit rings, selected-text highlights, Add Note/composer, saved annotation markers/panels/ownership edge, and ordinary Typography cards follow the page source they describe;
- saved annotation panels keep a target-relative page point and may leave the viewport with their source instead of following the viewport;
- the transient selection annotation affordance is suppressed while direct text edit owns that source, but saved annotation markers/panels remain independent;
- Typography remains Mesurer-owned for interaction even while its geometry follows the inspected element, so clicking the card cannot select either the card itself or page content underneath it;
- an explicitly dragged pinned Typography card becomes a manual viewport placement and remains there until its pin lifecycle ends;
- the global toolbar and Settings remain viewport-owned UI.

Context can therefore use a managed document inspector mount while the outer Mesurer host is still in the browser top layer. When it does, Select hover evidence must use the lower document evidence layer too. Do not move that page evidence back into the top-layer island while a Context card is document-backed, because browser top-layer ordering would let the blue hover fill or border paint through the card.

Do not “fix” hit testing by making Typography or annotation panels viewport-fixed, and do not “fix” scrolling by allowing Select to look through Mesurer UI. Preserve the separate interaction-ownership, geometry-ownership, and paint-order contracts when changing selection, portals, CSS anchors, or z-index behavior.

## Acquire targets in the right order

After preserving relevant Arrange/text-edit intent:

1. If the human already selected or annotated the target, read it before changing selection.
2. If the intended target is ambiguous, ask the user to select the exact element(s) or region.
3. If there is no relevant human selection and the exact rendered targets are known, call `select()`.

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one target. Missing or ambiguous selectors throw. Refine the selector or ask the human rather than guessing.

## Multi-selection is relational evidence

When several elements are selected, inspect every target and the relationships that matter between them. Do not return only a count or the first element.

Use `selection.visualContext.distances` first. For a needed pair without relevant distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, preserve useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs rather than dumping O(n²) noise.

Use exact Mesurer geometry for numeric claims. Screenshots are for composition and visual judgment, not a substitute for reported pixel values.

## Edit normal application source

Mesurer previews and saved intent describe outcomes. Implement those outcomes through the application's real architecture.

Prefer existing component APIs, design-system tokens, layout primitives, classes, CSS variables, and stylesheet rules over hard-coded replicas of computed/preview values. Preserve unrelated human Mesurer state while HMR updates the application.

## Verify Live after every meaningful source change

Wait for the real render:

```js
await window.__MESURER__.stable()
```

Then compare the same evidence retained before editing:

- Arrange Desired against Live through `reviewArrange()`;
- text/style Desired against Live with text preview inactive;
- saved annotations through `review(annotationId)`;
- current selection and measurements through fresh `context()`;
- focused geometry through `inspect()`, `distance()`, and `viewport()` when needed.

A correct implementation survives with Mesurer previews inactive.

Do not destroy guides, measurements, annotations, Arrange intent, text-edit intent, plugin state, or screenshot preview just to make validation appear clean.

## Screenshots

For coding-agent evidence, the outer harness owns screenshot bytes while Mesurer prepares presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ annotation: annotationId }` for a saved annotation baseline.

The optional Screenshot plugin is a separate human camera workflow. Preserve an existing human thumbnail/viewer unless the task specifically concerns that feature.

## Optional Codex thread handoff

Only use this path when the user has explicitly asked for Mesurer-to-Codex delivery or the live Mesurer instance already has `mesurer.codex` enabled. The browser plugin and the local companion have separate ownership: Settings can load or unload browser-side `codex()` immediately, but ordinary browser JavaScript cannot spawn `codex` or a Node/Bun child process.

When this task is running inside Codex, make the local companion zero-manual from the user's perspective. First check whether the live plugin is enabled when a Mesurer instance already exists:

```js
const codexEnabled = Boolean(
  window.__MESURER_INSTANCE__?.pluginHost?.has("mesurer.codex")
)
```

If Codex delivery was requested or `codexEnabled` is true, run the installed companion helper from the Codex shell/tool environment:

```bash
node .agents/skills/mesurer-ui/assets/codex-connect.mjs
```

`mesurer-codex-connect` reads Codex's `CODEX_THREAD_ID` and, when invoked from the trusted `SessionStart` hook, the project working directory. It reuses a healthy bridge at `127.0.0.1:47365`, or starts the packaged `codex-bridge.mjs` companion when none is running, waits for it to become ready, then registers the current session and project directory. In the Mesurer Solid repository itself, the equivalent source command is:

```bash
bun run mesurer-codex-connect
```

Do not ask the user to start a second bridge when this helper can ensure one. Do not use npm postinstall scripts, private Codex persistence, browser thread registration, or an arbitrary remote service as substitutes for the local companion.

Mesurer delivery is Queue, not Steer. Queue preserves the current Codex turn and adds the feedback behind it. Codex's own **Steer** affordance promotes a queued follow-up into an active turn; the Mesurer bridge does not perform `turn/steer` today. Do not tell the user that Queue interrupted or redirected an in-flight response.

After `codex queue` durably accepts a message, the bridge keeps Codex's returned queued-submission id and checks the same shared app-server daemon. If that destination is `notLoaded`, the bridge issues `thread/resume` on that daemon so Codex can dispatch its persisted queue in order. Loaded idle/active threads stay under Codex's own queue scheduler. This wake step does not steer or interrupt an active turn, and a wake-check failure after persistence must not be retried as a second queue submission.

The browser plugin must not probe loopback merely because it is mounted. The human's first **Queue to Codex** press or **Choose Codex thread…** action establishes bridge availability. If first contact fails, the tool becomes **Codex unavailable** and offers **Retry Codex connection**. After one successful connection, background health checks may keep that known connection honest and recover it after a bridge restart. Do not add unconditional mount-time polling; strict CSP hosts must remain clean when Codex delivery is unused.

The first unambiguous healthy bridge thread observed by a Mesurer page is that page's origin. The browser keeps that origin and any explicit destination override in per-tab `sessionStorage`, so reloading the page does not adopt a different bridge-wide target. Later Codex sessions may register with the shared companion without silently retargeting the existing page. If a page has no saved affinity and more than one registered thread is available, require the human to choose a destination rather than guessing from the bridge default. The bridge may ask Codex app-server for at most ten recent threads in the origin project's working directory. The picker shows the origin/current thread first, four more recent same-project threads, then one **Show 5 more…** expansion.

Browser pages may send only to locally registered threads or to recent same-project threads that the bridge itself discovered through Codex app-server. They may not supply an arbitrary cwd or invent arbitrary Codex destinations. If `CODEX_THREAD_ID` is unavailable, do not weaken the local registration boundary to make registration work from the page.

When application code has mounted `codex()` next to `context()`, its typed `codex:v1` service supports `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and `send({ thread })`. `useThread(thread)` is for a locally registered bridge default; `send({ thread })` may target any bridge-visible same-project thread.

The human queue action is single-flight. It disables before queue submission, then moves through Queueing, Queued, Working, and Finished/Interrupted using the trusted `UserPromptSubmit`, `Stop`, and `Interrupt` hook reports. Do not work around that guard by issuing a duplicate queue request.

If the queued evidence contains saved annotations, the browser tracks the exact ids that were sent and removes only those ids after the matching turn reports Stop. Queued/working delivery state survives a same-tab reload, so do not requeue merely because the page refreshed. Interrupted/failed work keeps the note. Do not manually delete unrelated annotations, and do not describe lifecycle completion as semantic verification: still inspect the live rendered result before claiming the request is done.

Do not create a new Codex thread from the Mesurer bridge. A new app-server turn can produce command or file approval requests that belong to the client owning that turn. Create or open the thread in Codex and let the trusted `SessionStart` path register it automatically.

If the Codex plugin is later disabled in Mesurer Settings, its browser service, command, and toolbar action disappear. Do not kill the shared local companion solely because one page disabled its plugin: another page or Codex thread may still use it.

This transport is separate from the normal `window.__MESURER__` evidence workflow and must not replace browser-based verification.
## Completion

Do not call every Mesurer method after every edit. Measure what matters to the request.

A completion should be evidence-based: exact target geometry or relationships where relevant, Live copy/typography when text intent exists, review deltas when Arrange/annotations exist, and a real browser screenshot when composition matters.

If the evidence still disagrees with the requested result, continue working rather than explaining why the source “should” be correct.