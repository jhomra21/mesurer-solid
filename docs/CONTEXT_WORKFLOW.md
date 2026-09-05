# Context

Mesurer turns live browser state and human visual intent into structured context a coding agent can read through `window.__MESURER__`.

Context is the shared page state. There is no separate Mesurer message-delivery layer.

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

Normal `/inject` and `/inject-script` usage installs Context by default. A deliberately low-level injection can disable it:

```js
window.__MESURER_CONFIG__ = { context: false }
```

Do not reinject over a live Mesurer instance merely to change configuration. Existing review state may be part of the user's message.

## Human controls

| Action | Shortcut | Result |
| --- | --- | --- |
| Copy Context | `C` | Copies workspace context |
| Copy Selection | `Shift+C` | Copies selection-scoped context |
| Add Note | `N` | Saves a target/region annotation baseline |

Agents normally read the API directly instead of clicking these controls.

## Read existing intent first

A broad request such as “check Mesurer” can include several channels at once: current selection, annotations, Arrange intent, text/style intent, guides, measurements, rulers/X-ray state, and screenshot review state.

Start with a non-destructive inventory:

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

Resolve relevant saved objects before HMR can replace their targets. Annotation notes, Arrange Desired geometry, and text/style Desired state are intent. Measurements and computed inspection are rendered evidence.

## Choose the target safely

Use this order after preserving relevant saved intent:

1. Read an existing human selection or annotation first.
2. If the intended target is ambiguous, ask the human to select it.
3. If the exact rendered target is known and no human selection needs preserving, call `select()`.

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` visibly updates normal Select state and returns selection-scoped context. Every selector must resolve to exactly one target; missing or ambiguous selectors throw rather than guessing.

## Context scopes

Workspace:

```js
await window.__MESURER__.context()
```

Selection:

```js
await window.__MESURER__.context({ scope: "selection" })
```

Annotation:

```js
await window.__MESURER__.context({ annotation: annotationId })
```

`MesurerContextV1` is JSON-safe and uses viewport CSS-pixel coordinates. It can include page/viewport state, targets, rectangles, box model, typography, appearance, flex/grid/layout, scroll/overflow, guides, measurements, and distances.

Arrange and text-edit intent remain separate structured channels so they keep their own Before/Desired/Live semantics.

## Multi-selection

A multi-selection is relational state, not just a count. Inspect every selected target and the relationships that matter between them.

Use `selection.visualContext.distances` first. For a needed pair without useful distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, keep useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs rather than generating mechanical O(n²) output.

## Annotations and review

Annotations are target- or region-bound review context rather than freeform drawing objects. A saved note carries its baseline with the rendered evidence it describes.

After source changes:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

This target-bound model intentionally differs from upstream Mesurer's drawing annotations. See [Upstream parity](./UPSTREAM_PARITY.md).

## Fresh evidence after source changes

Re-read the evidence that mattered before the edit:

- `review(annotationId)` for saved annotations;
- `reviewArrange()` while Arrange is showing Live;
- Live text/computed typography with text Desired preview inactive;
- fresh workspace or selection context;
- focused `inspect()`, `distance()`, or `viewport()` values when needed.

Do not delete human history merely to reveal Live state.

## Screenshot evidence

Context can prepare clean screenshot evidence while the outer browser harness owns the pixels:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional Screenshot plugin is a separate human camera workflow and does not add an image-delivery capability to Context.

See [Browser and agent integration](./BROWSER_HARNESS.md), [Arrange](./ARRANGE.md), [Direct text editing and Typography](./TEXT_EDITING.md), and [Screenshots](./SCREENSHOTS.md).
