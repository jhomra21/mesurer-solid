# Human-in-the-loop visual context workflow

Mesurer turns what a person or coding agent is doing in the real page into structured visual context that the agent reads directly through the browser harness it already owns.

There is no Mesurer MCP/WebMCP/ACP/session-delivery layer or Send-to-agent callback.

The core contract is:

> **Context is the output.** A meaningful Mesurer visual step should return structured rendered evidence to the agent, and meaningful visual edits should end with fresh Mesurer context/review for the affected UI.

```text
human selection / annotation OR agent-known rendered target
                            ↓
                    window.__MESURER__
                            ↓
             context() / select() / review()
                            ↓
                    MesurerContextV1
                            ↓
                       coding agent
                            ↓
                    source edit/render
                            ↓
                    fresh context/review
```

Mesurer also has an optional human screenshot plugin. It captures real pixels for the person, but it does not change the context-first agent contract or create an image-delivery API. See [Screenshot capture](./SCREENSHOTS.md).

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

With default options, Copy Context, Copy Selection, Add Note, annotation UI, and context/select/review/capture APIs are enabled.

The human screenshot camera is a separate optional plugin:

```ts
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMeasurer({
  plugins: [contextPlugin(), screenshotPlugin()],
  agent: true,
})
```

### Injection and browser extension

`/inject` and `/inject-script` install `contextPlugin()` by default. Screenshot capture remains opt-in for normal injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Set that before the first injection when the human camera is required. The first-party Chrome extension uses the same injected runtime and enables screenshot capture automatically so its camera tool can use the extension visible-tab capture bridge.

A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

Do not reinject over a live human instance merely to change plugin configuration. Existing review state should be preserved.

## Preserve existing human state

Before injection:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)
```

If it exists, use it. Do not reinject or dispose it. The human's current selection, guides, measurements, held distances, X-ray/ruler state, annotations, and screenshot preview/viewer state are part of the visual message.

Injected Mesurer also preserves a live instance by default. Explicit replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That is for deliberate testing/tooling, not normal agent attachment.

## Direct capability contract

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities().capabilities
```

The context layer exposes:

```text
context
select
annotations
review
capturePlan
```

There are no send/delivery capability bits and no `sendContext()`. The screenshot plugin also does not add a `screenshots` delivery capability; its typed service lives on the plugin host rather than the JSON-safe context API.

The human context toolbar remains exactly:

```text
Copy Context
Copy Selection
Add Note
```

`select()` is programmatic agent/harness functionality, not another human toolbar button. When `mesurer.screenshot` is enabled, its camera tool is a separate plugin-contributed toolbar control.

## Target acquisition: read, ask, or self-select

Agents should use the following precedence.

### 1. Existing human selection/annotation → read it first

```js
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Read relevant annotation contexts too:

```js
const context = await window.__MESURER__.context({ annotation: annotation.id })
```

Do not overwrite meaningful human selection until its context has been retained in the current task.

### 2. No relevant selection + intended target ambiguous → ask the user

If the request cannot be confidently mapped to exact rendered elements or a region, ask the user to select the intended element(s) or drag the intended region with Mesurer.

Then immediately read:

```js
const context = await window.__MESURER__.context({ scope: "selection" })
```

Do not guess merely to avoid asking for visual disambiguation.

### 3. No relevant selection + exact target known → call `select()`

If the agent knows exactly which rendered elements it changed or needs to inspect, it should select them itself:

```js
const context = await window.__MESURER__.select("#pricing-card")
```

or:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` performs one context-returning visual operation:

1. Mesurer is enabled and switched to Select;
2. the exact rendered target(s) are visibly highlighted;
3. those elements become the live Mesurer selection;
4. the visual state settles;
5. selection-scoped `MesurerContextV1` is returned.

The agent should consume the returned object. The highlight is useful to the human, but context is the output for the agent.

Every selector must resolve to exactly one target inside Mesurer's page target. Invalid, missing, or ambiguous selectors throw. Refine the selector or ask the human to select the target rather than guessing.

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

Selection context identifies what is being pointed at now. A selection can contain one or more DOM elements or only a dragged viewport region.

An agent should gather human selection before editing. When no human selection exists and exact affected targets are known, `select()` creates the selection and returns the same scoped context directly.

### Multi-selection

Multiple selected elements are a first-class human/agent signal.

For every target in `selection.targets`, consume full inspection: selector/identity, rect, margin/padding/border, typography, appearance, flex/grid/layout, and scroll/overflow.

