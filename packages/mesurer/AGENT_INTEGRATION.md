# Mesurer agent integration

Mesurer's agent integration is direct: **the agent reads Mesurer through the same rendered page it is already controlling**.

There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, chat/session bridge, or harness-specific Mesurer adapter.

The page is the shared state boundary. A meaningful Mesurer operation should return evidence that the coding agent actually consumes before it edits source or claims completion.

```text
human visual intent
  ↓
Arrange / text-style Desired edits / annotation / selection
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

The skill defines the same state-preservation, Arrange, text-edit, context, screenshot, HMR, and completion rules described here.

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

If Mesurer exists, use that exact instance. The person may already have arranged elements, edited copy/typography into a Desired state, selected targets, placed guides, measured gaps, held distances, enabled rulers/X-ray, saved annotations, or kept a screenshot preview open. That state is part of the user's visual message.

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
textEdits
textEdit
```

Direct text editing reports:

```text
textEdit
```

and exposes:

```text
textEdits()
textEdit(id)
```

When `arrangePlugin()` is mounted, capabilities also reports:

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

## Broad Mesurer/context requests mean inspect all human intent

If the user says “check Mesurer,” “check Measure,” “look at Mesurer context,” “see what I highlighted/moved/annotated/edited,” or otherwise asks generally about Mesurer state, treat that as a request to inspect the **combined live review state**, not only the return value of `context()`.

Start with a non-destructive inventory:

```js
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

Then resolve the saved human intent that is relevant to the task:

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

Bring the useful pieces together before editing: target-bound notes, current selection, Arrange Before/Desired geometry, text Before/Desired copy and style deltas, guides, measurements, held distances, exact target inspection, layout/style data, rulers/X-ray state, and any existing human screenshot preview that must be preserved.

The user may have selected one element, annotated another, moved a group with Arrange, edited copy or typography, and left measurements/guides that explain the relationship. Those are not separate conversations. They are one encoded visual request. Do not ask the person to repeat information Mesurer already contains, and do not overwrite one channel before reading the others.

## Arrange has high human-intent precedence

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

## Direct text editing: human UI and durable intent

Direct text editing records human copy and typography intent without pretending to edit application source. It is not a separate top-level tool/plugin.

The human enters it while **Select** or **Text Inspector** is active:

```text
double-click ordinary direct text
(or double-tap with touch/pen)
  ↓
current text is selected in full
  ↓
in-place editor uses rendered typography
  ↓
compact Mesurer bar: B / I / U / Text ▾
  + automatic Text Inspector card for that exact field
  ↓
Enter keeps Desired / Shift+Enter newline
```

Because Arrange keeps Select active, this same interaction works while Arrange remains selected. The transient Text Inspector card does **not** globally enable Text Inspector or interrupt Arrange.

The default formatting surface deliberately stays compact. B/I/U are direct formatting controls; **Text ▾** opens the detailed typography menu. Its top section offers Text plus Heading 1/2/3 only for levels actually rendered by visible direct-text page elements. Each semantic preset uses the page's **dominant rendered typography bundle** for that level: font family, size, weight, style, line height, tracking, text transform, and color. The Text preset derives from dominant visible direct-text paragraph/span typography.

If a page contains special non-dominant variants of the same semantic level, those variants remain available through the menu's page-derived Font, Size, Weight, color swatches, and custom color picker. Heading levels absent from the rendered page are not invented.

While the editor owns focus, `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, and `Cmd/Ctrl+U` toggle formatting. Text/H1/H2/H3 use `Option+Cmd+0/1/2/3` on macOS and `Alt+Ctrl+0/1/2/3` elsewhere. If the Text menu is open, the first Escape closes the menu; Escape with it closed cancels the edit.

Link creation and numbered/bulleted lists are intentionally not exposed as fake controls. Those would require a structural/rich-text intent model rather than ordinary typography deltas.

