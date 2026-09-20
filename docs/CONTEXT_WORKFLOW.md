# Context

Mesurer turns live browser state and human visual intent into structured context a coding agent can read through `window.__MESURER__`.

Context is the shared page state. Normal agent use does not require a separate Mesurer message-delivery layer; optional transports such as Codex depend on Context without changing that browser-state contract.

## Enable Context

Source-mounted applications opt in with `context()` from the unified plugin entry:

```ts
import { mountMesurer } from "mesurer-solid"
import { context } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [context()],
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

For an ordinary selected element, Mesurer can show a selection-adjacent Add Note button. That transient button is hidden while the same selection is in direct text edit so the edit ring, dimensions pill, and Typography own the contextual lane. It returns when editing ends. Existing saved annotation markers/panels and the underlying Context data are not removed.

The Add Note composer is owned by the selection that opened it. If the user selects a different element or region before saving, Mesurer closes the unsaved composer instead of moving it to the new target; the new selection gets its normal small Add Note button. Add Note and saved annotation cards are protected Mesurer UI, so live page selection/hover chrome paints underneath them rather than crossing through the card.

Annotation presentation is source-linked rather than viewport furniture. On normal window scroll, the Add Note trigger, composer, saved markers, open panel, and ownership edge live in the document scroll tree and move with the page target in the same painted frame. Nested overflow containers use the runtime's scroll compensation so the same UI stays attached there too. A saved panel keeps its target-relative page point and may leave the viewport with its source instead of being clamped back onto the screen.

Several notes on one target keep separate nearby markers. Opening one note does not remove the Add Note trigger, so another note can be added without closing the current review first. The marker layout keeps repeated notes local to the owning target and avoids covering unrelated markers when a clear placement is available.

Saved annotations also survive a same-tab reload. Context stores only its annotation records in session-scoped browser storage. On reload it restores the original ids, notes, immutable baselines, selectors, fingerprints, and last-known geometry, then conservatively rebinds each element target through the same selector/fingerprint rules used for live DOM replacement. Ambiguous or missing targets stay unresolved instead of binding to a convenient lookalike. Removing an annotation updates that stored review state immediately.

Context also controls the paint order between page evidence and Mesurer annotation UI. When Context owns the document-backed annotation UI, live Select hover evidence uses the lower document evidence layer even if Mesurer's outer host itself is in the browser top layer. This matters because a browser top-layer node outranks ordinary document `z-index`; keeping page evidence in the same document paint domain is what lets the opaque composer and saved cards fully occlude the blue hover fill and border.

## Read existing intent first

A broad request such as "check Mesurer" can refer to several kinds of saved or live evidence: current selection, annotations, Arrange intent, text/style intent, guides, measurements, rulers/X-ray state, and screenshot review state.

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

## Typed Context service

Application code that owns the plugin host can resolve `MesurerContextService` from service id `context:v1`.

| Method | Result |
| --- | --- |
| `context(request?)` | Return structured Context. |
| `contextText(request?)` | Format the same Context as text. |
| `copyContext(request?)` | Copy formatted Context to the clipboard. |
| `select(selectors)` | Select exact targets and return selection Context. |
| `annotations()` | List saved annotations. |
| `removeAnnotation(annotationId)` | Remove one saved annotation after a trusted workflow completes it. |
| `review(annotationId?)` | Compare one or all saved baselines with the current page. |
| `capturePlan(request?)` | Return screenshot regions for Context or an annotation. |
| `prepareCapture()` | Hide or adjust Mesurer presentation before an external screenshot. |
| `finishCapture()` | Restore presentation after the screenshot. |

The mounted instance and `window.__MESURER__` mirror the normal agent-facing Context methods. `removeAnnotation()` stays on the plugin service because annotation deletion should be an explicit application or trusted-workflow action.

## Multi-selection

A multi-selection records relationships between selected targets. Inspect every target and the relationships that matter between them.

Use `selection.visualContext.distances` first. For a needed pair without useful distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, keep useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs rather than generating mechanical O(n²) output.

## Annotations and review

Annotations are target- or region-bound review context rather than freeform drawing objects. A saved note carries its baseline with the rendered evidence it describes.

The Add Note button is only a UI control. During an active direct text edit it is intentionally absent from the selected element, so agents and integrations must not use button visibility as a capability check. Durable annotation state remains available through `annotations()`, `context({ annotation })`, and `review()`.

An unsaved composer is transient UI, not durable annotation state. Changing selection closes it by design; only a submitted note becomes a saved annotation that follows its own stored target/region baseline.

When a saved note highlights its owning element, the temporary ownership emphasis reuses the same exact target bounds as selection. It does not add a second inner or outer rectangle, fill, glow, or rounded frame. Scrolling keeps that edge attached to the same source as the marker and panel.

After source changes:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

This target-bound model intentionally differs from upstream Mesurer's drawing annotations. See [Upstream parity](./UPSTREAM_PARITY.md).

## Optional delivery transports

Context itself does not know about local coding-agent processes or session ownership. A transport plugin can depend on `context:v1` and serialize the same evidence for an explicit human action.

The first optional transport is `codex()` from `mesurer-solid/plugins`. It queues Context text to a Codex thread known to the local companion. See [Send Context feedback to Codex](./CODEX.md).

## Fresh evidence after source changes

Re-read the evidence that mattered before the edit:

- `review(annotationId)` for saved annotations;
- `reviewArrange()` while Arrange is showing Live;
- Live text/computed typography with text Desired preview inactive;
- fresh workspace or selection context;
- focused `inspect()`, `distance()`, or `viewport()` values when needed.

Do not delete human history merely to reveal Live state.

## Screenshot evidence

Context can prepare clean screenshot evidence while the browser controller owns the pixels:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // browser-controller screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional Screenshot plugin is a separate human camera workflow and does not add an image-delivery capability to Context.

See [Browser and agent integration](./BROWSER_HARNESS.md), [Arrange](./ARRANGE.md), [Direct text editing and Typography](./TEXT_EDITING.md), and [Screenshots](./SCREENSHOTS.md).
