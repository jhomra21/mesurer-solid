---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, debugging, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, or human Mesurer selections/measurements/guides/annotations. Treat Mesurer context as the output of every meaningful visual inspection: consume existing human context before editing, acquire a selection when needed, and obtain fresh context again before claiming completion.
---

# Mesurer UI workflow

Mesurer is **shared visual state between the person reviewing a page and the coding agent editing it**. The page is the integration boundary.

There is no Mesurer MCP, WebMCP, ACP, chat-delivery daemon, session router, or Send-to-agent callback in the normal workflow. Use the browser/evaluation channel the harness already owns and read `window.__MESURER__` directly.

The critical behavioral contract is:

> **When Mesurer is available, expect structured context back.** Do not merely open, highlight, or inspect with Mesurer and then continue from memory. A meaningful visual step should produce `MesurerContextV1`, `MesurerReviewV1`, or an equally focused Mesurer measurement that the agent actually consumes.

```text
human visual intent or agent UI change
  → identify affected rendered targets
  → Mesurer selection / annotation / workspace
  → structured context comes back to the agent
  → agent reasons from exact rendered evidence
  → source edit
  → render settles
  → fresh Mesurer context/review comes back
  → agent iterates until evidence supports completion
```

## 1. Preserve existing human state

Never reinject, dispose, or replace Mesurer just because this skill loaded. The person may already have selected elements, placed guides, measured gaps, held distances, enabled rulers/X-ray, or created annotations. That state is part of the user's message.

Start by discovering the current page:

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

If Mesurer is absent, inject the packaged classic payload through the browser JavaScript-evaluation primitive the harness already owns. The installed skill contains `assets/inject-script.js`; in this repository the development artifact is `packages/mesurer/dist/inject-script.js`; an installed npm package exposes `mesurer-solid/inject-script`.

Do not add Mesurer to application source, create another browser, create a second CDP connection, start a Mesurer server, or change the application build merely to inspect a page the harness already controls.

The injector defaults to reusing a live injected instance. `window.__MESURER_CONFIG__ = { reuseExisting: false }` is an explicit destructive replacement option for tests/tooling. Do not use it while consuming human review state.

After a first injection:

```js
await window.__MESURER__.ready()
const capabilities = window.__MESURER__.capabilities()
```

The context surface includes:

```text
context
select
annotations
review
capturePlan
```

`select` is an agent/harness primitive, not a human toolbar action. The visible context controls remain Copy Context, Copy Selection, and Add Note.

## 2. Context acquisition is mandatory for visual work

Use this precedence order whenever Mesurer is available.

### A. Existing human selection or annotation → consume it first

Always preserve and read existing human evidence before changing selection yourself.

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

For each relevant annotation:

```js
const annotationContext = await window.__MESURER__.context({
  annotation: annotation.id,
})
```

Treat annotation notes as human intent. Treat selection, guides, distances, measurements, geometry, computed styles, and screenshots as evidence supporting that intent.

Do not overwrite a meaningful human selection until you have read and retained its context in the current task.

### B. No relevant selection + target is ambiguous → ask the user to select it

If the user's request refers to something visually ambiguous and you cannot confidently identify the intended rendered element or region, do not guess.

Ask the user to select the intended element(s) or drag the intended region with Mesurer. Once they do, immediately read:

```js
const selection = await window.__MESURER__.context({ scope: "selection" })
```

A selection is the answer to “what exactly do you mean?” Do not require the user to create an annotation unless a durable note/baseline would actually help.

### C. No relevant selection + agent knows the exact rendered targets → select them yourself

When you know exactly which rendered elements correspond to the UI you are changing or just changed, use `select()` instead of asking the user to do unnecessary work.

```js
const context = await window.__MESURER__.select("#pricing-card")
```

