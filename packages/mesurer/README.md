# mesurer-solid

Framework-agnostic UI measurement, annotation, inspection, and agent-ready visual context for browser applications.

The renderer is implemented privately in Solid 2, but consumers can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

```bash
bun add -d mesurer-solid@beta
# or
npm install -D mesurer-solid@beta
```

> Prereleases through `0.1.0-beta.11` used the old scoped package name. New releases use `mesurer-solid`.

## Mount the base inspector

```ts
import { mountMeasurer } from "mesurer-solid"

const mesurer = mountMeasurer()
```

The base inspector contains Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, the plugin host, and the low-level agent inspection API.

## Add human visual context

Context and annotations are provided by removable `mesurer.context`:

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

The human can use the visible page UI to select one or multiple elements, drag arbitrary regions, place guides, create measurements/held distances, enable rulers/X-ray, and save annotation notes/baselines.

The coding agent reads that same rendered state directly from the page. **There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, or chat/session routing.**

## Direct coding-agent workflow

```text
human reviewer
  → selects / measures / guides / annotates in the real page
  → window.__MESURER__
  → existing coding-agent browser harness reads the page
  → agent edits source
  → page/HMR updates
  → agent remeasures/reviews
```

### Preserve a live human instance

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

If Mesurer already exists, reuse it. Injected Mesurer also preserves a live instance by default. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option is for explicit test/HMR replacement, not normal agent attachment.

### Inject only when absent

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (!hasMesurer) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

Injection installs `contextPlugin()` by default. To deliberately inject only the low-level inspector:

```js
window.__MESURER_CONFIG__ = { context: false }
```

## Read what the human is showing you

### Whole workspace

```js
const workspace = await window.__MESURER__.context()
```

Workspace context includes page/viewport state, rulers/X-ray visibility, inspected targets, guides, measurements, held distances, exact rects, box model, typography, appearance, layout, scroll size, and overflow.

### Current selection

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Selection context answers what the human is pointing at now. It can represent one/multiple DOM elements or a dragged viewport region.

### Multi-selection

For every selected target, consume the complete inspection: selector/identity, rect, margin/padding/border, typography, appearance, layout, and scroll/overflow.

Use existing `visualContext.distances` first, then `distance(selectorA, selectorB)` for selected pairs whose relationship is not already represented. Small multi-selections should return useful pairwise pixel relationships instead of merely saying “3 elements selected.”

### Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
}
```

An annotation adds a durable note and immutable baseline. The note is human intent; geometry/computed styles/guides/distances/screenshots are supporting evidence.

## Verify the rendered fix

After the agent edits normal project source and the real page updates:

```js
await window.__MESURER__.stable()
```

For a saved annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` reports exact before/current/delta pixels and explicit missing evidence.

For unsaved state, keep the initial context/selection snapshot in the agent task, then re-read current state. Use target selectors for focused checks:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.inspectAll(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
await window.__MESURER__.feedback([selectorA, selectorB])
```

For multi-selection, verify the same target dimensions and pair relationships captured before editing.

## Clean screenshot evidence

Mesurer plans the evidence frame; the existing browser harness takes the real screenshot:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Capture the real viewport and optional focus crop through the harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

For current selection use `{ scope: "selection" }`.

## Context UI and agent contract

With default `contextPlugin()` UI:

| Action | Shortcut | What it does |
| --- | --- | --- |
| Copy Context | `C` | Copies the current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to selected element(s) or dragged region. |
| Add Note | `N` | Creates a durable annotation baseline for the current selection/region. |

Those are the three context controls. There is no Send-to-agent control or callback.

`window.__MESURER__.capabilities().capabilities` exposes context, annotations, review, and capture planning when the context plugin is loaded. It does not expose send/delivery capability bits, and `window.__MESURER__` does not expose `sendContext()`.

## Portable Agent Skill

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The installer leaves:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches the direct workflow in detail, including multi-selection reads and post-edit verification. See [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Low-level agent API

Regardless of the context plugin:

```text
ready / stable
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state
```

Use low-level APIs for narrow measurement questions. Prefer `context()` and `review()` for normal human-in-the-loop work.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core"
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, renderer-owned UI, and lifecycle cleanup.

## Public surface

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