The automatic card reuses the existing typography/card renderer and reports Family, Size, Weight, Line, Tracking, tag/text information, and CSS-variable references when available. It refreshes during the session. The current editing boundary is intentionally direct text rather than generic rich text: ordinary elements with one unambiguous non-empty direct text node. Native `<input>`, `<textarea>`, `<select>`, `contenteditable`, and ambiguous mixed/nested rich-text structures retain their normal browser/application behavior.

The automatic inspector card is **transient human presentation**, not another durable context channel. Durable intent is the saved text-edit record.

See the repository's canonical [`docs/TEXT_EDITING.md`](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TEXT_EDITING.md) for the full interaction and runtime contract.

## Text/style Desired edits are source intent too

If `capabilities.textEdit` is true, read saved edits before source changes:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

Each intent contains:

```text
id / createdAt / pageUrl
selector / nodeIndex
before
  original text
desired
  requested text
styles[]
  property
  before
  desired
```

Current style deltas can include font family, size, weight, style, line height, letter spacing, text transform, color, and text-decoration line.

Treat Desired copy and style deltas as a **visual/source specification**, not a request to paste Mesurer's preview implementation into production. If the person chose a semantic preset or a font, weight, size, or color that already exists on the rendered page, inspect the codebase for the semantic component prop, class, CSS variable, design token, theme value, or stylesheet rule that produces it.

Page-derived options are evidence of what the application already renders; they are not a source-code token scanner and do not imply that sampled computed values belong in inline styles.

While Select or Text Inspector is active, Mesurer may be rendering the saved Desired text/style as a reversible preview. Do not compare against that preview and declare the source implementation correct.

After editing source:

1. retain the text-edit intent;
2. wait for the real render;
3. deactivate the active Select/Text Inspector preview without clearing the intent;
4. inspect the actual target text and computed typography;
5. compare those Live values with `intent.desired` and `intent.styles`;
6. reactivate Select only if continued review is useful.

Mesurer relinquishes ownership when the application itself changes the value, so correct source output remains correct with the temporary preview inactive.

## Context acquisition after intent preservation

Once any relevant Arrange and text-edit intent is retained, use this order for ordinary context.

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

Text/style Desired intent, with its temporary preview inactive:

```js
const intent = await window.__MESURER__.textEdit(textEditId)
const live = window.__MESURER__.inspect(intent.selector)
```

Compare the actual rendered text and relevant typography values with the saved Desired intent.

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

Active direct-editor controls, its Text menu, and the contextual inspector card are Mesurer chrome, not application evidence. Arrange uses the same screenshot ownership model through `arrangeCapturePlan()` while adding explicit Before/Desired/Live presentation.

Use all three signals when relevant:

```text
Mesurer context/review → geometry, box model, styles, distances, overflow
saved Desired intent    → requested Arrange geometry + copy/typography
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

Arrange remains optional. Direct text editing and text-edit intent are part of the base inspector runtime; applications do not need a separate text-edit plugin.

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
await window.__MESURER__.textEdits()
await window.__MESURER__.textEdit(textEditId)
await window.__MESURER__.stable()
```

Prefer `arrangements()`, `textEdits()`, `context()`, `select()`, `reviewArrange()`, and `review()` for visual development because those paths preserve human meaning and return evidence the agent can reason from directly.

## Completion rule

A good harness-level loop is:

```text
1. discover/reuse Mesurer and preserve human state
2. if the request is broad, inventory Arrange + text edits + annotations + selection + workspace context before narrowing
3. consume relevant Arrange and text/style Desired intent first
4. capture Arrange Before/Desired when useful, before source edits
5. consume existing annotation/selection context
6. resolve exact targets; ask only when genuinely ambiguous
7. edit normal source
8. wait for stable render
9. switch Arrange to Live and deactivate text Desired preview when applicable
10. get fresh source-rendered review/context and optional screenshot
11. iterate until rendered evidence supports completion
```

Do not clear Arrange history, clear text-edit history just to reveal Live, alter human measurements/guides, replace live Mesurer state, or use a temporary preview to make unfinished source work appear correct.

**Rendered evidence is the output of the Mesurer step, not an optional side effect.**