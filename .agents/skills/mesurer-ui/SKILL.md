---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, debugging, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, or human Mesurer selections/measurements/guides/annotations. Read the human's live Mesurer state before editing and revalidate the rendered result with Mesurer before claiming completion.
---

# Mesurer UI workflow

Mesurer is **shared visual state between the person reviewing a page and the coding agent editing it**.

There is no Mesurer MCP, WebMCP, ACP, chat-delivery daemon, session router, or harness-specific transport in the normal workflow. The agent uses the browser/evaluation channel it already has, reads `window.__MESURER__` directly from the page, edits source normally, and reads Mesurer again to verify the rendered result.

```text
human uses Mesurer in the real page
  → selection / guides / measurements / distances / X-ray / notes
  → window.__MESURER__ contains structured rendered evidence
  → agent reads that state through its existing browser harness
  → agent edits source
  → HMR/render settles
  → agent measures/reviews again
  → agent iterates until the rendered evidence supports the result
```

## 1. Preserve the human's live Mesurer state

**Never reinject or dispose Mesurer just because this skill loaded.** A person may already have spent time selecting elements, placing guides, measuring gaps, holding distances, enabling rulers/X-ray, or creating annotations. That state is part of the user's message.

Start every visual task by discovering the page state:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, **use that exact instance**. Do not evaluate the injector again. Do not call `dispose()`. Do not remove or replace plugins unless the user specifically asked to modify Mesurer itself.

If Mesurer is absent, inject it through the browser JavaScript-evaluation primitive the harness already owns. Do not add Mesurer to application source, create another browser, create another CDP connection, start a Mesurer server, or change the app build just to inspect the page.

The installed skill is self-contained: `assets/inject-script.js` beside this file is the packaged classic injector. Read that file and evaluate its contents in the current page. In the Mesurer repository itself, the equivalent development artifact is `packages/mesurer/dist/inject-script.js`. If `mesurer-solid` is already installed, `mesurer-solid/inject-script` is the same distribution path.

The injector itself also defaults to reusing a matching live instance. `window.__MESURER_CONFIG__ = { reuseExisting: false }` is an explicit destructive replacement option for tests/HMR tooling; **do not use it while consuming human review state**.

After a first injection:

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
```

## 2. Read the human's visual state before editing

Do this before changing UI code whenever Mesurer already existed, the user says they selected/measured/marked something, or the task is visual and Mesurer is available.

Read the whole meaningful workspace:

```js
const workspace = await window.__MESURER__.context()
```

`workspace` is JSON-safe rendered evidence. Important fields include:

```text
page / viewport / devicePixelRatio / scroll
visualState.rulersVisible
visualState.xrayVisible
targets[]
  selector
  exact viewport rect
  margin / padding / border
  typography
  appearance
  flex/grid/layout/computed style
  scroll/overflow
visualContext.guides[]
visualContext.measurements[]
visualContext.distances[]
```

Workspace context is the right answer to requests such as:

> "Look at my measurements. This layout is broken."

> "I put guides on the edges that should line up."

> "Look at what I selected and tell me why these cards are off."

### Current selection

If the person currently has selected elements or a dragged region, also read selection-scoped context:

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection is valid; continue with workspace/annotations.
}
```

Selection context is the clearest answer to **what the person is pointing at right now**. It contains only the targets/region and guides, measurements, and distances relevant to that selected area.

Do not require the user to create an annotation just to make their current selection useful.

### Saved human annotations

Always inspect saved annotations when they exist:

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
  // Read annotation.note as human intent.
}
```

An annotation is stronger than an unsaved selection because it stores a durable note and baseline. Treat the note as the user's intent. Treat selectors, geometry, measurements, guides, distances, computed styles, and screenshots as supporting evidence.

If several annotations exist, do not silently inspect only the first one. Read the relevant notes/contexts or explain which one you are addressing.

### Evidence interpretation

Mesurer reports **viewport CSS pixels**. Prefer its exact numbers over estimating gaps or alignment from a screenshot.

Examples:

- two target left edges differ by `4px` → they are not aligned;
- a held horizontal distance says `37px` → do not claim the gap is `24px` because CSS declares `gap: 24px` somewhere;
- a guide at `x=320` crossing selected targets shows the intended alignment reference;
- X-ray/ruler state tells you what the human was using to understand the page, but is not itself a design requirement;
- a selected region with no DOM target can still encode whitespace/alignment intent through `regions`.

## 3. Capture real visual evidence when useful

Mesurer provides geometry and capture scope. The outer harness owns real browser screenshots.

For an annotation or selection:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })

await window.__MESURER__.prepareCapture()
try {
  // Use the current harness/browser screenshot primitive.
  // Capture the viewport and, when present, plan.captures focus clip.
} finally {
  await window.__MESURER__.finishCapture()
}
```

