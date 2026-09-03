---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, debugging, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, human Mesurer selections/measurements/guides/annotations, Arrange intents, direct text/style Desired edits, or any request to check Mesurer/Measure context. A broad Mesurer/context request means inventory all existing human visual intent before narrowing. Consume existing human visual intent before editing and obtain fresh rendered evidence before claiming completion.
---

# Mesurer UI workflow

Mesurer is shared visual state between the person reviewing a page and the coding agent editing it. The rendered page is the integration boundary.

There is no Mesurer MCP, WebMCP, ACP, chat-delivery daemon, session router, or Send-to-agent callback in the normal workflow. Use the browser/evaluation channel the harness already owns and read `window.__MESURER__` directly.

The central rule is:

> A meaningful Mesurer step must return evidence the agent actually consumes.

That evidence may be `MesurerContextV1`, `MesurerReviewV1`, an Arrange intent/review, a text-edit intent, or a focused low-level measurement. Do not merely draw a highlight or preview a change and continue from memory.

```text
human visual intent or agent UI change
  → preserve existing Mesurer state
  → consume Arrange / text edit / annotation / selection evidence
  → reason from exact rendered state
  → edit normal source
  → wait for the real render
  → compare fresh rendered state with the human intent
  → iterate until the evidence supports completion
```

## 1. Reuse the live Mesurer instance

Never reinject, dispose, or replace Mesurer just because this skill loaded. The person may already have selected elements, placed guides, measured gaps, held distances, enabled rulers/X-ray, created annotations, arranged elements into a desired layout, edited text or typography into a Desired state, or kept a screenshot thumbnail/viewer open. That state is part of the user's message.

Discover the current page first:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, use that exact instance. Do not evaluate the injector again and do not call `dispose()`.

If Mesurer is absent, inject the packaged classic payload through the JavaScript-evaluation primitive the harness already owns. The installed skill contains `assets/inject-script.js`; this repository builds `packages/mesurer/dist/inject-script.js`; the npm package exposes `mesurer-solid/inject-script`.

Do not add Mesurer to application source, create another browser, create a second CDP connection, start a Mesurer server, or change the application build merely to inspect a page the harness already controls.

The injector reuses a live injected instance by default. `window.__MESURER_CONFIG__ = { reuseExisting: false }` is an explicit destructive replacement option for tests/tooling. Do not use it while consuming human review state.

Normal injection keeps the optional human screenshot plugin disabled. If the task specifically needs that camera tool, configure it before first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Do not replace/reinject a live instance merely to enable screenshots. Preserve current human state first.

After first injection or discovery:

```js
await window.__MESURER__.ready()
const capabilities = window.__MESURER__.capabilities()
```

The context-oriented surface includes:

```text
context
select
annotations
review
capturePlan
textEdits
textEdit
```

When direct text editing is available, capabilities reports:

```text
textEdit
```

`textEdits()` lists saved human text/style Desired intents. `textEdit(id)` resolves one intent by id.

When the first-party Arrange plugin is mounted, capabilities also reports:

```text
arrange
```

Arrange adds:

```text
arrangements
arrange
showArrange
arrangeCapturePlan
reviewArrange
```

The optional screenshot plugin remains a separate human tool/service. It is not a screenshot-delivery capability on `window.__MESURER__`.

### Treat broad Mesurer/context requests as a full intent sweep

If the user says “check Mesurer,” “check Measure,” “look at Mesurer context,” “see what I highlighted/moved/annotated/edited,” or otherwise asks generally about Mesurer state without naming one specific tool, do **not** assume `context()` alone is the whole message.

Inventory the live human-intent channels before narrowing:

