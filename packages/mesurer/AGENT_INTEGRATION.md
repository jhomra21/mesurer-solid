# Mesurer agent integration

Mesurer's agent integration is direct: **the agent reads Mesurer through the same rendered page it is already controlling**.

There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, chat/session bridge, or harness-specific Mesurer adapter.

The page is the shared state boundary. A meaningful Mesurer operation should return evidence that the coding agent actually consumes before it edits source or claims completion.

```text
human visual intent
  ↓
Arrange / annotation / selection
  ↓
window.__MESURER__
  ↓
structured rendered evidence + optional harness screenshot
  ↓
agent edits normal source
  ↓
real render / HMR
  ↓
fresh Live review/context
  ↓
validated result
```

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

The skill defines the same state-preservation, Arrange, context, screenshot, HMR, and completion rules described here.

## Reuse a live human instance

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

If Mesurer exists, use that exact instance. The person may already have arranged elements, selected targets, placed guides, measured gaps, held distances, enabled rulers/X-ray, saved annotations, or kept a screenshot preview open. That state is part of the user's visual message.

The injector reuses a live injected instance by default. Deliberate destructive replacement requires:

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

Normal injection keeps the optional human screenshot plugin disabled unless requested:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

## Capabilities

After `ready()`:

```js
window.__MESURER__.capabilities()
```

The context-oriented surface is:

```text
context
select
annotations
review
capturePlan
```

When `arrangePlugin()` is mounted, it also reports:

```text
arrange
```

and exposes:

```text
arrangements()
arrange(id)
showArrange(id, state)
arrangeCapturePlan(id, state)
reviewArrange(id, tolerance?)
```

There is no `send`, `screenshots`, or `sendContext` delivery capability. Screenshot bytes stay with the outer browser harness.

## Arrange has highest human-intent precedence

Arrange lets a person reposition selected rendered elements into the layout they want without editing application source. If Arrange is available, consume relevant saved intents before changing human selection or editing source:

```js
const arrangements = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(arrangeId)
```

Each intent contains exact target identity plus Before and Desired geometry.

Desired is a **visual specification**, not an implementation prescription. If a target moved `96px` right, do not blindly write `transform: translateX(96px)` into production CSS. Inspect the rendered layout and implement the appropriate flex/grid alignment, gap, margin, sizing, ordering, component structure, or other semantic source change.

### Capture Before and Desired before source edits

When screenshot comparison will help, reconstruct and capture both states before HMR can change the baseline:

```js
await window.__MESURER__.showArrange(arrangeId, "before")
const beforePlan = await window.__MESURER__.arrangeCapturePlan(arrangeId, "before")

await window.__MESURER__.prepareCapture()
try {
  // outer harness captures Before with beforePlan
} finally {
  await window.__MESURER__.finishCapture()
}

await window.__MESURER__.showArrange(arrangeId, "desired")
const desiredPlan = await window.__MESURER__.arrangeCapturePlan(arrangeId, "desired")

await window.__MESURER__.prepareCapture()
try {
  // outer harness captures Desired with desiredPlan
} finally {
  await window.__MESURER__.finishCapture()
}
```

The user should not need to export, attach, or send these screenshots manually. The harness already owns its screenshot primitive; Mesurer supplies the reproducible state and exact capture geometry.

For source-mounted integrations that use this capture workflow, mount `contextPlugin()` together with `arrangePlugin()` so the generic capture preparation methods are available.

### Verify the source-produced result

After editing source:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Live removes Arrange's temporary preview. `reviewArrange()` compares the real application layout with Desired and returns exact rectangle deltas plus `connected`, `partial`, or `stale` target status.

```text
Before       Desired      Live
x 120   →    x 284        x 276
                         remaining +8px

edit source
  ↓
Live x 284
  ↓
matched ✓
```

If review is still numerically wrong, continue editing. If it is `stale` or `partial`, do not silently bind the intent to a different element.

## Context acquisition after Arrange preservation

