# Mesurer Solid

A framework-agnostic UI measurement, inspection, annotation, and extension layer for browser applications and coding agents, built as a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer Solid is implemented with Solid 2 internally, but that renderer/runtime is bundled into an isolated browser island. Host applications do **not** need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

Mesurer is useful in four related ways:

1. **Interactive devtool** — selection, measurements, guides, rulers, text inspection, X-ray, color picking, distances, settings, history, and persistence.
2. **Shared human/agent visual state** — the human can point, select, measure, guide, and annotate in the real page while the coding agent reads the same structured state directly from `window.__MESURER__`.
3. **Rendered verification API** — exact JSON-safe DOM geometry, computed styles, distances, context baselines, and deterministic `review()` let agents prove visual changes instead of trusting source CSS.
4. **Composable runtime** — built-ins and third-party extensions share one plugin host, so tools can be added, removed, replaced, or driven by stable commands at runtime.

## Mesurer in action

Mesurer runs as an isolated inspection layer over real applications, including complex stacking, modal/top-layer UI, strict Trusted Types pages, and Electron renderer pages.

<p align="center">
  <img src="docs/assets/showcase/youtube.png" alt="Mesurer Solid inspecting a public YouTube search page" width="100%">
</p>

<table>
  <tr>
    <td><img src="docs/assets/showcase/github.png" alt="Mesurer Solid inspecting GitHub" width="100%"></td>
    <td><img src="docs/assets/showcase/google-maps.png" alt="Mesurer Solid inspecting Google Maps" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>GitHub</sub></td>
    <td align="center"><sub>Google Maps</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/showcase/reddit.png" alt="Mesurer Solid inspecting Reddit" width="100%"></td>
    <td><img src="docs/assets/showcase/google-search.png" alt="Mesurer Solid inspecting Google Search" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>Reddit</sub></td>
    <td align="center"><sub>Google Search</sub></td>
  </tr>
</table>

### Electron renderer

<p align="center">
  <img src="docs/assets/showcase/electron-solid.jpg" alt="Mesurer Solid running over a packaged Electron application with a Solid 1 renderer" width="100%">
</p>

<sub>Mesurer running over a packaged Electron application with a Solid 1 renderer.</sub>

## Install

During the prerelease period:

```bash
bun add -d mesurer-solid@beta
```

or:

```bash
npm install -D mesurer-solid@beta
```

> **Package rename:** prereleases through `0.1.0-beta.11` were published under the old scoped package name. Current releases use the canonical unscoped package name `mesurer-solid`.

## Capabilities at a glance

| Capability | What Mesurer provides |
| --- | --- |
| Framework-independent mounting | `mountMeasurer()` works in browser DOM hosts without sharing the host framework runtime. |
| Isolated UI | ShadowRoot isolation plus protected top-layer/fallback mounting. |
| Visual inspection tools | Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings. |
| Human selections | One/multiple DOM targets or arbitrary dragged regions. |
| Human annotations | Notes with conservative HMR rebinding and immutable scoped baselines. |
| Shared visual context | `MesurerContextV1` combines rendered targets, regions, guides, measurements, distances, visual state, and computed DOM inspection. |
| Deterministic revalidation | `review()` compares fresh rendered evidence with annotation baselines and reports exact changes/missing evidence. |
| Clean screenshot planning | Mesurer can hide control chrome while preserving visual measurement evidence for the outer harness screenshot. |
| Exact element inspection | Rect, margin, padding, border, typography, appearance, flex/grid/layout, scroll size, and overflow. |
| Geometry comparison | Horizontal/vertical gaps and center deltas. |
| Stable command surface | Agents/extensions execute built-in/plugin commands without simulating toolbar clicks or keyboard events. |
| Runtime extensions | Plugins register tools, commands, hooks, overlays, settings, state, services, and lifecycle cleanup. |
| Human-state-safe injection | Agent injection reuses a matching live Mesurer instance by default instead of destroying human review state. |
| Portable Agent Skill | One self-contained skill teaches any capable harness the direct page workflow and includes the exact classic injector. |

## The direct human ↔ agent model

Mesurer does **not** need to send a message into the current agent chat.

The rendered page is already the shared boundary:

```text
human reviewer
    |
    | selects / measures / guides / annotates
    v
real browser page
    |
    | window.__MESURER__
    v
existing coding-agent browser harness
    |
    | edits normal project source
    v
real browser page
    |
    | context() / review() / inspect() / distance() + screenshot
    v
validated result
```

There is no required Mesurer MCP, WebMCP, ACP, localhost feedback daemon, chat/thread/session discovery, or harness-specific transport in the normal workflow.

If an agent can execute JavaScript in the page it is already working on, it can use Mesurer directly.

## The rendered page is the source of truth

A source file saying `gap: 16px`, `align-items: center`, or `width: 100%` does **not** prove that the browser rendered the intended spacing, alignment, dimensions, or overflow.

Fonts, intrinsic sizing, parent layout, transforms, breakpoints, wrapping, scrollbars, and neighboring components can change the actual result.

The default design loop is:

```text
human marks/measures issue in Mesurer
  → agent reads existing workspace/selection/annotations
  → agent edits implementation
  → real app renders / HMR settles
  → __MESURER__.stable()
  → __MESURER__.review(annotationId) and/or fresh context/measurements
  → outer harness takes a real screenshot when useful
  → agent compares exact rendered measurements + pixels to human intent
  → agent fixes discrepancies
  → repeat until rendered evidence supports the claim
```

Use Mesurer to validate statements such as “these edges align,” “the gap is 16px,” “all cards are the same width,” “there is no horizontal overflow,” or “this heading is actually using the intended font.”

