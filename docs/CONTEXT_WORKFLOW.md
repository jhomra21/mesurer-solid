# Human-in-the-loop visual context workflow

Mesurer turns what a person is doing in the real page into structured visual state that the coding agent reads directly through the browser harness it already owns.

There is no Mesurer MCP/WebMCP/ACP/session-delivery layer or Send-to-agent callback.

```text
human selection / guides / measurements / distances / annotation
                            |
                            v
                    MesurerContextV1
                            |
                            v
                  window.__MESURER__
                            |
                 existing browser evaluate
                            |
                            v
                       coding agent
```

The agent edits source normally and uses the same Mesurer state to verify the rendered result.

## Enable the feature

The context/annotation workflow is provided by removable `mesurer.context`.

### Source-mounted applications

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "mesurer-solid"

const mesurer = mountMeasurer({
  plugins: [contextPlugin()],
  agent: true,
})
```

With default options, Copy Context, Copy Selection, Add Note, annotation marker/panel UI, and context/review/capture APIs are enabled.

### Injection and browser extension

`/inject` and `/inject-script` install `contextPlugin()` by default. The browser extension uses the same injected runtime.

A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

## Preserve existing human state

Before injection, an agent checks whether Mesurer is already alive:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)
```

If it exists, use it. Do not reinject or dispose it. The current human selection, guides, measurements, held distances, X-ray/ruler state, and annotations are part of the user's visual message.

Injected Mesurer also defaults to preserving a live instance. Explicit replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option is for deliberate HMR/testing, not normal agent attachment.

## There is no Send-to-agent path

The coding agent pulls context from the page whenever it needs it:

```js
await window.__MESURER__.ready()
const workspace = await window.__MESURER__.context()
```

No conversation ID, delivery callback, or agent transport is needed. The harness already owns the page and current task.

`window.__MESURER__.capabilities().capabilities` reports `context`, `annotations`, `review`, and `capturePlan` when the context plugin is loaded. It does not report send/delivery bits, and `window.__MESURER__` has no `sendContext()` method.

## Workspace, selection, and annotation scopes

### Workspace

```js
await window.__MESURER__.context()
```

Workspace context captures meaningful current visual state:

- selected/referenced targets;
- page and viewport state;
- rulers/X-ray visibility;
- guides;
- measurements;
- held distances;
- exact DOM geometry;
- margin/padding/border;
- typography;
- appearance;
- flex/grid/layout state;
- scroll and overflow.

### Selection

```js
await window.__MESURER__.context({ scope: "selection" })
```

Selection context identifies what the person is pointing at right now. A selection can contain one or more DOM elements or only a dragged viewport region.

Scoped context includes evidence relevant to that target/region. Region-only selection works for whitespace/alignment issues where no DOM node is the right target.

An agent should usually gather both workspace and selection context before editing:

```js
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection.
}
```

Do not require an annotation before live selection/measurement state is useful.

### Multi-selection

Multiple selected elements are a first-class human-to-agent signal.

For every target in `selection.targets`, the agent reads the full inspection: selector/identity, rect, margin/padding/border, typography, appearance, flex/grid/layout, and scroll/overflow.

Then it reads the relationships among those targets. Existing `selection.visualContext.distances` take priority. For a selected pair without relevant distance evidence, use the exact returned selectors:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, report all useful pair relationships. Example:

```text
Target 1: 972 × 390
Target 2: 415 × 53
Target 3: 415 × 68

Target 1 → Target 2: vertical gap 184.9px
Target 1 → Target 3: vertical gap 156.4px
Target 2 → Target 3: horizontal gap 80px
```

Also include relevant viewport/DPR/overflow, guides, held distances, rulers/X-ray, and plugin state. For very large selections, focus on adjacent/repeated/user-relevant relationships rather than dumping all O(n²) pairs.

### Annotation

A saved annotation adds human intent and an immutable scoped baseline.

```js
const annotations = await window.__MESURER__.annotations()
const context = await window.__MESURER__.context({ annotation: annotationId })
```

The annotation note is intent. Computed DOM data, measurements, guides, distances, and screenshots are evidence.