For several exact targets:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` does three things as one visual operation:

1. switches Mesurer to Select and visibly highlights the exact rendered targets;
2. makes those elements the live Mesurer selection;
3. **returns selection-scoped `MesurerContextV1` after the selection settles**.

Use the returned object. Do not call `select()` only for the highlight and ignore its context.

`select()` is intentionally strict. Every selector must resolve to exactly one page target. Missing, invalid, or ambiguous selectors throw. Refine the selector or ask the user to select the intended target rather than guessing.

Prefer exact selectors already obtained from `context()`, `inspect()`, stable IDs/test IDs, or a uniquely identified rendered node. Do not use a broad selector such as `.card` when it matches many elements unless you intentionally refine each target.

## 3. Understand the context you receive

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

Mesurer's rendered values are the source of truth. Prefer them over estimating from screenshots or assuming CSS declarations equal browser output.

Examples:

- left edges differ by `4px` → the targets are not aligned;
- rendered horizontal gap is `37px` → do not claim `24px` merely because CSS contains `gap: 24px`;
- width is `318px` → do not report `320px` from design intent until the browser actually measures it;
- overflow flags are true → the rendered document/component is overflowing even if source math looked correct.

## 4. Multi-selection is relational context

When several elements are selected, do not summarize them as “3 selected” or inspect only the first target. Their relationship is usually the point.

For every selected target, consume:

```text
selector / identity / text / accessibility
rect: x / y / left / top / right / bottom / width / height
margin / padding / border
typography
appearance
layout: display / position / flex / grid / gap / transform / overflow
scroll/client dimensions and overflow flags
```

Then recover the useful relationships between targets. Start with `selection.visualContext.distances`; for a pair not represented there, use the exact selectors returned by context:

```js
const pair = window.__MESURER__.distance(selectorA, selectorB)
```

For a small selection, report all useful unique pair relationships. For a large repeated set, focus on adjacent/repeated/user-relevant relationships rather than generating useless O(n²) output.

A valid read can look like:

```text
Card A: 320 × 180
Card B: 320 × 180
Card C: 320 × 180
A → B horizontal gap: 24px
B → C horizontal gap: 24px
A/B top-edge delta: 0px
```

Only claim numbers you actually read.

## 5. Before editing, retain the baseline you need

If the human supplied a selection, workspace measurement, or annotation, capture its relevant context before source changes or HMR can replace nodes.

For a durable human annotation:

```js
const before = await window.__MESURER__.context({ annotation: annotationId })
```

For live selection:

```js
const before = await window.__MESURER__.context({ scope: "selection" })
```

Store the needed selectors, dimensions, relationships, and intent inside the current agent task.

Do not mutate human guides, measurements, held distances, or annotations merely to make your implementation appear correct.

## 6. Edit the real implementation

Make the smallest source change that addresses the rendered issue. Use the project's normal edit/build/dev-server workflow.

Mesurer does not own source edits, browser navigation, or the dev server. Do not create Mesurer-specific infrastructure.

After HMR/render:

```js
await window.__MESURER__.stable()
```

## 7. Fresh context is part of completion

For meaningful visual work, do not stop at lint/typecheck/tests/build. Before finalizing, obtain **fresh Mesurer evidence for the affected rendered UI**.

Use the strongest available path.

### Human annotation exists

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` returns baseline, current context, target status, exact before/current/delta metrics, and missing evidence.

### Human selection still represents the changed UI

```js
await window.__MESURER__.stable()
const after = await window.__MESURER__.context({ scope: "selection" })
```

Re-check the same dimensions and relationships you recorded before editing.

### Agent made the UI change and knows the affected rendered targets

Proactively highlight them and get context back:

```js
await window.__MESURER__.stable()
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

This is the preferred completion path when there was no human selection. It leaves the changed UI visibly selected for the user and returns exact evidence to the agent in the same operation.

### The affected target is now ambiguous

Ask the user to select the intended result, then read the resulting selection context. Do not manufacture confidence from a guessed selector.

A visual task is not complete merely because `select()` drew an outline. **Consume the returned context and reason from it.**

## 8. Real screenshots complement context

Mesurer supplies geometry and capture scope; the outer harness owns real screenshots.

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // Use the current harness/browser's real screenshot primitive.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use both:

```text
Mesurer context  → exact geometry, styles, distances, overflow
real screenshot  → composition, hierarchy, clipping, color, visual judgment
```

Screenshots do not replace exact Mesurer measurements; Mesurer numbers do not replace visual judgment.

## 9. HMR and stale-target rules

Annotations keep the exact live node while it remains connected and rebind conservatively after DOM replacement. If an annotation reports `stale` or `partial`, do not silently transfer human intent to a different element.

An unsaved selection can disappear when HMR replaces nodes. Preserve initial context before editing. After the render, use the original exact selectors when still valid, `select()` the known replacement targets when unambiguous, or ask the user to reselect when identity is uncertain.

## 10. Completion standard

A visual completion statement should be grounded in fresh rendered evidence, for example:

```text
- selected cards now measure 320px wide
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

Those are implementation checks, not rendered proof.

If Mesurer is available and you could identify the affected UI, finishing without fresh Mesurer context is a workflow failure.

## 11. Low-level helpers

Use these for focused questions when scoped context/review is not enough:

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

Prefer `context()`, `select()`, and `review()` for human-in-the-loop work because they preserve visual meaning and produce context that can be carried directly into the agent's reasoning.

## 12. Do not do these things

- do not look for an MCP/WebMCP tool;
- do not start a local feedback server;
- do not discover chat/thread/session IDs;
- do not route Mesurer through ACP or another delivery protocol;
- do not recreate Send-to-agent;
- do not create another browser/CDP connection when the harness already controls the page;
- do not reinject over live human Mesurer state;
- do not overwrite human selection before reading it;
- do not use `select()` with a knowingly ambiguous selector;
- do not ask the user to select something the agent can identify exactly itself;
- do not guess when the intended target really is ambiguous—ask the user to select it;
- do not ignore the context returned by `select()`;
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
  ↳ context() / select() / review()
```

**Context is the output.**