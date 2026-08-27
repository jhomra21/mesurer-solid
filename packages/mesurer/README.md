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

The human can use the visible page UI to:

- select one or multiple elements;
- drag arbitrary regions;
- place guides;
- create measurements and held distances;
- enable rulers or X-ray;
- save annotation notes/baselines.

The coding agent reads that same rendered state directly from the page. **No MCP, WebMCP, ACP, localhost feedback daemon, or chat/session routing is required for the normal workflow.**

## Direct coding-agent workflow

Mesurer is shared visual state:

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

Before injecting anything, check the current page:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer already exists, **reuse it**. Do not reinject or dispose it; doing so could destroy the human's selections, guides, measurements, distances, and annotations.

Injected Mesurer also defaults to reusing a matching live instance. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option is for explicit test/HMR replacement, not normal agent attachment.

### Inject only when absent

When the harness already has JavaScript evaluation, reuse that browser instead of creating another one:

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

Selection context answers what the human is pointing at **right now**. It can represent selected DOM elements or a dragged viewport region. Humans do not need to save an annotation for their current measurements to be useful to the agent.

### Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
}
```

An annotation adds a durable note and immutable baseline. The note is human intent; geometry, computed styles, guides, distances, and screenshots are supporting evidence.

## Verify the rendered fix

After the agent edits normal project source and the real page updates:

```js
await window.__MESURER__.stable()
```

For a saved annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` reports exact before/current/delta pixels and explicit missing evidence. It can prove changes such as:

```text
gap: 37px → 24px
left-edge mismatch: 4px → 0px
card width: 318px → 320px
```

For unsaved human state, keep the initial `context()`/selection snapshot in the agent task, then read the current workspace again. Use original target selectors for focused checks:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.inspectAll(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
await window.__MESURER__.feedback([selectorA, selectorB])
```

A successful typecheck/build is not visual proof when rendered validation is available.

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

Capture mode hides Mesurer control chrome while preserving guides, rulers, measurements, held distances, annotation/selection markers, and pixel labels.

Use structured Mesurer geometry for exact numeric claims and screenshots for composition/appearance.

## Context UI

With default `contextPlugin()` UI:

| Action | Shortcut | What it does |
| --- | --- | --- |
| Copy Context | `C` | Copies the current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to selected element(s) or dragged region. |
| Add Note | `N` | Creates a durable annotation baseline for the current selection/region. |

Optional callback-based host actions can still be configured by specialized embedded integrations, but the portable Agent Skill does not depend on a Send-to-agent transport.

## Portable Agent Skill

There are no Mesurer packages for individual agent harnesses. The npm package ships one canonical `mesurer-ui` Agent Skill:

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

The skill teaches the direct workflow in detail: discover/reuse human state, read workspace/selection/annotations before editing, revalidate the rendered result, and use the current harness's screenshot primitive.

See [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Low-level agent API

Regardless of the context plugin:

```text
ready / stable
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state
```

Use the low-level API for narrow measurement questions. Prefer `context()` and `review()` for normal human-in-the-loop work.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core"
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, renderer-owned UI, and lifecycle cleanup. Built-ins can be excluded/replaced without forking the renderer.

## Public surface

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

The package is self-contained. Private core/DOM/renderer workspaces and the internal Solid runtime must not leak into the published consumer surface.

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