When multiple annotations exist, read the relevant notes/contexts rather than silently choosing the first one.

## What `MesurerContextV1` means

Context is JSON-safe and uses `viewport-css-px` coordinates.

```text
MesurerContextV1
├─ scope
├─ page
├─ viewport
├─ coordinateSpace
├─ regions
├─ visualState
│  ├─ rulersVisible
│  └─ xrayVisible
├─ targets[]
│  └─ inspection
│     ├─ selector / text / accessibility identity
│     ├─ rect
│     ├─ margin / padding / border
│     ├─ typography
│     ├─ appearance
│     ├─ layout
│     └─ scroll / overflow
└─ visualContext
   ├─ guides[]
   ├─ measurements[]
   └─ distances[]
```

Mesurer does not use model inference to guess relevant evidence. Scoped relevance is deterministic and based on selected element references and geometry.

## Context controls

The human context toolbar has exactly three controls:

| Action | Shortcut | Result |
| --- | --- | --- |
| Copy Context | `C` | Copies the current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to the current selection. |
| Add Note | `N` | Creates a durable annotation baseline for the current selection/region. |

Copy actions are human clipboard conveniences. Agents read `window.__MESURER__` directly and do not need to trigger them.

## Annotation UI workflow

### One selected element

Select an element and use the floating annotation affordance, Add Note toolbar action, or `N`. Saving stores the note and target baseline.

### Multiple selected elements

Shift-select all elements that belong to one issue. Saving one note stores the complete selected target set.

### Arbitrary dragged region

Drag an area in Select mode and use Add Note. The saved annotation records the viewport region even when there are no DOM targets.

## Read before editing

A direct-harness agent captures the human's state before HMR can replace DOM nodes:

```js
await window.__MESURER__.ready()

const annotations = await window.__MESURER__.annotations()
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}

const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

This matters because an unsaved selection may disappear when HMR replaces the selected DOM node. The agent retains initial selectors/geometry in its own task context.

## Review after an agent edit

After changing source and allowing the real application to render:

```js
await window.__MESURER__.stable()
```

For annotations:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` includes the original human note, target status, immutable baseline evidence, fresh current context, exact before/current/delta pixel changes, and explicit `kind: "missing"` evidence.

```text
human marks issue
  → agent reads annotation + workspace
  → agent edits source
  → normal HMR/render
  → stable()
  → review(annotationId)
  → inspect exact pixel deltas
  → iterate until evidence supports the request
```

## Validate unsaved human measurements

An annotation is useful but not mandatory.

If the user only selected/measured things, the agent keeps initial workspace/selection context, edits, then re-reads current state:

```js
const currentWorkspace = await window.__MESURER__.context()
```

For focused checks:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

For multi-selection, re-check the same target dimensions and pair relationships captured before editing.

## Annotation rebinding after HMR

While an annotated `HTMLElement` remains connected, Mesurer retains that exact element identity.

After replacement, rebinding is conservative:

- strong `id` / `data-testid` identity must still match;
- weaker fingerprints must remain compatible;
- weak candidates must resolve uniquely;
- incompatible/ambiguous targets remain stale.

The agent must not silently move human intent to a different element when Mesurer reports `stale` or `partial`.

## Screenshot evidence

Mesurer does not render a fake DOM screenshot. The outer browser harness takes real pixels.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // capture current viewport
  // capture focus clip from plan.captures when available
} finally {
  await window.__MESURER__.finishCapture()
}
```

For an unsaved selection:

```js
await window.__MESURER__.capturePlan({ scope: "selection" })
```

Capture mode hides Mesurer chrome while preserving page content, selections/annotations, rulers, guides, measurements, held distances, and pixel labels.

## Agent Skill

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The installed skill teaches one integration:

```text
existing harness
  ↕ JavaScript evaluation + screenshots
existing rendered page
  ↕
window.__MESURER__
```

## Browser extension

The first-party MV3 extension is a zero-source-change human path for arbitrary pages. It packages the same `inject-script` runtime and `mesurer.context` plugin.

The extension is only a distribution shell. The agent does not need an extension protocol; if its harness can evaluate page JavaScript, it reads `window.__MESURER__` directly.