```js
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

Then read the relevant saved objects instead of only listing them:

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

Bring forward whatever is relevant from the combined state: current selection, target-bound annotations and notes, Arrange Before/Desired geometry, text Before/Desired copy and typography/style deltas, guides, measurements, held distances, layout/style inspection, rulers/X-ray state, and any existing human screenshot preview that should be preserved. A person may use several Mesurer tools in one review; treat the combined state as one visual message rather than asking them to restate intent that is already encoded in the page.

Do not clear or replace any of those channels until their relevant evidence has been consumed.

## 2. Consume Arrange before source edits

Arrange represents explicit human layout intent. If `capabilities.capabilities.arrange` is true, inspect it before replacing the human selection or editing source:

```js
const arrangements = await window.__MESURER__.arrangements()
```

For a relevant intent:

```js
const intent = await window.__MESURER__.arrange(arrangeId)
```

An Arrange intent contains exact targets plus Before and Desired geometry. Treat Desired as the requested visual outcome, not as an implementation prescription.

For example, a target moving `96px` right does **not** mean production code should receive `transform: translateX(96px)`. Inspect the surrounding layout and implement the appropriate source-level change: flex/grid alignment, gap, margin, sizing, placement, component structure, or another semantic layout rule.

### Capture Before and Desired before HMR

Arrange can reconstruct both states while the original source-rendered page is still present. If the harness can capture screenshots, capture both before editing source.

```js
await window.__MESURER__.showArrange(arrangeId, "before")
const beforePlan = await window.__MESURER__.arrangeCapturePlan(arrangeId, "before")

await window.__MESURER__.prepareCapture()
try {
  // Use the current browser harness screenshot primitive with beforePlan.
} finally {
  await window.__MESURER__.finishCapture()
}

await window.__MESURER__.showArrange(arrangeId, "desired")
const desiredPlan = await window.__MESURER__.arrangeCapturePlan(arrangeId, "desired")

