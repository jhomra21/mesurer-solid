---
name: mesurer-ui
description: Use Mesurer for frontend UI implementation, review, debugging, layout, spacing, sizing, typography, responsive work, design/Figma implementation, screenshots, or any request to inspect existing Mesurer/Measure state. Preserve live human state, consume saved intent before editing source, and verify the real rendered result before claiming completion.
---

# Mesurer UI workflow

Mesurer is shared visual state between the person reviewing a page and the coding agent editing it. The rendered page is the integration boundary.

The normal coding-agent workflow requires no Mesurer MCP server, chat-delivery daemon, or Send-to-agent callback. Use the browser/evaluation channel the browser controller already provides and read `window.__MESURER__` directly. The optional `codex()` plugin and local Codex companion are a separate human-initiated convenience for routing Context feedback to explicitly registered Codex threads.

When the current agent is Codex and the user has explicitly asked for Codex delivery, or the live Mesurer instance already has `mesurer.codex` enabled, ensure the packaged local companion is ready from the Codex process. Do not expect browser JavaScript to spawn a local executable.

A meaningful Mesurer step must return evidence the agent actually uses.

## Know the available capabilities

The base inspector has Select, X-ray, Rulers, Typography, Guides, Distance, and Settings. Color Picker is available when the browser exposes a working `EyeDropper`.

Optional first-party plugins add Context, Arrange, Screenshot, and Codex delivery. Context carries annotations and structured evidence. Arrange carries Before/Desired/Live geometry intent. Screenshot is a human capture tool. Codex is an optional human queue transport, not the normal agent protocol.

The JSON-safe `window.__MESURER__` object exposes the full agent API. Lifecycle and discovery methods are `ready()`, `capabilities()`, `describe()`, `state()`, and `stable()`. Inspection methods are `inspect()`, `inspectAll()`, `at()`, `distance()`, `viewport()`, and `feedback()`. `command()` runs registered Mesurer commands.

Context adds `context()`, `contextText()`, `select()`, `annotations()`, `review()`, `capturePlan()`, `prepareCapture()`, and `finishCapture()`. Arrange adds `arrangements()`, `arrange()`, `showArrange()`, `arrangeCapturePlan()`, and `reviewArrange()`. Text intent is available through `textEdits()` and `textEdit()`. Use the narrowest method that answers the task without replacing human selection or saved intent.

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

If it is absent, evaluate the packaged `assets/inject-script.js` through the browser controller already available. Do not add Mesurer to application source, create another browser/CDP connection, or start a Mesurer-specific server merely to inspect a page that is already controllable.

Injection reuses a connected instance by default. `window.__MESURER_CONFIG__ = { reuseExisting: false }` is destructive and belongs only in explicit testing/tooling scenarios.

Normal injection leaves the optional human Screenshot plugin disabled. If that camera tool is required, configure `{ screenshot: true }` before first injection. Do not reinject a live instance just to enable it.

## Inventory broad Mesurer requests

If the user says "check Mesurer," "check Measure," "look at Mesurer context," or otherwise refers broadly to what they selected, moved, annotated, measured, or edited, do not assume `context()` is the whole message.

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

Before source edits, retain the Arrange id, exact target identity, Before geometry, and Desired geometry. Capture Before/Desired through the existing browser controller when screenshots materially help.

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
- a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer direct-text target when the ordinary direct-text-run rules pass;
- mixed inline copy can target the exact direct text run under the pointer without flattening or recreating inline children or replacing the host element's native DOM APIs;
- ambiguous nested rich text is not turned into a fake rich-text editor.

If Typography was already explicitly selected, the direct-edit session suppresses the older hover/pinned Typography UI so there is one live Typography card for the field. Closing the editor restores the normal Typography UI without deselecting Typography.

Direct edit also owns the field's visible selection lane. The ordinary selected MeasurementBox stays logically mounted but its duplicate border is paint-suppressed, the selected dimensions pill remains available, and the source-linked Typography card must not move merely because the pointer moves. The selection-adjacent Add Note button is hidden only while the editor is active and returns afterward. Existing saved annotations remain durable; do not infer that Context disappeared because this transient button is absent.

In constrained viewports the Typography card may scroll internally. Its custom Family, Size, and Weight popup stays attached to the trigger inside that scrolling card and remains part of the same Mesurer interaction UI; page scrolling still moves the source-linked card and popup together. Do not "fix" a popup by making it independent viewport furniture or by adding page-scroll geometry work.

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

- **Settings > General > Keep text changes.** When OFF, Typography shows saved Desired text/style while it owns presentation, but Select and other tools restore the original page. ON keeps saved text/style visible outside Typography.
- **Settings > General > Keep Arrange changes.** When OFF, Arrange shows saved Desired transforms while it owns presentation, but Select and other tools restore the original page. ON keeps saved Arrange presentation visible outside Arrange.

The user can open Settings with the gear button or `Cmd/Ctrl+,`. Changing either switch changes presentation policy only; it must not delete or rewrite saved intent/history. Do not treat an Original-looking page in Select as missing intent. Read the saved Text/Arrange records first.

Mesurer UI is never inspected-page content. Treat `[data-mesurer-root]`, `[data-mesurer-island]`, and `[data-mesurer-inspector-ui]` as hard selection and hit-test boundaries. Do not look through a Typography card, annotation UI, toolbar, or inspector shell to select page content underneath it.

