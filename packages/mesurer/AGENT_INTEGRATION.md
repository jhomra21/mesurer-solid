# Mesurer agent integration

Mesurer's agent integration is deliberately direct: **the agent reads Mesurer from the same page it is already controlling**.

There is no required MCP, WebMCP, ACP, localhost feedback daemon, chat/session bridge, or harness-specific Mesurer adapter in the normal workflow.

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

The browser page is the shared state boundary. Mesurer never needs to know which chat, thread, task, model, or agent is using it.

## Install the portable Agent Skill

The npm package ships one canonical `mesurer-ui` Agent Skill:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

Use `--force` only when intentionally replacing an existing local copy. The install is self-contained:

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

If Mesurer already exists, **use that exact instance**. The person may already have selected elements, placed guides, created measurements/held distances, enabled rulers/X-ray, or saved annotation baselines. Reinjection must not erase that state.

The current injector also defaults to reusing a matching live injected instance. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option exists for explicit HMR/test replacement. Agents consuming human review state should not use it.

## Inject only when Mesurer is absent

**Default host-project mutation budget: zero.** If the existing browser, Electron, WebView, or automation harness can execute JavaScript in the target renderer, reuse that channel.

When the Agent Skill is installed, read `.agents/skills/mesurer-ui/assets/inject-script.js` and evaluate those bytes in the existing page. No application dependency is required after the transient installer exits.

When `mesurer-solid` is already installed, the equivalent package path is `mesurer-solid/inject-script`:

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

Do not create another Chromium instance, another CDP connection, a Mesurer server, a special application build, or source changes merely to inspect an app that the harness can already evaluate.

The injection entry points install the removable `mesurer.context` plugin by default. A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false }
```

## Read the shared visual state

After `ready()`, read dynamic capabilities:

```js
window.__MESURER__.capabilities()
```

When `capabilities().capabilities.context` is true, the direct human/agent workflow is available.

### Workspace context

```js
const workspace = await window.__MESURER__.context()
```

Workspace context is the broad answer to "look at what I measured". It includes the current page/viewport, inspected targets, rulers/X-ray state, guides, measurements, held distances, and computed DOM/layout evidence.

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates. Important fields are:

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

The whole workspace can contain evidence from multiple operations. To understand exactly what the human is pointing at now, also try selection context:

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection is valid.
}
```

Selection can be one or more elements or a dragged viewport region. Scoped context retains the requested `regions`, so whitespace/alignment feedback works even with no DOM target.

### Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
}
```

An annotation records a human note plus a deterministic baseline. Treat the note as intent. Treat geometry, guides, measurements, distances, computed styles, and screenshots as evidence supporting that intent.

Do not silently ignore additional annotations when several exist.

## Typical direct-harness read

An agent beginning a UI task can gather the useful state in one browser-evaluation operation:

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

The exact browser-evaluation wrapper belongs to the harness. Mesurer does not wrap Playwright/CDP/browser-use/Codex/Claude APIs.

## Use Mesurer as a verification instrument

The workflow is not finished when the agent understands the bug. Mesurer should also prove the fix.

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

Annotations provide the strongest before/current check:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` compares the immutable scoped baseline against fresh rendered context. It reports exact pixel changes and missing evidence using stable annotation target IDs rather than relying on regenerated selectors.

Useful output can prove things such as:

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
width: 318px → 320px
expected guide/measurement/target disappeared: kind="missing"
```

Annotations retain exact live DOM identity while the original node remains connected. After DOM replacement/HMR, rebinding is deliberately conservative. Ambiguous or incompatible replacements are reported stale rather than silently attaching human intent to another element.

### Unsaved selection/workspace validation

A human does not have to save an annotation for their current measurements to be useful. The agent should store the initial workspace/selection context in its own task, edit, then re-read current context.

For focused checks, use selectors from the initial context with the low-level API:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.inspectAll(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
await window.__MESURER__.feedback([selectorA, selectorB])
```

The agent already owns the before and after values in its task context. No message-delivery transport is necessary.

## Clean screenshots

Mesurer supplies capture scope; the existing browser harness supplies real pixels:

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

Capture mode hides toolbars/settings/comment/action chrome while preserving selected outlines, annotation markers, rulers, guides, measurements, held distances, and pixel labels.

Use screenshots together with structured context. Screenshots are stronger for composition and appearance; Mesurer geometry is stronger for exact spacing/alignment claims.

## Source-mounted applications

When Mesurer is intentionally mounted from application code, explicitly load the same context plugin:

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

The direct-harness model remains the same: the agent reads `mesurer.agent`/`window.__MESURER__` through the page it already controls.

The context plugin still supports optional host callbacks for specialized embedded integrations, but they are **not required for normal agent use** and are not how the portable Agent Skill transfers human state.

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

When an agent is mounted with a scoped root, inspection primitives respect that root.

Prefer `context()` and `review()` for normal human-in-the-loop visual development because they preserve human intent and related evidence together.

## What agents should not do

The normal direct integration does not require an agent to:

- discover MCP/WebMCP tools;
- start a localhost Mesurer server;
- discover a Codex/Claude/OpenCode thread or session;
- inject a new chat message from the page;
- create a second browser or CDP stack;
- add Mesurer to the target application's source/build;
- reinject over a live human instance;
- mutate human guides/measurements merely to make a validation pass.

## Ownership boundary

Mesurer owns measurement, inspection, annotations, context/review/capture behavior, and its UI.

The outer harness owns navigation, clicks, typing, screenshots, tabs/windows, authentication, browser lifetime, source editing, dev servers, and the agent conversation itself.

The only required integration boundary is:

```text
existing harness
  ↕ JavaScript evaluation + screenshots
existing rendered page
  ↕
window.__MESURER__
```
