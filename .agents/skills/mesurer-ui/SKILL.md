---
name: mesurer-ui
description: Use Mesurer when implementing, reviewing, or fixing frontend UI in a browser. Load for visual alignment, spacing, sizing, layout, CSS, responsive work, design/Figma implementation, screenshots, pixel discrepancies, or human Mesurer annotations. Revalidate visual changes with Mesurer before claiming completion when Mesurer is available.
---

# Mesurer UI workflow

Mesurer is a shared visual inspection and feedback layer between the person reviewing a UI and the agent editing it.

## Discover Mesurer

When you have a browser/evaluation channel, check for `window.__MESURER__` before inventing another visual-inspection workflow.

```js
window.__MESURER__?.capabilities()
```

If Mesurer is absent and the harness already has a page/renderer JavaScript-evaluation primitive, prefer injecting the published `@jhomra21/mesurer-solid/inject-script` through that existing channel. Do not add Mesurer to application source, create another browser, or change the app build unless the user explicitly wants Mesurer embedded.

## Human feedback comes first

Before editing UI code, read any Mesurer annotations and the relevant scoped context:

```js
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
```

Treat the user's annotation note as intent. Treat selectors, geometry, guides, measurements, distances, typography, and screenshots as evidence that helps implement that intent. Do not override a user's stated intent merely because a numeric measurement exists.

For the current unsaved selection, use `await window.__MESURER__.context({ scope: "selection" })`. For the whole meaningful workspace, use `await window.__MESURER__.context()`.

## Implement, render, revalidate

For a requested visual change:

1. Capture the relevant annotation/selection context before editing.
2. Make the smallest source change that addresses the visual intent.
3. Let the normal dev server/HMR update the page.
4. Wait for the rendered UI to settle with `await window.__MESURER__.stable()`.
5. Re-read the affected annotation with `await window.__MESURER__.review(annotationId)`.
6. Inspect measurable before/current changes and iterate when discrepancies remain.
7. If the harness supports screenshots, inspect current visual evidence as well.
8. For visual tasks, do not declare completion merely because typecheck/tests/build pass when Mesurer is available for browser validation.

Annotations use durable selectors/fingerprints and can rebind after normal HMR DOM replacement. If a target is stale, do not silently substitute another element.

## Screenshot evidence

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Use the harness/browser's real screenshot primitive for viewport + plan.focus.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture Mesurer evidence (guides, rulers, outlines, annotations, measurements, distances, pixel labels) while controls are hidden. Use screenshots together with structured Mesurer evidence, not instead of it.

## Delivery

The universal fallback is `contextText()` or **Copy context**. For direct standardized delivery, use the ACP session already owned by the client/harness: one Mesurer text block plus optional image blocks. Do not invent harness-specific Mesurer protocols.

Low-level `inspect`, `inspectAll`, `distance`, `viewport`, `state`, and `stable` APIs remain available for specific questions.