await window.__MESURER__.prepareCapture()
try {
  // Capture the Desired state with the same harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

The user should not need to export or attach these images. The coding harness already owns screenshot bytes; Mesurer owns the reproducible visual states and capture geometry.

Retain:

- the Arrange id;
- target selectors/fingerprints;
- Before geometry;
- Desired geometry and offsets;
- the Before screenshot when available;
- the Desired screenshot when available.

Do this **before** source changes or HMR can alter the baseline.

### Verify the real implementation against Desired

After source changes and a stable render, switch Arrange to Live. Live removes Arrange's temporary visual preview so the page shows only what the application source actually produces.

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

`reviewArrange()` reports exact current-vs-Desired rectangle deltas and whether the targets match within tolerance. If it says the result is still off, continue editing.

A typical loop is:

```text
Before       Desired      Live
x 120   →    x 284        x 276
                         remaining +8px

edit source
  ↓
wait for stable render
  ↓
Live x 284
  ↓
matched ✓
```

If review reports `stale` or `partial`, do not silently transfer the intent to a different element. Resolve target identity conservatively or ask the user to reselect/rearrange if ambiguity remains.

Do not clear, overwrite, or discard a human Arrange intent merely to make validation pass.

## 3. Consume direct text/style Desired edits before source edits

Direct text editing is human copy and typography intent. It extends the existing page-targeting interaction instead of adding a competing top-level Text Edit tool.

### Understand the human editing surface

A person can open direct editing while **Select** or **Text Inspector** is active. Arrange keeps Select active, so this also works while Arrange remains selected.

```text
double-click ordinary direct text
(or double-tap with touch/pen)
  ↓
current text selected in full
  ↓
in-place editor using the target's rendered typography
  ↓
compact Mesurer toolbar: B / I / U / Text ▾
  + automatic Text Inspector information for the exact field
  ↓
Enter keeps Desired / Shift+Enter inserts newline
```

The default formatting bar deliberately stays compact. **B**, **I**, and **U** are direct Bold/Italic/Underline controls. **Text ▾** opens the detailed typography menu.

At the top of that menu, Mesurer offers **Text** plus Heading 1/2/3 only for semantic levels actually rendered by visible direct-text page elements. Each semantic preset represents the **dominant rendered typography bundle** for that level—font family, size, weight, style, line height, tracking, text transform, and color. The Text preset uses dominant visible direct-text paragraph/span typography. Heading levels absent from the page are not invented.

Pages may contain multiple visual variants of one semantic level. A special non-dominant heading/body variant is still available through the menu's page-derived Font, Size, Weight, color swatches, and custom color picker. Semantic presets therefore express the canonical rendered style without hiding existing application variants.

While the editor owns focus, `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, and `Cmd/Ctrl+U` toggle formatting. Text/H1/H2/H3 expose `Option+Cmd+0/1/2/3` on macOS and `Alt+Ctrl+0/1/2/3` elsewhere. A heading shortcut only applies when that heading level exists in the page-derived catalog.

If the Text menu is open, the first **Escape** closes the menu and keeps editing; Escape with the menu closed cancels the edit session. Link creation and numbered/bulleted lists are intentionally not exposed as fake typography controls because those require a future structural/rich-text intent model.

The automatic Text Inspector card reports Family, Size, Weight, Line, Tracking, tag/text information, and CSS-variable references when available. It updates during the edit session, but it is **transient human UI**: it does not globally enable Text Inspector, does not create a persistent pin, does not interrupt Arrange, and is not another durable agent context channel.

The current target contract is deliberately narrow. Direct editing targets ordinary page elements with one unambiguous non-empty **direct text node**. It is not a generic rich-text/form editor. Native `<input>`, `<textarea>`, `<select>`, `contenteditable`, and ambiguous mixed/nested rich-text structures retain their normal browser/application behavior.

For normal application work, do not automate this editor UI just to discover intent that has already been saved. Read `textEdits()` / `textEdit(id)` directly. Automate the editor itself only when the task is testing or changing Mesurer's direct-edit feature.

### Read durable text intent

When `capabilities.capabilities.textEdit` is true, inspect saved edits before changing source:

```js
const textEdits = await window.__MESURER__.textEdits()
```

For a relevant edit:

```js
const intent = await window.__MESURER__.textEdit(textEditId)
```

A text-edit intent contains:

```text
id / createdAt / pageUrl
selector / nodeIndex
before
  original text
desired
  requested text
styles[]
  property
  before
  desired
```

Treat `desired` and `styles[]` as the requested visual outcome, not as an implementation prescription. Mesurer may preview a font, size, weight, line height, tracking, text transform, color, underline, or other text property with a temporary DOM style. Production code should use the application's real component props, classes, CSS variables, design tokens, theme values, or stylesheet rules where appropriate.

Page-derived semantic presets and font/size/color/weight choices are useful evidence because the person selected from styles already rendered by the application. They are not a source-code token scanner and still do **not** mean the agent should blindly add inline styles with sampled computed values. Inspect the source and reuse the semantic source-level token/class when it exists.

Preserve each relevant intent id, selector, Before text, Desired text, and style deltas before HMR can replace the target.

### Verify text edits against Live source, not Mesurer's preview

While Select or Text Inspector is active, Mesurer can render the saved Desired copy/style as a reversible preview. Do not inspect that preview and claim the source implementation is complete.

After making source changes:

1. wait for the application to render;
2. preserve the text-edit intent;
3. ensure Mesurer's text Desired preview is not masking the target by deactivating the active Select/Text Inspector mode without clearing the saved intent;
4. inspect the target's actual rendered text and computed typography;
5. compare those Live values with the saved Desired text/style changes;
6. reactivate Select only if continued Mesurer review is useful.

Mesurer relinquishes ownership when the application itself changes a text/style value, so a correct source implementation must survive with the preview inactive.

Do not clear text-edit history just to reveal Live. Deactivate the previewing tool, inspect the real application render, and keep the human intent available for comparison.

## 4. Acquire ordinary context in the right order

After preserving relevant Arrange and text-edit intent, use this order for the rest of the visual evidence.

### A. Existing human selection or annotation

Read it before changing selection yourself:

```js
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection is valid.
}
```

For a relevant annotation:

```js
const annotationContext = await window.__MESURER__.context({
  annotation: annotation.id,
})
```

Treat annotation notes, Arrange Desired state, and text/style Desired edits as human intent. Treat selection, guides, distances, measurements, exact geometry, computed styles, and screenshots as evidence supporting that intent.

Do not overwrite a meaningful human selection until its context has been retained in the current task.

### B. No relevant selection and the target is ambiguous

Ask the user to select the intended element(s) or region with Mesurer. Then immediately read:

```js
const selection = await window.__MESURER__.context({ scope: "selection" })
```

Do not guess merely to avoid asking for a selection.

### C. The agent knows the exact rendered target

Select it yourself:

```js
const context = await window.__MESURER__.select("#pricing-card")
```

For multiple targets:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` switches Mesurer to Select, visibly highlights the exact targets, makes them the live selection, waits for the selection to settle, and returns selection-scoped `MesurerContextV1`.

Use the returned object. Do not call `select()` only for the highlight.

Every supplied selector must resolve to exactly one page target. Missing, invalid, or ambiguous selectors throw. Refine the selector or ask the user to select the target rather than guessing.

## 5. Read rendered context, not source assumptions

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates. Relevant fields include:

