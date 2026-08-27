# Mesurer agent integration

Mesurer's agent integration is deliberately direct: **the agent reads Mesurer from the same rendered page it is already controlling**.

There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, chat/session bridge, or harness-specific Mesurer adapter.

```text
human reviewer
    |
    | select / measure / guide / annotate
    v
real browser page
    |
    | window.__MESURER__
    v
existing Codex / Claude / Cursor / Pi / OpenCode / other browser harness
    |
    | edits normal project source
    v
real browser page
    |
    | context() / review() / inspect() / distance() + real screenshot
    v
validated result
```

The page is the shared state boundary. Mesurer never needs to know which chat, thread, task, model, or agent is using it.

## Install the portable Agent Skill

The npm package ships one canonical `mesurer-ui` Agent Skill:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The install is self-contained:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches agents to preserve human Mesurer state, read selections/measurements/guides/annotations before editing, and revalidate the rendered result after HMR instead of treating typecheck/build success as visual completion.

## First rule: reuse a live human instance

Before injecting anything, inspect the page:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer already exists, **use that exact instance**. The person may already have selected elements, placed guides, created measurements/held distances, enabled rulers/X-ray, or saved annotation baselines.

The injector also defaults to preserving a live injected instance. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option exists for explicit HMR/test replacement. Agents consuming human review state should not use it.

## Inject only when Mesurer is absent

**Default host-project mutation budget: zero.** Reuse the browser, Electron, WebView, or automation channel the harness already owns.

When the Agent Skill is installed, evaluate `.agents/skills/mesurer-ui/assets/inject-script.js` in the existing page. When `mesurer-solid` is already installed, the equivalent package path is `mesurer-solid/inject-script`:

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

Do not create another Chromium instance, another CDP connection, a Mesurer server, a special application build, or source changes merely to inspect an app the harness can already evaluate.

Injection installs `mesurer.context` by default. A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

## Direct context capability contract

After `ready()`:

```js
window.__MESURER__.capabilities()
```

The context capability surface is read/review oriented:

```text
context
annotations
review
capturePlan
```

There is no `send`, `screenshots`, or `sendContext` delivery capability. The visible context toolbar is also deliberately limited to:

```text
Copy Context     C
Copy Selection   Shift+C
Add Note         N
```

The agent does not need those copy actions to read context; they remain useful human clipboard controls.

## Read the shared visual state

### Workspace context

```js
const workspace = await window.__MESURER__.context()
```

Workspace context answers “look at what I measured.” It includes current page/viewport, inspected targets, rulers/X-ray state, guides, measurements, held distances, and computed DOM/layout evidence.

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates:

```text
schema / id / createdAt
scope
page
viewport
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
  scroll
visualContext
  guides[]
  measurements[]
  distances[]
```

### Current selection

To understand exactly what the human is pointing at now:

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection.
}
```

Selection can be one or more elements or a dragged viewport region. Scoped context retains `regions`, so whitespace/alignment feedback works even with no DOM target.

### Multi-selection

Multi-selection is a first-class communication path, not a special case to summarize away.

For every selected target, consume its full `inspection`: selector/identity, rect, margin, padding, border, typography, appearance, layout, and scroll/overflow.

Then inspect relationships between selected targets. Use relevant `selection.visualContext.distances` first. For selected pairs without an existing held distance, use the selectors returned by context:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For a small selection, report all useful unique pair relationships. A valid three-target read can look like:

```text
Target 1: 972 × 390
Target 2: 415 × 53
Target 3: 415 × 68

Target 1 → Target 2: vertical gap 184.9px
Target 1 → Target 3: vertical gap 156.4px
Target 2 → Target 3: horizontal gap 80px
```

Also read viewport/DPR/document overflow, guides, held distances, rulers/X-ray, and plugin state when those help explain the visual issue. For a very large selection, compare adjacent/repeated or user-relevant relationships rather than dumping every O(n²) pair.

### Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
}
```

An annotation records a human note plus a deterministic baseline. Treat the note as intent and the geometry/computed state/screenshots as evidence.

Do not silently ignore additional annotations when several exist.

## Typical direct-harness read

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

return {
  capabilities: window.__MESURER__.capabilities(),
  workspace,
  selection,
  annotations,
  annotationContexts,
}
```

The exact evaluation wrapper belongs to the harness. Mesurer does not wrap Playwright/CDP/browser-use/Codex/Claude APIs.

## Use Mesurer as a verification instrument

The workflow is not finished when the agent understands the issue. Mesurer should also prove the fix.

```text
human visual evidence
  → agent reads context
  → agent edits source
  → normal HMR/render
  → agent waits for stable()
  → agent reads exact current evidence
  → agent corrects discrepancies
```

### Annotation review

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` compares the immutable scoped baseline against fresh rendered context and reports exact pixel changes/missing evidence using stable annotation target IDs.

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
width: 318px → 320px
expected evidence disappeared: kind="missing"
```

### Unsaved selection/workspace validation

The human does not have to save an annotation. The agent stores the initial workspace/selection context in its current task, edits, then reads current context again.

For focused checks:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.inspectAll(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
await window.__MESURER__.feedback([selectorA, selectorB])
```

For a multi-selection, re-check the same target dimensions and pair relationships captured before the edit.

## Clean screenshots

Mesurer supplies capture scope; the existing harness supplies real pixels:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })

await window.__MESURER__.prepareCapture()
try {
  // harness screenshot: current viewport
  // optional close-up: plan.captures.find(c => c.id === "focus")
} finally {
  await window.__MESURER__.finishCapture()
}
```

For an unsaved selection, use `{ scope: "selection" }`.

Capture mode hides control chrome while preserving selected outlines, annotation markers, rulers, guides, measurements, held distances, and pixel labels.

Use screenshots for composition/appearance and Mesurer geometry for exact numeric claims.

## Source-mounted applications

When Mesurer is intentionally mounted from application code:

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "mesurer-solid"

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
})
```

The same direct model applies: the harness reads `mesurer.agent` or `window.__MESURER__` from the page. `contextPlugin()` has no agent-delivery callback.

## Existing low-level API

These JSON-safe primitives remain available whether or not `mesurer.context` is loaded:

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

Prefer `context()` and `review()` for human-in-the-loop visual development because they preserve human intent and related evidence together.

## Ownership boundary

Mesurer owns measurement, inspection, annotations, context/review/capture planning, and its UI.

The outer harness owns navigation, clicks, typing, screenshots, tabs/windows, authentication, browser lifetime, source editing, dev servers, and the agent conversation itself.

The only required integration boundary is:

```text
existing harness
  ↕ JavaScript evaluation + screenshots
existing rendered page
  ↕
window.__MESURER__
```
