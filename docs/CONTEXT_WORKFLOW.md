# Human-in-the-loop visual context workflow

Mesurer turns what a person is doing in the real page into structured visual state that the coding agent can read directly through the browser harness it already owns.

There is no required MCP/WebMCP/ACP/session-delivery layer in the normal workflow.

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

The agent then edits source normally and uses the same Mesurer state to verify the rendered result.

## Enable the feature

The context/annotation workflow is provided by the removable `mesurer.context` plugin.

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

With default options, the visible Copy Context, Copy Selection, Add Note, annotation marker/panel UI, and context/review APIs are enabled.

### Injection and browser extension

The generic `/inject` and `/inject-script` paths install `contextPlugin()` by default because context/annotations are the intended human/agent workflow. The browser extension uses the same injected runtime.

A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

## Preserve existing human state

Before injection, an agent must check whether Mesurer is already alive:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)
```

If it exists, use it. Do not reinject or dispose it. The current human selection, guides, measurements, held distances, X-ray/ruler state, and annotations are part of the user's visual message.

Injected Mesurer also defaults to reusing a matching live instance. Explicit replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option is for deliberate HMR/testing, not normal agent attachment.

## Human context does not require a Send button

The coding agent pulls context from the page whenever it needs it:

```js
await window.__MESURER__.ready()
const workspace = await window.__MESURER__.context()
```

No conversation ID or agent transport is needed. The harness already owns the page and current task.

## Workspace, selection, and annotation scopes

### Workspace

```js
await window.__MESURER__.context()
```

Workspace context captures the meaningful current visual workspace:

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

This is the normal answer to requests such as:

> "Look at the measurements I made. The layout is wrong."

### Selection

```js
await window.__MESURER__.context({ scope: "selection" })
```

Selection context identifies what the person is pointing at right now. A selection can contain one or more DOM elements or only a dragged viewport region.

Scoped contexts include only evidence relevant to that target/region. Region-only selection therefore works for whitespace/alignment issues where no DOM node is the right semantic target.

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

Do not require the human to create an annotation before their live selection/measurements become useful.

### Annotation

A saved annotation adds human intent and an immutable scoped baseline.

```js
const annotations = await window.__MESURER__.annotations()
const context = await window.__MESURER__.context({ annotation: annotationId })
```

The annotation note is intent. Computed DOM data, measurements, guides, distances, and screenshots are evidence.

When multiple annotations exist, the agent should read the relevant notes/contexts rather than silently choosing the first one.

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

When `contextPlugin()` renders its UI, the main human controls are:

| Action | Shortcut | Result |
| --- | --- | --- |
| Copy Context | `C` | Copies the current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to the current selection. |
| Add Note | `N` | Creates a durable annotation baseline for the current selection/region. |

Optional custom hosts may still configure their own callback-based actions, but **the portable agent workflow does not depend on them**. Agents read the page API directly.

## Annotation UI workflow

### One selected element

Select an element and use the floating annotation affordance, Add Note toolbar action, or `N`. Saving stores the note and target baseline.

### Multiple selected elements

Shift-select all elements that belong to one issue. Saving one note stores the complete selected target set.

### Arbitrary dragged region

Drag an area in Select mode and use Add Note. The saved annotation records the viewport region even when there are no DOM targets.

## Read before editing

A direct-harness agent should capture the human's state before modifying the DOM through HMR:

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

This matters because an unsaved selection may disappear when HMR replaces the selected DOM node. The agent should retain the initial selector/geometry in its own task context.

## Review after an agent edit

After changing source and allowing the real application to render:

```js
await window.__MESURER__.stable()
```

For annotations:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` includes:

- the original human note;
- target status;
- immutable baseline evidence;
- fresh current context;
- exact before/current/delta pixel changes;
- explicit `kind: "missing"` evidence when a baseline target/guide/measurement/distance no longer exists.

Example:

```text
human marks issue
  → agent reads annotation + workspace
  → agent edits source
  → normal HMR/render
  → stable()
  → review(annotationId)
  → inspect exact pixel deltas
  → iterate until the evidence supports the request
```

Mesurer can prove numeric changes. It does not claim subjective intent such as "feel lighter" is objectively solved; pair numeric data with a real screenshot and the user's stated intent.

## Validate unsaved human measurements

An annotation is useful but not mandatory.

If the user only selected/measured things, the agent keeps the initial `workspace`/`selection` object, edits, then re-reads current context:

```js
const currentWorkspace = await window.__MESURER__.context()
```

For focused checks, use exact selectors from the initial context:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

This lets the agent prove things such as:

```text
left edges: 4px apart → 0px apart
horizontal distance: 37px → 24px
card width: 318px → 320px
horizontal page overflow: true → false
```

The before/after values live inside the current agent task. No separate delivery channel is required.

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

For an unsaved selection, use:

```js
await window.__MESURER__.capturePlan({ scope: "selection" })
```

Capture mode hides Mesurer chrome while preserving page content, selections/annotations, rulers, guides, measurements, held distances, and pixel labels.

Use screenshots together with structured context:

```text
Mesurer data → exact geometry and computed state
screenshot    → visual composition and appearance
```

## Agent Skill

The npm package ships one portable `skills/mesurer-ui/SKILL.md` plus the exact built classic injector:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The installed skill is intentionally harness-agnostic. It teaches one integration:

```text
existing harness
  ↕ JavaScript evaluation + screenshots
existing rendered page
  ↕
window.__MESURER__
```

It explicitly tells agents to preserve existing human state, read before editing, and revalidate after rendering.

## Browser extension

The first-party MV3 extension is a zero-source-change human path for arbitrary pages. It packages the same `inject-script` runtime and `mesurer.context` plugin.

The extension is only a distribution shell. The agent does not need a special extension protocol; if its browser harness can evaluate page JavaScript, it reads `window.__MESURER__` directly.
