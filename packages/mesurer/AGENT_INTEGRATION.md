# Mesurer agent integration

Mesurer's agent integration is deliberately direct: **the agent reads and manipulates Mesurer through the same rendered page it is already controlling**.

There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, chat/session bridge, or harness-specific Mesurer adapter.

The central contract is stronger than “Mesurer is available”:

> **A Mesurer visual operation should return structured context to the harness.** The agent should consume existing human context before editing and obtain fresh Mesurer context/review for the affected rendered UI before claiming completion.

```text
human selection / annotation OR agent-known changed target
        ↓
real page + window.__MESURER__
        ↓
context() / select() / review()
        ↓ structured rendered evidence
agent reasoning + source edit
        ↓
normal render/HMR
        ↓
fresh context() / select() / review()
        ↓
validated result
```

The page is the shared state boundary. Mesurer never needs to know which chat, thread, model, or agent is using it.

## Install the portable Agent Skill

Use the stable package by default:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

Use `mesurer-solid@beta` only when intentionally validating a prerelease.

The installed skill is self-contained:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill defines the same context-first workflow described here, including the distinction between Mesurer's optional human screenshot plugin and screenshots owned by the agent's outer browser harness.

## Reuse a live human instance first

Before injecting anything:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, use that exact instance. The person may already have selected elements, placed guides, measured gaps, held distances, enabled rulers/X-ray, saved annotations, or kept a screenshot preview open. Read and preserve that state before changing it.

The injector also reuses a live injected instance by default. Deliberate destructive replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

Do not use that while consuming human review state.

## Inject only when absent

Default host-project mutation budget is zero. Reuse the browser, Electron, WebView, Playwright, CDP, or other evaluation channel the harness already owns.

With the installed skill, evaluate `.agents/skills/mesurer-ui/assets/inject-script.js`. With the npm package installed, use `mesurer-solid/inject-script`.

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

const alreadyPresent = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (!alreadyPresent) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

Do not create a second browser/CDP connection, Mesurer server, special app build, or source mutation merely to inspect a page the harness already controls.

Normal injection keeps screenshot capture disabled unless requested:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

The first-party Chrome extension enables the screenshot plugin automatically because its human-facing camera tool can use the extension's visible-tab capture bridge.

## Capability contract

After `ready()`:

```js
window.__MESURER__.capabilities()
```

The context-oriented capability surface is:

```text
context
select
annotations
review
capturePlan
```

`select` is an agent/harness operation; it does not add a human context-toolbar button. Human context controls remain:

```text
Copy Context
Copy Selection
Add Note
```

There is no `send`, `screenshots`, or `sendContext` **delivery capability**. The optional `mesurer.screenshot` plugin is a separate human capture tool/service and does not add image delivery to the context API.

## Context acquisition precedence

Harnesses should follow this order.

### 1. Existing human evidence exists → read it first

```js
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

For relevant annotations:

```js
const context = await window.__MESURER__.context({
  annotation: annotation.id,
})
```

Do not overwrite a meaningful live human selection until its context has been consumed and retained by the current agent task.

### 2. No relevant selection and intended target is ambiguous → ask the user

When the user's visual reference cannot be mapped confidently to exact rendered elements or a region, ask the person to select the intended element(s) or drag the intended region in Mesurer.

Then read:

```js
const context = await window.__MESURER__.context({ scope: "selection" })
```

Do not guess merely to avoid asking for a selection.

### 3. No relevant selection and agent knows exact target(s) → use `select()`

If the harness knows exactly which rendered elements correspond to the change, it should select them itself:

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

`select()` is deliberately context-returning. In one operation it:

1. switches Mesurer to Select;
2. visibly highlights the exact rendered targets;
3. makes them the live selection;
4. waits for the selection to settle;
5. returns selection-scoped `MesurerContextV1`.

The return value is the point. A harness should not call `select()` only for visual highlighting and then ignore the context.

Every supplied selector must resolve to exactly one target inside Mesurer's page target. Invalid, missing, or ambiguous selectors throw. Refine the selector or ask the user to select the intended target rather than guessing.

This makes a useful post-edit pattern trivial:

```js
await window.__MESURER__.stable()

const evidence = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])

// `evidence` is the exact rendered result the agent should reason from.
```

## What context contains

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates:

```text
schema / id / createdAt
scope
page
viewport / DPR / scroll
coordinateSpace
regions
visualState
  rulersVisible
  xrayVisible
targets[]
  ref
  inspection.selector
  inspection.rect
  margin / padding / border
  typography
  appearance
  layout
  scroll / overflow
visualContext
  guides[]
  measurements[]
  distances[]
