---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, debugging, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, human Mesurer selections/measurements/guides/annotations, or Arrange intents. Consume existing human visual intent before editing and obtain fresh rendered evidence before claiming completion.
---

# Mesurer UI workflow

Mesurer is shared visual state between the person reviewing a page and the coding agent editing it. The rendered page is the integration boundary.

There is no Mesurer MCP, WebMCP, ACP, chat-delivery daemon, session router, or Send-to-agent callback in the normal workflow. Use the browser/evaluation channel the harness already owns and read `window.__MESURER__` directly.

The central rule is:

> A meaningful Mesurer step must return evidence the agent actually consumes.

That evidence may be `MesurerContextV1`, `MesurerReviewV1`, an Arrange intent/review, or a focused low-level measurement. Do not merely draw a highlight and continue from memory.

```text
human visual intent or agent UI change
  → preserve existing Mesurer state
  → consume Arrange / annotation / selection evidence
  → reason from exact rendered state
  → edit normal source
  → wait for the real render
  → compare fresh rendered state with the human intent
  → iterate until the evidence supports completion
```

## 1. Reuse the live Mesurer instance

Never reinject, dispose, or replace Mesurer just because this skill loaded. The person may already have selected elements, placed guides, measured gaps, held distances, enabled rulers/X-ray, created annotations, arranged elements into a desired layout, or kept a screenshot thumbnail/viewer open. That state is part of the user's message.

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
```

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

## 3. Acquire ordinary context in the right order

After preserving any relevant Arrange intent, use this order for the rest of the visual evidence.

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

Treat annotation notes and Arrange Desired state as human intent. Treat selection, guides, distances, measurements, exact geometry, computed styles, and screenshots as evidence supporting that intent.

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

## 4. Read rendered context, not source assumptions

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

## 5. Treat multi-selection as relational evidence

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

## 6. Preserve the baseline before editing

If the human supplied selection, measurements, an annotation, or Arrange state, retain the relevant baseline before source changes or HMR can replace nodes.

Annotation:

```js
const before = await window.__MESURER__.context({ annotation: annotationId })
```

Live selection:

```js
const before = await window.__MESURER__.context({ scope: "selection" })
```

Arrange: capture the intent plus Before/Desired states as described above.

Do not mutate human guides, measurements, held distances, annotations, Arrange history, or screenshot preview/viewer state merely to make the implementation appear correct.

## 7. Edit the real implementation

Make the smallest source change that addresses the rendered issue. Use the project's normal source, build, and dev-server workflow.

Mesurer does not own source edits, navigation, or the dev server. Do not create Mesurer-specific infrastructure for those jobs.

After HMR/render:

```js
await window.__MESURER__.stable()
```

## 8. Fresh rendered evidence is part of completion

Lint, typecheck, tests, and build are implementation checks. They do not prove a visual result.

Use the strongest applicable completion path.

### Arrange intent

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Continue until the live source-rendered geometry matches Desired within the expected tolerance, and use a fresh screenshot when visual composition matters.

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

## 9. Human screenshots and agent screenshots are different paths

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

Arrange follows the same ownership model through `arrangeCapturePlan()`. The important difference is that Arrange can deliberately present Before, Desired, or Live before the harness captures.

Use both signals:

```text
Mesurer context/review → exact geometry, styles, distances, overflow
real screenshot          → composition, hierarchy, clipping, color, visual judgment
```

Screenshots do not replace exact Mesurer measurements, and Mesurer numbers do not replace visual judgment.

## 10. HMR and stale-target rules

Annotations and Arrange intents rebind conservatively after DOM replacement. If review reports `stale` or `partial`, do not silently bind human intent to a different element.

An unsaved selection can disappear when HMR replaces nodes. Preserve initial context before editing. After render, use original exact selectors when still valid, `select()` known replacement targets when unambiguous, or ask the user to reselect when identity is uncertain.

## 11. Completion standard

A valid visual completion statement is grounded in fresh rendered evidence, for example:

```text
- Arrange Live now matches Desired within 1px
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

## 12. Low-level helpers

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
await window.__MESURER__.stable()
```

Prefer `arrangements()`, `context()`, `select()`, `reviewArrange()`, and `review()` for human-in-the-loop work because they preserve visual meaning and return evidence that can be carried directly into reasoning.

## 13. Do not do these things

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
- do not implement Arrange offsets as production transforms unless the source layout genuinely calls for that;
- do not capture only Desired after source editing; preserve Before and Desired first when screenshot comparison matters;
- do not close/destroy a human screenshot preview merely to clean up agent state;
- do not use `select()` with a knowingly ambiguous selector;
- do not ask the user to select something the agent can identify exactly itself;
- do not guess when the intended target really is ambiguous;
- do not ignore context returned by `select()`;
- do not alter human measurements/guides to make validation pass;
- do not infer exact geometry from screenshots when Mesurer reports the number;
- do not claim visual completion from source/build output alone.

The direct integration remains intentionally small:

```text
existing agent harness
  ↕ browser evaluate / screenshot
existing rendered page
  ↕
window.__MESURER__
  ↳ arrangements() / context() / select()
  ↳ reviewArrange() / review()
```

**Rendered evidence is the output.**