An Add Note composer is transient and belongs to the exact selection that opened it. If the human changes selection before saving, Mesurer closes that unsaved composer and shows the normal small Add Note trigger for the new selection instead of carrying the draft card to another target. Saved annotations survive same-tab reloads and conservatively rebind through stored selector/fingerprint identity; do not re-create or duplicate a note merely because the host page reloaded. Add Note, saved markers, saved annotation panels, and the composer are protected inspector UI: live page hover/selection chrome paints underneath them. Several notes on one target keep separate nearby markers, and Add Note remains available while a saved note is open.

Scroll ownership is split deliberately:

- page-linked selection boxes, edit rings, selected-text highlights, Add Note/composer, saved annotation markers/panels/ownership edge, and ordinary Typography cards follow the page source they describe;
- saved annotation panels keep a target-relative page point and may leave the viewport with their source instead of following the viewport;
- the transient selection annotation affordance is suppressed while direct text edit owns that source, but saved annotation markers/panels remain independent;
- Typography remains Mesurer-owned for interaction even while its geometry follows the inspected element, so clicking the card cannot select either the card itself or page content underneath it;
- an explicitly dragged pinned Typography card becomes a manual viewport placement and remains there until its pin lifecycle ends;
- the global toolbar and Settings remain viewport-owned UI.

Context can therefore use a managed document inspector mount while the outer Mesurer host is still in the browser top layer. When it does, Select hover evidence must use the lower document evidence layer too. Do not move that page evidence back into the top-layer island while a Context card is document-backed, because browser top-layer ordering would let the blue hover fill or border paint through the card.

Do not "fix" hit testing by making Typography or annotation panels viewport-fixed, and do not "fix" scrolling by allowing Select to look through Mesurer UI. Preserve the separate interaction-ownership, geometry-ownership, and paint-order contracts when changing selection, portals, CSS anchors, or z-index behavior.

## Use the low-level agent API when needed

Context and saved intent should drive normal UI work. Use the lower-level methods when they answer a narrower question without changing human state:

```js
const one = window.__MESURER__.inspect("#pricing-card")
const many = window.__MESURER__.inspectAll(".pricing-card", 8)
const hit = window.__MESURER__.at(320, 240)
const gap = window.__MESURER__.distance("#pricing-card", "#pricing-cta")
const viewport = window.__MESURER__.viewport()
const snapshot = await window.__MESURER__.feedback([
  "#pricing-card",
  "#pricing-cta",
])
const pluginState = await window.__MESURER__.state()
```

`describe()` reports the loaded plugin contract. `command(id, args?)` executes a registered Mesurer command. Use these only when the task requires plugin-level control; do not replace a human selection or saved intent with commands just because commands are available.

`contextText()` returns a text form of Context when structured JSON is not useful. `capturePlan()`, `prepareCapture()`, and `finishCapture()` coordinate external screenshots. Arrange also exposes `arrangeCapturePlan()`.

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

Prefer existing component APIs, design-system tokens, layout APIs, classes, CSS variables, and stylesheet rules over hard-coded replicas of computed/preview values. Preserve unrelated human Mesurer state while HMR updates the application.

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

For coding-agent evidence, the browser controller owns screenshot bytes while Mesurer prepares presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // browser-controller screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ annotation: annotationId }` for a saved annotation baseline.

The optional Screenshot plugin is a separate human camera workflow. Preserve an existing human thumbnail/viewer unless the task specifically concerns that feature.

## Optional Codex thread handoff

Use this only when the user asked for Mesurer-to-Codex delivery or the live Mesurer instance already has `mesurer.codex` enabled. Normal agent work still uses `window.__MESURER__` and browser verification.

When this task is running inside Codex, check whether the live page already has the plugin:

```js
const codexEnabled = Boolean(
  window.__MESURER_INSTANCE__?.pluginHost?.has("mesurer.codex")
)
```

If delivery was requested or `codexEnabled` is true, start or reuse the packaged companion from the Codex shell or tool environment:

```bash
node .agents/skills/mesurer-ui/assets/codex-connect.mjs
```

Inside the Mesurer Solid repository, use:

```bash
bun run mesurer-codex-connect
```

Keep these delivery rules:

- Mesurer uses Queue, never `turn/steer`.
- Codex's native durable queue is the message source of truth.
- Desktop delivery queues once, keeps the queued-submission id, and opens the existing `codex://threads/<threadId>` destination. Do not use the Desktop app-tools pipe as a second delivery path.
- Do not delete and resend a queued item after a bridge restart. The bridge persistence file tracks lifecycle; it is not another message queue.
- The browser plugin connects lazily when the human first queues feedback or opens the thread picker. Do not add mount-time loopback polling.
- Each page keeps its originating or explicitly chosen thread in per-tab state. If routing is ambiguous, require a human choice.
- Queue submission is single-flight. Do not bypass duplicate suppression with a second request.
- A completed matched turn may remove only the annotation ids included in that delivery. Interrupted, failed, or uncertain work keeps them.
- Mesurer does not create Codex threads. Create or open the thread in Codex and let the trusted `SessionStart` connector register it.

The typed `codex:v1` service supports `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and `send({ thread })`.

Codex delivery tracks transport and turn lifecycle. It does not prove that the UI change is correct. Verify the rendered result through Mesurer before completing the task.

## Completion

Do not call every Mesurer method after every edit. Measure what matters to the request.

A completion should be evidence-based: exact target geometry or relationships where relevant, Live copy/typography when text intent exists, review deltas when Arrange/annotations exist, and a real browser screenshot when composition matters.

If the evidence still disagrees with the requested result, continue working rather than explaining why the source "should" be correct.