```text
schema / id / createdAt
scope
page
viewport + devicePixelRatio + scroll
coordinateSpace
regions
visualState
  rulersVisible
  xrayVisible
targets[]
  ref
  inspection.selector
  inspection.rect
  margin / padding / border
  typography
  appearance
  layout
  scroll / overflow
visualContext
  guides[]
  measurements[]
  distances[]
```

Mesurer's rendered values are the source of truth. Prefer them over screenshot estimates or source-level assumptions.

Examples:

- left edges differ by `4px` → the targets are not aligned;
- rendered gap is `37px` → do not claim `24px` because CSS contains `gap: 24px`;
- rendered width is `318px` → do not report `320px` until the browser measures it;
- overflow flags are true → the rendered component is overflowing even if source math looked correct.

## 6. Treat multi-selection as relational evidence

When several elements are selected, inspect every relevant target and their relationships. Do not summarize the state as only “3 selected.”

For each target, consume:

```text
selector / identity / text / accessibility
rect: x / y / left / top / right / bottom / width / height
margin / padding / border
typography
appearance
layout: display / position / flex / grid / gap / transform / overflow
scroll/client dimensions and overflow flags
```

Start with `selection.visualContext.distances`; for a needed pair not represented there:

```js
const pair = window.__MESURER__.distance(selectorA, selectorB)
```

For a small selection, report useful unique pair relationships. For a large repeated set, focus on adjacent/repeated/user-relevant relationships rather than dumping O(n²) pairs.

## 7. Preserve the baseline before editing

If the human supplied selection, measurements, an annotation, Arrange state, or text/style edits, retain the relevant baseline before source changes or HMR can replace nodes.

Annotation:

```js
const before = await window.__MESURER__.context({ annotation: annotationId })
```

Live selection:

```js
const before = await window.__MESURER__.context({ scope: "selection" })
```

Arrange: capture the intent plus Before/Desired states as described above.

Text edit:

```js
const textIntent = await window.__MESURER__.textEdit(textEditId)
```

Do not mutate human guides, measurements, held distances, annotations, Arrange history, text-edit history, or screenshot preview/viewer state merely to make the implementation appear correct.

## 8. Edit the real implementation

Make the smallest source change that addresses the rendered issue. Use the project's normal source, build, and dev-server workflow.

Mesurer does not own source edits, navigation, or the dev server. Do not create Mesurer-specific infrastructure for those jobs.

After HMR/render:

```js
await window.__MESURER__.stable()
```

For text/style intents, inspect the source-rendered Live state with Mesurer's Desired preview inactive before claiming the implementation matches.

## 9. Fresh rendered evidence is part of completion

Lint, typecheck, tests, and build are implementation checks. They do not prove a visual result.

Use the strongest applicable completion path.

### Arrange intent

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Continue until the live source-rendered geometry matches Desired within the expected tolerance, and use a fresh screenshot when visual composition matters.

### Text/style Desired intent

With the saved intent retained and the temporary text preview inactive:

```js
await window.__MESURER__.stable()
const intent = await window.__MESURER__.textEdit(textEditId)
const live = window.__MESURER__.inspect(intent.selector)
```

Compare the actual text and relevant `live.typography` values with `intent.desired` and `intent.styles`. If the target no longer resolves uniquely after HMR, do not silently transfer the intent to another element.

### Human annotation

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

### Still-relevant human selection

```js
await window.__MESURER__.stable()
const after = await window.__MESURER__.context({ scope: "selection" })
```

### Agent-known changed targets