Once any relevant Arrange intent is retained, use this order for ordinary context.

### Existing human selection or annotation

```js
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

For a relevant annotation:

```js
const context = await window.__MESURER__.context({
  annotation: annotation.id,
})
```

Do not overwrite a meaningful human selection until its context has been retained by the current task.

### Ambiguous target

If the user's visual reference cannot be mapped confidently to exact rendered elements or a region, ask the person to select the intended element(s) or region in Mesurer, then read:

```js
const context = await window.__MESURER__.context({ scope: "selection" })
```

Do not guess merely to avoid asking for a selection.

### Agent knows the exact target

Use `select()` and consume its return value:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()` switches Mesurer to Select, visibly highlights the exact rendered targets, makes them the live selection, waits for the selection to settle, and returns selection-scoped `MesurerContextV1`.

Every selector must resolve to exactly one page target. Invalid, missing, or ambiguous selectors throw.

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

Prefer rendered numbers over screenshot estimates or source assumptions.

## Multi-selection is relational

When several targets are selected, consume each target plus the useful relationships between them. Start with `visualContext.distances`; for a pair not represented there:

```js
const pair = window.__MESURER__.distance(selectorA, selectorB)
```

A useful result can be:

```text
Card A width: 320px
Card B width: 320px
A → B horizontal gap: 24px
A/B top-edge delta: 0px
```

For large repeated sets, focus on adjacent or user-relevant relationships rather than dumping all O(n²) pairs.

## Fresh evidence is required after visual edits

Wait for the actual rendered page:

```js
await window.__MESURER__.stable()
```

Then use the strongest applicable path.

Arrange:

```js
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

Still-relevant human selection:

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

Agent-known changed targets:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

For meaningful visual work, lint/typecheck/tests/build are not enough. They validate implementation mechanics, not the rendered result.

## Screenshot ownership

Mesurer has two different screenshot roles.

### Human camera tool

The optional `mesurer.screenshot` plugin gives the person a camera tool:

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  plugins: [screenshotPlugin()],
})
```

It captures HiDPI-aware PNGs and can copy/download them or keep a draggable preview/viewer. Preserve an existing human screenshot preview unless the task explicitly requires manipulating it.

### Agent screenshot evidence

The outer coding harness owns screenshot bytes so it controls the exact browser, viewport, timing, and artifact destination. Mesurer supplies exact geometry and clean capture presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // use the harness's real screenshot primitive
} finally {
  await window.__MESURER__.finishCapture()
}
```

Arrange uses the same ownership model through `arrangeCapturePlan()` while adding explicit Before/Desired/Live presentation.

Use both signals:

```text
Mesurer context/review → geometry, box model, styles, distances, overflow
real screenshot          → composition, hierarchy, clipping, color, visual judgment
```

## Source-mounted usage

For context plus Arrange:

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    contextPlugin(),
    arrangePlugin(),
  ],
})
```

The same API is available on `mesurer.agent` and, when configured, `window.__MESURER__`.

Arrange remains optional. Applications that only want the base inspector or context workflow do not pay for the Arrange entry-point bundle.

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

Prefer `arrangements()`, `context()`, `select()`, `reviewArrange()`, and `review()` for visual development because those paths preserve human meaning and return evidence the agent can reason from directly.

## Completion rule

A good harness-level loop is:

```text
1. discover/reuse Mesurer and preserve human state
2. consume relevant Arrange intent first
3. capture Before/Desired when useful, before source edits
4. consume existing annotation/selection context
5. resolve exact targets; ask only when genuinely ambiguous
6. edit normal source
7. wait for stable render
8. switch Arrange to Live when applicable
9. get fresh Arrange review/context and optional screenshot
10. iterate until rendered evidence supports completion
```

Do not clear Arrange history, alter human measurements/guides, replace live Mesurer state, or use a temporary preview to make unfinished source work appear correct.

**Rendered evidence is the output of the Mesurer step, not an optional side effect.**