Then inspect relationships. Existing `selection.visualContext.distances` take priority. For a selected pair without relevant distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, report all useful pair relationships. For large selections, focus on adjacent/repeated/user-relevant pairs rather than dumping O(n²) output.

### Annotation

A saved annotation adds human intent and an immutable scoped baseline.

```js
const annotations = await window.__MESURER__.annotations()
const context = await window.__MESURER__.context({ annotation: annotationId })
```

The annotation note is intent. Computed DOM data, measurements, guides, distances, and screenshots are evidence.

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

Mesurer does not use model inference to guess evidence. Scoped relevance is deterministic and based on selected element references and geometry.

Prefer exact rendered values over screenshot estimates or source declarations.

## Context controls

The human context toolbar has exactly three controls:

| Action | Shortcut | Result |
| --- | --- | --- |
| Copy Context | `C` | Copies current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to current selection. |
| Add Note | `N` | Creates a durable annotation baseline. |

Agents read `window.__MESURER__` directly and do not need to click these controls. The screenshot camera, when enabled, belongs to `mesurer.screenshot` and deliberately does not claim `C`.

## Read before editing

A direct-harness agent captures existing human state before HMR can replace nodes:

```js
await window.__MESURER__.ready()

const annotations = await window.__MESURER__.annotations()
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Retain the relevant selectors, geometry, relationships, and intent in the task.

## Fresh context after an edit

After changing source and allowing the real application to render:

```js
await window.__MESURER__.stable()
```

Then choose the strongest path.

### Annotation baseline

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` includes original note, target status, immutable baseline, fresh current context, exact before/current/delta pixel changes, and explicit missing evidence.

### Still-relevant human selection

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

Re-check the same target dimensions and relationships captured before editing.

### Agent knows the changed rendered targets

Proactively select/highlight them and receive exact context:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

This is the preferred final evidence path when there was no human selection. It simultaneously shows the user what changed and gives the agent exact rendered evidence.

### Target identity became ambiguous

Ask the user to select the intended result and then read selection context. Do not guess.

For meaningful visual changes, lint/typecheck/tests/build are not sufficient proof. If Mesurer is available and affected UI can be identified, fresh Mesurer context/review is part of completion.

## Annotation rebinding after HMR

While an annotated element remains connected, Mesurer retains exact identity. After replacement, rebinding is conservative:

- strong `id` / `data-testid` identity must remain compatible;
- weaker fingerprints must remain compatible;
- weak candidates must resolve uniquely;
- incompatible/ambiguous targets remain stale.

The agent must not silently move human intent to a different element when Mesurer reports `stale` or `partial`.

## Screenshot evidence

Mesurer uses two different screenshot paths.

### Agent/harness evidence

The context API does not render a fake DOM screenshot. For coding-agent verification, the outer browser harness takes the real pixels while Mesurer controls clean evidence presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // capture current viewport / focus clip through the harness
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides Mesurer control chrome while preserving page content, selections/annotations, rulers, guides, measurements, held distances, and pixel labels.

### Human screenshot plugin

The optional `mesurer-solid/screenshot` plugin captures real visible-tab PNGs for a person. It adds drag-region selection, HiDPI-aware cropping, persisted copy/download outputs, a persistent draggable thumbnail, native image actions, and a larger Copy/Save viewer. Normal browsers use `getDisplayMedia()`; the first-party Chrome extension uses `chrome.tabs.captureVisibleTab()` through its extension bridge.

This plugin does not add screenshots to `MesurerContextV1` or create an image-delivery capability. Preserve an existing human screenshot preview unless the task explicitly asks to manipulate it.

See [`SCREENSHOTS.md`](./SCREENSHOTS.md) for the complete screenshot contract.

Use screenshots for visual composition and Mesurer context for exact numeric claims.

## Agent Skill

Canonical stable installation:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

Use `--package=mesurer-solid@beta` only when intentionally validating a prerelease.

The installed skill teaches this integration, including the human-screenshot-vs-agent-screenshot distinction:

```text
existing harness
  ↕ JavaScript evaluation + screenshots
existing rendered page
  ↕
window.__MESURER__
  ↳ context() / select() / review()
```

## Browser extension

The first-party MV3 extension is a zero-source-change human path for arbitrary pages. It packages the same injected runtime, installs `mesurer.context`, and enables `mesurer.screenshot` automatically.

The extension shell owns active-tab execution and the narrow visible-tab capture bridge used by the camera tool; it does not add chat/session delivery. Agents with page JavaScript evaluation continue to use the same direct context API.

See [`../extension/README.md`](../extension/README.md) for extension setup and capture behavior.

**Context is the output.**