Use screenshots for composition, hierarchy, clipping, colors, and visual judgment. Use Mesurer geometry for exact numeric claims.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## Quick start — mount in your own website

```ts
import { mountMeasurer } from "mesurer-solid"

const mesurer = mountMeasurer()
```

If Mesurer should only exist during local development:

```ts
if (import.meta.env.DEV) {
  import("mesurer-solid").then(({ mountMeasurer }) => {
    const mesurer = mountMeasurer()
    import.meta.hot?.dispose(() => mesurer.dispose())
  })
}
```

The host application does not need Solid 2. Mesurer carries its own isolated renderer/runtime.

### Add human context and annotations

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

`mesurer.context` owns annotation state, Copy Context/Copy Selection/Add Note UI, shortcuts, context/review/capture behavior, and cleanup.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.context({ scope: "selection" })
const annotation = await mesurer.context({ annotation: annotationId })
```

After a source edit/HMR cycle:

```ts
await mesurer.agent.stable()
const review = await mesurer.review(annotationId)
```

The human does **not** need to save an annotation just to communicate current visual state. Workspace and selection context already include current measurements/guides/distances.

An annotation is useful when the person wants a durable note and deterministic baseline/review.

## Agent quick start — discover first, inject only if absent

Install the portable skill into the current repository:

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

The skill is intentionally descriptive because there is no transport protocol to configure: it teaches the agent how to discover/reuse the live page state, what Mesurer data means, what to read before editing, how to validate after HMR, and how to combine structured measurements with the harness's real screenshot.

### 1. Preserve existing human state

Before injecting anything:

```js
const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))
```

If true, use that exact instance:

```js
await browser.evaluate(() => window.__MESURER__.ready())
```

Do **not** reinject or dispose it. The human may already have selections, guides, measurements, held distances, rulers/X-ray state, or annotation baselines.

Injected Mesurer itself defaults to reusing a matching live instance. Destructive replacement requires the explicit opt-out:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

Use that only for deliberate HMR/testing—not for normal agent attachment.

### 2. Inject only when absent

If the harness can evaluate JavaScript in the current page, Electron renderer, WebView, or other DOM host, reuse that path:

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

if (!hasMesurer) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

Do not add Mesurer to application source, create a Mesurer-specific build, add another browser/CDP stack, or start an agent/MCP server merely to inspect a page the harness already controls.

### 3. Read what the human is showing you

```js
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}

const annotations = await window.__MESURER__.annotations()
const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

`MesurerContextV1` includes:

```text
page + viewport + DPR + scroll
rulers/X-ray state
selected/referenced targets
exact target rects
margin/padding/border
typography
appearance
flex/grid/layout
scroll/overflow
guides
measurements
held distances
selected/annotated viewport regions
```

The agent should gather initial state **before editing**, especially for unsaved selections that may disappear when HMR replaces DOM nodes.

### 4. Revalidate after editing

```js
await window.__MESURER__.stable()
```

For an annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

For unsaved state, re-read `context()` and use original selectors with focused checks:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

The before/after values already live in the current agent task. No separate message delivery layer is needed.

## Clean screenshot evidence

Mesurer does not render a fake DOM screenshot. The outer browser/harness owns the real screenshot primitive.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // capture the real viewport and optional focus crop
} finally {
  await window.__MESURER__.finishCapture()
}
```

For current selection use `{ scope: "selection" }`.

Capture mode hides toolbar/settings/comment/action chrome while preserving rulers, guides, selected outlines, annotations, measurements, distances, and pixel labels.

## Low-level agent API

The default global is:

```text
window.__MESURER__
```

Useful primitives:

```text
ready / stable
capabilities
context / annotations / review
capturePlan / prepareCapture / finishCapture
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state
```

Prefer `context()` and `review()` for normal human-in-the-loop work. Use low-level primitives for focused measurement questions.

## What Mesurer deliberately does not own

Mesurer is **not** a browser driver or agent orchestration server. It does not own:

- navigation;
- clicking/typing;
- screenshots;
- tabs/windows;
- authentication;
- browser lifetime;
- source editing;
- dev servers;
- chat/thread/task/session routing;
- MCP/WebMCP/ACP delivery.

Those responsibilities stay with Playwright, CDP, Cypress, a coding-agent browser tool, Electron, or whatever outer harness already controls the page.

That separation is intentional: **Mesurer measures, annotates, and exposes the rendered state; the outer harness uses it.**

## Browser extension

The first-party Manifest V3 extension is a zero-source-change human path for arbitrary Chromium pages:

```bash
bun install
bun run build
```

Then load `extension/dist/` as an unpacked extension and click the Mesurer action on an ordinary HTTP(S) page.

The extension is only a distribution shell: it injects the same runtime and `mesurer.context` plugin. An agent does not need an extension-specific protocol; it reads `window.__MESURER__` from the page.

## Plugins

Project-specific inspection behavior should usually be a plugin rather than a permanent fork.

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core"
```

Plugins can contribute tools, commands, hooks, overlays, settings, scoped state, services, history/persistence, renderer-owned UI, and disposal behavior. Built-ins can be excluded/replaced while preserving stable `builtin.*` command routes.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the ownership model.

## Public package surface

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

The same self-contained runtime powers source mounting, browser extension injection, Agent Skill injection, and direct harness inspection.

## Development

```bash
bun install
bun run dev
```

Before considering a change complete:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Browser/package-boundary changes are additionally gated by host compatibility, packed-consumer/package smoke, and visual/interaction checks where applicable.

## Origin and license

Mesurer Solid is adapted from [ibelick/mesurer](https://github.com/ibelick/mesurer), created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick), and extends that project with the Solid 2 port, framework-agnostic package boundary, plugin/runtime architecture, agent context workflow, and additional browser integration work.

MIT. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream and third-party attribution.
