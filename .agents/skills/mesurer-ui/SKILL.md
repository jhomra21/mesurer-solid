---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, or human Mesurer annotations. Revalidate visual changes with Mesurer before claiming completion when Mesurer is available.
---

# Mesurer UI workflow

Mesurer is a shared visual inspection and feedback layer between the person reviewing a UI and the agent editing it.

## Discover Mesurer

When you have a browser/evaluation channel, wait for an existing Mesurer instance before inspecting its capabilities:

```js
if (window.__MESURER__) {
  await window.__MESURER__.ready()
  window.__MESURER__.capabilities()
}
```

If Mesurer is absent, use the browser JavaScript-evaluation primitive the harness already owns. Do not add Mesurer to application source, create another browser, or change the app build just to inspect the page.

The installed skill is self-contained: `assets/inject-script.js` beside this file is the packaged classic injector. Read that file and evaluate its contents in the page. In the Mesurer repository itself, the equivalent development artifact is `packages/mesurer/dist/inject-script.js`. If `@jhomra21/mesurer-solid` is already installed in the project, its `/inject-script` export is the same distribution path.

After injection:

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
```

## Human feedback comes first

Before editing UI code, read any Mesurer annotations and the relevant scoped context:

```js
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
```

Treat the user's annotation note as intent. Treat selectors, geometry, guides, measurements, distances, typography, and screenshots as evidence that helps implement that intent. Do not override a user's stated intent merely because a numeric measurement exists.

For the current unsaved selection, use:

```js
await window.__MESURER__.context({ scope: "selection" })
```

A selection may be one or more elements or a dragged visual region. Region annotations are useful for whitespace, alignment, or other feedback where no single DOM element is the right target.

For the whole meaningful workspace, use:

```js
await window.__MESURER__.context()
```

## Implement, render, revalidate

For a requested visual change:

1. Capture the relevant annotation/selection context before editing.
2. Make the smallest source change that addresses the visual intent.
3. Let the normal dev server/HMR update the page.
4. Wait for the rendered UI to settle with `await window.__MESURER__.stable()`.
5. Re-read the affected annotation with `await window.__MESURER__.review(annotationId)`.
6. Inspect measurable before/current changes and any explicit missing evidence. If a gap, alignment, width, height, guide relationship, or expected target is still wrong, iterate.
7. If the harness supports screenshots, inspect the current visual evidence as well.
8. For visual tasks, do not declare completion merely because typecheck/tests/build pass when Mesurer is available for browser validation.

Annotations keep the original live DOM target while it remains connected. After DOM replacement, Mesurer rebinds only when the stored selector and fingerprint resolve conservatively and uniquely. If Mesurer reports a target as stale, do not silently assume another element is the same target; ask for or re-establish the intended target when necessary.

## Screenshot evidence

Mesurer distinguishes controls from visual evidence. Capture with Mesurer controls hidden but guides, rulers, selected outlines, annotations, measurements, distances, and pixel labels visible:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Use the harness/browser's real screenshot primitive.
  // Capture the current viewport and, when plan contains `focus`, that clip.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Do not use a DOM-to-canvas approximation when the harness can capture the real rendered browser.

Use screenshots together with structured Mesurer evidence, not instead of it. Numeric geometry is better for exact discrepancies; images are better for visual judgment and surrounding design context.

## Delivery

The universal fallback is `await window.__MESURER__.contextText(...)` or the visible **Copy context** action.

For direct standardized agent delivery, use the ACP session already owned by the client/harness. Mesurer context maps to ACP as one text content block plus optional image content blocks. Do not invent an OpenCode-, Pi-, Cursor-, Codex-, or other harness-specific Mesurer protocol.

## Useful low-level inspection

The existing browser API remains available when more detail is needed:

```js
await window.__MESURER__.ready()
window.__MESURER__.inspect(".selector")
window.__MESURER__.inspectAll(".selector")
window.__MESURER__.distance(".a", ".b")
window.__MESURER__.viewport()
await window.__MESURER__.state()
await window.__MESURER__.stable()
```

Use these primitives to answer a concrete visual question; prefer scoped `context()`/`review()` for normal human-in-the-loop UI work.