```js
await window.__MESURER__.stable()
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

If target identity is ambiguous after the change, ask the user to select the intended result. Do not manufacture confidence from a guessed selector.

## 10. Human screenshots and agent screenshots are different paths

The optional `mesurer.screenshot` plugin gives the person a camera tool. It can copy/download a HiDPI-aware PNG and keep a draggable preview/viewer. Do not treat it as an agent-delivery transport or destroy a human preview unless the task explicitly requires it.

For normal coding-agent verification, the outer harness owns screenshot bytes. Mesurer supplies exact scope and clean presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // Use the current harness/browser screenshot primitive.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Active direct-editor controls, the Text menu, and its automatic Text Inspector card are Mesurer chrome, not application evidence. Arrange follows the same ownership model through `arrangeCapturePlan()`. The important difference is that Arrange can deliberately present Before, Desired, or Live before the harness captures.

Use all relevant signals:

```text
Mesurer context/review → exact geometry, styles, distances, overflow
saved human intent      → annotation / Arrange / text Desired state
real screenshot          → composition, hierarchy, clipping, color, visual judgment
```

Screenshots do not replace exact Mesurer measurements, and Mesurer numbers do not replace visual judgment.

## 11. HMR and stale-target rules

Annotations, Arrange intents, and text-edit intents use conservative target identity. If a target becomes stale or ambiguous, do not silently bind human intent to a different element.

An unsaved selection can disappear when HMR replaces nodes. Preserve initial context before editing. After render, use original exact selectors when still valid, `select()` known replacement targets when unambiguous, or ask the user to reselect when identity is uncertain.

If the application now renders a text/style value that matches a saved Desired edit, Mesurer must not keep claiming ownership of that value or later restore stale Before state over the application's source-rendered result.

## 12. Completion standard

A valid visual completion statement is grounded in fresh rendered evidence, for example:

```text
- Arrange Live now matches Desired within 1px
- edited copy is source-rendered as "Start free trial"
- edited text uses the requested 700 weight and page token color with Mesurer preview inactive
- selected cards measure 320px wide
- rendered horizontal gap is 24px
- selected top edges differ by 0px
- component horizontal overflow is false
- annotation review changed 37px → 24px
- current browser screenshot shows no clipping regression
```

This is insufficient by itself:

```text
lint passed
typecheck passed
tests passed
build passed
```

If Mesurer is available and the affected UI can be identified, finishing without fresh Mesurer evidence is a workflow failure.

## 13. Low-level helpers

Use these only when scoped context/review is not enough:

```js
await window.__MESURER__.ready()
window.__MESURER__.inspect(".selector")
window.__MESURER__.inspectAll(".selector")
window.__MESURER__.at(x, y)
window.__MESURER__.distance(".a", ".b")
window.__MESURER__.viewport()
await window.__MESURER__.feedback([".selector"])
await window.__MESURER__.state()
await window.__MESURER__.textEdits()
await window.__MESURER__.textEdit(textEditId)
await window.__MESURER__.stable()
```

Prefer `arrangements()`, `textEdits()`, `context()`, `select()`, `reviewArrange()`, and `review()` for human-in-the-loop work because they preserve visual meaning and return evidence that can be carried directly into reasoning.

## 14. Do not do these things

- do not look for an MCP/WebMCP tool;
- do not start a local feedback server;
- do not discover chat/thread/session IDs;
- do not route Mesurer through ACP or another delivery protocol;
- do not recreate Send-to-agent;
- do not treat screenshot capture as an agent-delivery transport;
- do not create another browser/CDP connection when the harness already controls the page;
- do not reinject over live human Mesurer state;
- do not overwrite human selection before reading it;
- do not clear or alter human Arrange history to make validation pass;
- do not clear text-edit history merely to reveal or validate Live source state;
- do not implement Arrange offsets as production transforms unless the source layout genuinely calls for that;
- do not implement a text/style Desired preview as arbitrary production inline styles when the source design system has a semantic token/class/component API;
- do not treat page-derived computed font/size/weight/color values or semantic presets as automatic source-token instructions;
- do not treat the automatic direct-edit Text Inspector card as another saved context/intent channel;
- do not automate the direct editor for normal application work when saved `textEdit` intent already describes the human request;
- do not add or infer Link/List structural intent from the current typography-only direct-edit contract;
- do not capture only Desired after source editing; preserve Before and Desired first when screenshot comparison matters;
- do not close/destroy a human screenshot preview merely to clean up agent state;
- do not use `select()` with a knowingly ambiguous selector;
- do not ask the user to select something the agent can identify exactly itself;
- do not guess when the intended target really is ambiguous;
- do not ignore context returned by `select()`;
- do not alter human measurements/guides to make validation pass;
- do not infer exact geometry from screenshots when Mesurer reports the number;
- do not inspect Mesurer's temporary text Desired preview and claim the source implementation is complete;
- do not claim visual completion from source/build output alone.

The direct integration remains intentionally small:

```text
existing agent harness
  ↕ browser evaluate / screenshot
existing rendered page
  ↕
window.__MESURER__
  ↳ arrangements() / textEdits() / context() / select()
  ↳ reviewArrange() / textEdit() / review()
```

**Rendered evidence is the output.**