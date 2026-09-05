---
name: mesurer-ui
description: Use Mesurer for frontend UI implementation, review, debugging, layout, spacing, sizing, typography, responsive work, design/Figma implementation, screenshots, or any request to inspect existing Mesurer/Measure state. Preserve live human state, consume saved intent before editing source, and verify the real rendered result before claiming completion.
---

# Mesurer UI workflow

Mesurer is shared visual state between the person reviewing a page and the coding agent editing it. The rendered page is the integration boundary.

There is no Mesurer MCP server, chat-delivery daemon, or Send-to-agent callback. Use the browser/evaluation channel the harness already owns and read `window.__MESURER__` directly.

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

For normal application work, read saved intent instead of automating the editor UI:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

Treat Desired copy/style as a visual/source requirement, not a request to paste Mesurer's temporary DOM style into production. Reuse the application's semantic props, classes, design tokens, CSS variables, theme values, or stylesheet rules where appropriate.

Preview ownership is also conservative. While the DOM still equals Mesurer's previously owned text/style value, undo and redo can transition it to the restored Desired value. If the application changes the text or inline style itself, Mesurer relinquishes ownership and preserves the host value through later history and cleanup.

Final verification must use Live source with the Desired preview inactive. Keep the intent; do not clear history merely to expose Live.

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

## Completion

Do not call every Mesurer method after every edit. Measure what matters to the request.

A completion should be evidence-based: exact target geometry or relationships where relevant, Live copy/typography when text intent exists, review deltas when Arrange/annotations exist, and a real browser screenshot when composition matters.

If the evidence still disagrees with the requested result, continue working rather than explaining why the source “should” be correct.