```

Prefer these rendered numbers over screenshot estimates or source-level assumptions.

## Multi-selection is relational

When several targets are selected, consume every target's complete inspection and the relevant relationships between them.

Use existing `visualContext.distances` first. For a needed pair not represented there:

```js
const pair = window.__MESURER__.distance(selectorA, selectorB)
```

A small selection can produce evidence such as:

```text
Card A width: 320px
Card B width: 320px
A → B horizontal gap: 24px
A/B top-edge delta: 0px
```

For large repeated sets, focus on adjacent/repeated/user-relevant relationships instead of dumping all O(n²) pairs.

## Context is required before and after meaningful visual edits

### Before editing

If the user supplied visual evidence, retain it before HMR can replace nodes:

```js
const before = await window.__MESURER__.context({ scope: "selection" })
```

or:

```js
const before = await window.__MESURER__.context({ annotation: annotationId })
```

### After editing

First wait for the actual rendered page:

```js
await window.__MESURER__.stable()
```

Then obtain fresh evidence using the strongest path.

Human annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

Still-relevant human selection:

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

Agent knows exact changed rendered targets:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

Target identity is ambiguous after the change: ask the user to select the intended result and then read selection context.

For meaningful visual work, lint/typecheck/tests/build are not enough. If Mesurer is available and the changed UI can be identified, a harness should not report completion without fresh Mesurer evidence for that UI.

## Annotation review

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` compares the human baseline against fresh context and reports exact pixel changes/missing evidence:

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
width: 318px → 320px
expected target/guide/measurement missing
```

If the requested result remains numerically wrong, continue editing.

## Human screenshot plugin vs agent screenshot evidence

Mesurer has two intentionally different screenshot paths.

### Human capture tool

The optional `mesurer.screenshot` plugin gives the person a camera tool inside Mesurer:

```ts
import { mountMeasurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMeasurer({
  plugins: [screenshotPlugin()],
})
```

The user can drag a viewport region, capture a real HiDPI-aware PNG, optionally copy/download it, keep a persistent draggable thumbnail, and open a larger Copy/Save viewer. Normal browser hosts use `getDisplayMedia()`; the first-party Chrome extension uses `chrome.tabs.captureVisibleTab()` through its isolated-world bridge and therefore avoids the screen-share chooser.

For advanced mounted integrations, the typed `MesurerScreenshotService` is available from the plugin host under service id `screenshot`. It is not part of `window.__MESURER__`'s context/delivery capability surface.

Agents should preserve an existing human screenshot preview unless the task explicitly asks them to test, close, replace, or otherwise manipulate the screenshot feature.

### Agent verification screenshot

For coding-agent verification, the outer harness should normally continue to own screenshot bytes so the task can control the exact browser, viewport, timing, and artifact destination. Mesurer supplies clean capture scope/presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // use the harness's real screenshot primitive
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use the signals together:

```text
Mesurer context → exact geometry, box model, styles, distances, overflow
real screenshot → composition, hierarchy, clipping, color, visual judgment
```

Do not replace exact Mesurer measurements with pixel estimates from either screenshot path.

## Source-mounted usage

When Mesurer is intentionally mounted from application code:

```ts
import { contextPlugin, mountMeasurer } from "mesurer-solid"

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
})
```

The same API is available on `mesurer.agent` and, when configured, `window.__MESURER__`:

```js
const context = await mesurer.agent.select("#target")
```

Screenshot capture can be composed independently with `screenshotPlugin()` when the host wants the human camera tool. No transport callback is involved.

## Low-level inspection

These remain useful for focused queries:

```js
window.__MESURER__.inspect(".selector")
window.__MESURER__.inspectAll(".selector")
window.__MESURER__.at(x, y)
window.__MESURER__.distance(".a", ".b")
window.__MESURER__.viewport()
await window.__MESURER__.feedback([".selector"])
await window.__MESURER__.state()
await window.__MESURER__.stable()
```

Prefer `context()`, `select()`, and `review()` for visual development because they provide context that directly carries human intent or agent-selected affected UI into reasoning.

## Harness completion rule

A good harness-level visual completion loop is:

```text
1. discover/reuse Mesurer and preserve human state
2. consume existing human context
3. if target ambiguous, ask user to select
4. otherwise select known affected rendered target(s) when needed
5. consume returned context
6. edit normal source
7. wait for stable render
8. get fresh review/context; use select() for known changed targets
9. optionally capture a real screenshot through the outer harness
10. iterate until rendered evidence supports the claim
```

When the task is specifically testing Mesurer's screenshot plugin, exercise its camera/preview/viewer path as the feature under test; otherwise do not substitute it for the harness's normal screenshot primitive.

**Context is the output of the Mesurer step, not an optional side effect.**