# Design feedback loop

Mesurer is most useful when the rendered page stays in the loop while UI work is happening.

The rule is simple: source intent is not proof of the rendered result. Measure the page the user is actually looking at, preserve the visual intent they already expressed there, then verify the Live result after the source changes.

## The loop

```text
human selects / measures / annotates / arranges / edits text
        ↓
agent reuses the existing Mesurer instance
        ↓
agent reads selection + context + saved intent
        ↓
agent edits normal application source
        ↓
real page renders / HMR settles
        ↓
agent verifies Live geometry, copy, typography, and appearance
        ↓
repeat only where the evidence is still wrong
```

If Mesurer is absent, inject it through the browser evaluation channel the harness already owns. Do not create a second browser, Mesurer server, or delivery protocol.

## Read before editing

A broad Mesurer request should preserve all relevant human state before HMR can replace DOM targets:

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

The human may already be communicating through several channels:

| State | Meaning |
| --- | --- |
| Selection | “This is what I mean.” |
| Multi-selection | Compare these targets and their relationships. |
| Guides / held distances / measurements | Rendered alignment and spacing evidence. |
| Annotation | Durable target-bound note plus review baseline. |
| Arrange Desired | Requested layout geometry. |
| Text/style Desired | Requested copy and typography. |
| Screenshot preview | Human visual review state to preserve. |

Rulers and X-ray are inspection context. Annotation, Arrange, and text/style Desired state are explicit intent.

## Measure relationships, not just elements

For a multi-selection, inspect every target and the relevant pairwise relationships. Use `selection.visualContext.distances` first, then `distance(a, b)` when a needed pair is missing.

Exact geometry comes from Mesurer. Screenshots are for composition, hierarchy, clipping, overlap, and other visual judgment. Do not estimate pixel distances from screenshots when Mesurer can report them.

## Validate the right thing

For layout and spacing, compare target rectangles, box model, guides, held distances, and pair gaps.

For typography, compare rendered family, size, weight, line height, tracking, alignment, and color. If the human saved a direct text edit, compare `textEdit(id)` Desired copy/style with **Live source while the Desired preview is inactive**.

For Arrange, compare the real application layout with Desired using Live/review:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

A temporary Arrange transform is a visual specification, not production CSS. Implement the outcome through the application's real layout system.

Both preview systems are ownership-aware. If the host application changes a text/style value or Arrange transform itself, Mesurer preserves that host value instead of restoring an obsolete preview over it.

## Typography while arranging

Arrange keeps Select active, so a reviewer can move an element and then double-click its text without leaving the layout workflow. The edit adds separate text/style Desired intent and a contextual Typography card.

If Typography was already selected, the direct-edit session uses one live Typography card rather than stacking two surfaces. Closing the edit restores the normal Typography surface.

Read Arrange and text-edit intent together before implementing either outcome. See [Arrange](./ARRANGE.md) and [Direct text editing and Typography](./TEXT_EDITING.md).

## Annotation review

A saved annotation carries an immutable baseline. Read it before source changes:

```js
const context = await window.__MESURER__.context({ annotation: annotationId })
```

After the page settles:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

A review can turn a visual note into exact evidence such as a gap moving from 37px to 24px or an edge mismatch reaching 0px.

## Screenshot evidence

For coding-agent verification, the outer harness should own screenshot bytes while Mesurer owns capture presentation:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // outer harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional Screenshot plugin is a separate human camera workflow. Preserve an existing preview unless the task is specifically about that feature. See [Screenshots](./SCREENSHOTS.md).

## Completion

A UI task is ready when the evidence that matters to the request is correct. A useful completion report cites concrete results, for example:

```text
card left edge: 312px
heading left edge: 312px
button/card right gap: 24px
document horizontal overflow: false
requested label and typography match saved Desired intent in Live source
screenshot: no clipping or overlap
```

Do not call every Mesurer method after every edit. Preserve the user's state, measure the relevant targets and relationships, and verify the actual rendered result.

See [Browser and agent integration](./BROWSER_HARNESS.md) for the transport boundary and [Context workflow](./CONTEXT_WORKFLOW.md) for structured review state.