For selection context, pass `{ scope: "selection" }` instead of an annotation request.

`prepareCapture()` hides Mesurer control chrome while preserving evidence such as selection/annotation markers, rulers, guides, measurements, held distances, and pixel labels. Always call `finishCapture()` in `finally`.

Do not use DOM-to-canvas screenshot approximations when the harness can capture the real rendered browser.

Use the two signals together:

```text
Mesurer structured data → exact geometry, box model, styles, distances, overflow
real screenshot          → composition, hierarchy, clipping, color, visual judgment
```

## 4. Edit the real implementation

After reading the human context, make the smallest source change that addresses the actual visual issue.

Use the normal project workflow. Mesurer does not edit files, own a dev server, or own browser navigation. Do not create Mesurer-specific build scripts or agent plumbing.

If the page uses HMR, let the normal render update occur. If the app must be relaunched by the harness, use the harness's normal flow.

Do not mutate the human's guides/measurements merely to make the evidence match your implementation. They are review state, not test fixtures to rewrite.

## 5. Revalidate the rendered result

After every meaningful UI edit:

```js
await window.__MESURER__.stable()
```

Then verify with the strongest available path.

### If the user made an annotation

Use deterministic before/current review:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` includes the human note, baseline evidence, current scoped context, target status, exact pixel deltas, and explicit missing evidence.

Examples of useful review conclusions:

```text
horizontal gap: 37px → 24px, delta -13px
left edge mismatch: 4px → 0px
card width: 318px → 320px
expected guide/target disappeared → kind: "missing"
```

If the intended result is still numerically wrong, keep editing. A green typecheck/build is not visual completion.

### If the user only selected/measured the workspace

Re-read the live state:

```js
const afterWorkspace = await window.__MESURER__.context()

let afterSelection = null
try {
  afterSelection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // Selection may disappear after DOM replacement; use stored selectors/targets.
}
```

Use exact selectors from the original context with the low-level API when you need a focused post-edit check:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

Compare the relevant before/after values in your task context. You do not need a network transport to do this—the agent already owns both snapshots inside its current task.

## 6. Handle HMR and stale targets correctly

Annotations retain the original live DOM node while it remains connected. After DOM replacement/HMR, Mesurer only rebinds conservatively when identity/fingerprint evidence resolves uniquely.

If an annotation reports `targetStatus: "stale"` or `"partial"`, do not silently attach the human's intent to a different element. Use the note, saved baseline/selectors, current DOM, and screenshot to determine whether the target was intentionally replaced. If identity is genuinely ambiguous, ask the user to reselect rather than guessing.

An unsaved current selection can also disappear when the selected DOM node is replaced. Preserve the initial context in the agent task before editing so you still have its selector/geometry and can inspect the replacement deliberately.

## 7. Completion standard

For meaningful visual work, do not finish with only:

```text
lint passed
typecheck passed
tests passed
build passed
```

Those are implementation checks, not rendered proof.

A good completion statement should be grounded in the actual page, for example:

```text
- target cards now measure 320px wide
- horizontal distance is 24px
- selected left edges differ by 0px
- document horizontal overflow is false
- annotation review reports the requested geometry change
- current browser screenshot shows no clipping/regression
```

Only claim measurements you actually read.

## 8. Useful low-level inspection

Use these when scoped context/review does not answer a specific question:

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

Prefer `context()` and `review()` for human-in-the-loop work because they preserve the person's visual evidence and intent.

## 9. Things not to do

For the normal Mesurer-agent workflow:

- **do not look for an MCP or WebMCP tool;**
- **do not start an MCP/local feedback server;**
- **do not try to discover a chat/thread/session ID;**
- **do not route Mesurer through ACP/Codex App Server just to read page state;**
- **do not create a new browser or duplicate CDP connection when the harness already controls the page;**
- **do not reinject over a live human Mesurer instance;**
- **do not delete/change human measurements or guides to make validation pass;**
- **do not infer exact geometry from screenshots when Mesurer has the number;**
- **do not claim visual completion from source code or build output alone.**

The direct contract is intentionally small:

```text
existing agent harness
  ↕ browser evaluate / screenshot
existing page
  ↕
window.__MESURER__
```

That is the integration.
