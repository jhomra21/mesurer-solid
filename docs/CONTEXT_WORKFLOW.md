# Context workflow

Mesurer turns live browser state and human visual intent into structured context a coding agent can read through `window.__MESURER__`.

There is no Mesurer message-delivery layer. Context, saved intent, and review state stay in the page the human and agent already share.

## Enable Context

Source-mounted applications opt in with `contextPlugin()`:

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"

const mesurer = mountMesurer({
  agent: true,
  plugins: [contextPlugin()],
})
```

Normal `/inject` and `/inject-script` usage installs Context by default. A deliberately low-level injection can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

Do not reinject over a live Mesurer instance merely to change configuration; preserve the human's current review state.

## Human controls

Context contributes three human actions:

| Action | Shortcut | Result |
| --- | --- | --- |
| Copy Context | `C` | Copies current workspace context. |
| Copy Selection | `Shift+C` | Copies selection-scoped context. |
| Add Note | `N` | Saves a target/region annotation baseline. |

Agents normally read the API directly instead of clicking these controls.

Arrange, direct text editing, and Screenshot are separate intent/plugin channels. A broad “check Mesurer” request should inventory them together rather than treating `context()` as the whole message.

## Preserve live state

Before injecting or changing selection:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)
```

If Mesurer exists, reuse it. Selection, guides, measurements, held distances, rulers/X-ray state, annotations, Arrange intent, text/style intent, and screenshot review state may all be part of the user's visual message.

## Inventory a broad request

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

Resolve relevant saved objects before HMR can replace their targets:

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

Annotation notes, Arrange Desired geometry, and text/style Desired state are intent. Measurements and computed inspection are rendered evidence.

## Target acquisition

Use this order after preserving relevant saved intent:

1. If the human already selected or annotated the target, read that state first.
2. If the target is ambiguous, ask the human to select the intended element(s) or region.
3. If the exact rendered targets are known and no human selection needs preserving, call `select()`.

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` visibly updates the normal Select state and returns selection-scoped context. Every selector must resolve to exactly one target; missing or ambiguous selectors throw rather than guessing.

## Context scopes

Workspace context:

```js
await window.__MESURER__.context()
```

Selection context:

```js
await window.__MESURER__.context({ scope: "selection" })
```

Annotation context:

```js
await window.__MESURER__.context({ annotation: annotationId })
```

`MesurerContextV1` is JSON-safe and uses viewport CSS-pixel coordinates. It can include page/viewport state, selected targets, exact rectangles, box model, typography, appearance, flex/grid/layout, scroll/overflow, guides, measurements, and distances.

Saved Arrange and text-edit intent remain separate structured channels so they keep their own Before/Desired/Live semantics.

## Multi-selection

A multi-selection is a first-class signal. Inspect every selected target and the relationships that matter between them.

Use `selection.visualContext.distances` first. For a needed pair without relevant evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, preserve useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs.

## Annotations

Annotations are target- or region-bound review context rather than freeform drawing objects. A saved note remains attached to the rendered evidence it describes and carries an immutable baseline for later `review()`.

```js
const review = await window.__MESURER__.review(annotationId)
```

This is an intentional difference from upstream Mesurer's arrow/pen/freeform drawing model. See [Upstream parity](./UPSTREAM_PARITY.md).

## Text and Arrange intent

Direct text editing records Before/Desired copy and typography through `textEdits()` / `textEdit(id)`. Native editable content remains under application/browser control, and host-authored changes take ownership over stale Mesurer previews.

Arrange records Before/Desired geometry and verifies the application through Live/review with its temporary transform removed. Host-authored transform changes are preserved rather than overwritten during cleanup.

Read both channels when they are relevant to the same task. See [Direct text editing and Typography](./TEXT_EDITING.md) and [Arrange](./ARRANGE.md).

## Fresh evidence after source edits

After the real page settles:

```js
await window.__MESURER__.stable()
```

Then re-read the evidence that mattered before the edit:

- `review(annotationId)` for saved annotations;
- `reviewArrange()` with Arrange showing Live;
- target copy/computed typography with text Desired preview inactive;
- fresh selection/workspace context;
- focused `inspect()`, `distance()`, or `viewport()` values when needed.

Do not delete human history merely to expose Live state.

## Screenshots

Context can prepare clean screenshot evidence while the outer harness owns the pixels:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional Screenshot plugin is a separate human camera workflow and does not add an image-delivery capability to Context. See [Screenshots](./SCREENSHOTS.md).

For the browser transport boundary, see [Browser and agent integration](./BROWSER_HARNESS.md). For a full UI implementation loop, see [Design feedback loop](./DESIGN_FEEDBACK_LOOP.md).
