# Mesurer Solid

A framework-agnostic UI measurement, inspection, annotation, and extension layer for browser applications and coding agents, built as a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer Solid is implemented with Solid 2 internally, but that renderer/runtime is bundled into an isolated browser island. Host applications do **not** need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

Mesurer is useful in four related ways:

1. **Interactive devtool** — selection, measurements, guides, rulers, text inspection, X-ray, color picking, distances, optional screenshots, settings, history, and persistence.
2. **Shared human/agent visual state** — the human can point, select, measure, guide, and annotate in the real page while the coding agent reads the same structured state directly from `window.__MESURER__`.
3. **Rendered verification API** — exact JSON-safe DOM geometry, computed styles, distances, context baselines, context-returning programmatic selection, and deterministic `review()` let agents prove visual changes instead of trusting source CSS.
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

Stable releases use the `latest` dist-tag:

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use the beta dist-tag only when intentionally testing a prerelease:

```bash
bun add -d mesurer-solid@beta
```

> **Package rename:** prereleases through `0.1.0-beta.11` were published under the old scoped package name. Current releases use the canonical unscoped package name `mesurer-solid`.

## Capabilities at a glance

| Capability | What Mesurer provides |
| --- | --- |
| Framework-independent mounting | `mountMeasurer()` works in browser DOM hosts without sharing the host framework runtime. |
| Isolated UI | ShadowRoot isolation plus protected top-layer/fallback mounting. |
| Visual inspection tools | Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings. |
| Optional screenshot capture | `screenshotPlugin()` adds drag-region visible-tab PNG capture with HiDPI cropping, persisted clipboard/download outputs, a persistent draggable preview/viewer, and extension-native visible-tab capture. |
| Human selections | One/multiple DOM targets or arbitrary dragged regions. |
| Agent target selection | `select(selector | selectors)` visibly selects exact targets and returns selection-scoped `MesurerContextV1`. |
| Human annotations | Notes with conservative HMR rebinding and immutable scoped baselines. |
| Shared visual context | `MesurerContextV1` combines rendered targets, regions, guides, measurements, distances, visual state, and computed DOM inspection. |
| Deterministic revalidation | `review()` compares fresh rendered evidence with annotation baselines and reports exact changes/missing evidence. |
| Clean screenshot planning | Mesurer hides control chrome while preserving visual measurement evidence for the outer harness screenshot. |
| Exact element inspection | Rect, margin, padding, border, typography, appearance, flex/grid/layout, scroll size, and overflow. |
| Geometry comparison | Horizontal/vertical gaps and center deltas. |
| Stable command surface | Agents/extensions execute built-in/plugin commands without simulating toolbar clicks or keyboard events. |
| Runtime extensions | Plugins register tools, commands, hooks, overlays, settings, state, services, and lifecycle cleanup. |
| Human-state-safe injection | Agent injection reuses a matching live Mesurer instance by default instead of destroying human review state. |
| Portable Agent Skill | One self-contained skill teaches any capable harness the direct context-first page workflow, including the screenshot boundary, and includes the classic injector. |

## The direct human ↔ agent model

Mesurer does **not** need to send a message into an agent chat. The rendered page is already the shared boundary.

The important contract is that **context comes back to the agent**:

```text
human selection/annotation OR agent-known changed target
    ↓
real browser page
    ↓ window.__MESURER__
context() / select() / review()
    ↓ structured rendered evidence
existing coding-agent browser harness
    ↓ source edit
real browser page
    ↓ fresh context/review
validated result
```

There is no required Mesurer MCP, WebMCP, ACP, localhost feedback daemon, chat/thread/session discovery, or harness-specific transport.

If an agent can execute JavaScript in the page it is already working on, it can use Mesurer directly.

## Context is the output

An agent using Mesurer should not merely activate a tool or draw a highlight and continue. A meaningful visual step should produce structured rendered evidence that the agent actually consumes.

The target-acquisition order is:

1. **Human already selected/annotated something** → read that state first.
2. **No relevant selection and the intended target is visually ambiguous** → ask the user to select the intended element(s) or region, then read selection context.
3. **No relevant selection and the agent knows the exact rendered targets** → call `select()` itself; the elements are visibly highlighted and selection-scoped context is returned in the same operation.

Do not overwrite meaningful human selection before reading it. Do not ask the user to select something the agent can identify exactly itself. Do not guess when the intended target truly is ambiguous.

### Programmatically select and receive context

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

`select()` enables/selects the exact targets, visibly highlights them, waits for the visual state to settle, and returns `MesurerContextV1` with `scope.kind === "selection"`.

Every selector must resolve to exactly one target. Invalid, missing, or ambiguous selectors throw instead of guessing.

This is especially useful after an agent changes UI:

```js
await window.__MESURER__.stable()

const evidence = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

The user can see the affected elements, and the agent gets their exact rendered geometry/styles/relationships back.

## The rendered page is the source of truth

A source file saying `gap: 16px`, `align-items: center`, or `width: 100%` does not prove that the browser rendered the intended result.

Fonts, intrinsic sizing, parent layout, transforms, breakpoints, wrapping, scrollbars, and neighboring components can change actual geometry.

The default design loop is:

```text
consume existing human Mesurer evidence
  → if needed, ask user to select OR self-select exact target(s)
  → context comes back
  → edit implementation
  → real app renders / HMR settles
  → __MESURER__.stable()
  → review(annotationId), fresh selection context, or select(changedTargets)
  → fresh context comes back
  → outer harness captures real screenshot when useful
  → compare rendered measurements + pixels to intent
  → fix discrepancies
  → repeat until evidence supports completion
```

Use Mesurer to validate statements such as “these edges align,” “the gap is 16px,” “all cards are the same width,” “there is no horizontal overflow,” or “this heading is actually using the intended font.”

Use screenshots for composition, hierarchy, clipping, colors, and visual judgment. Use Mesurer geometry for exact numeric claims.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md), [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md), and [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md).

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

### Add context and annotations

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

`mesurer.context` owns annotation state, Copy Context/Copy Selection/Add Note UI, shortcuts, context/select/review/capture behavior, and cleanup.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.context({ scope: "selection" })
const agentSelected = await mesurer.select("#target")
const annotation = await mesurer.context({ annotation: annotationId })
```

After source edits/HMR:

```ts
await mesurer.agent.stable()
const review = await mesurer.review(annotationId)
```

The human does not need to save an annotation just to communicate current visual state. An annotation is useful when a durable note and deterministic baseline/review are needed.

### Add screenshot capture

Screenshot is an opt-in first-party plugin rather than permanent core state:

```ts
import { mountMeasurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMeasurer({
  plugins: [
    screenshotPlugin({
      copy: true,
      download: false,
    }),
  ],
})
```

The camera tool lets the user drag a viewport region. Mesurer captures the real visible page, crops against the actual captured bitmap scale for HiDPI/Retina accuracy, hides its own control chrome from the PNG, then restores the prior inspector presentation.

Configured copy/download outputs are persistent and best-effort: if clipboard or download access fails, the valid PNG is still available. Each capture leaves a persistent draggable thumbnail with native image right-click behavior and a dismiss control. Clicking the thumbnail opens a larger viewer with Copy, Save, and Close actions; Escape or backdrop click closes that viewer without discarding the thumbnail. A short status message reports copy/save/capture results.

Normal browser hosts use `getDisplayMedia()` with live-stream reuse. The first-party Chrome extension uses `chrome.tabs.captureVisibleTab()` through its isolated-world bridge and existing `activeTab` permission, avoiding the screen-share chooser and a broad `<all_urls>` permission for extension captures.

Advanced mounted integrations can resolve the typed `MesurerScreenshotService` under plugin service id `screenshot` for programmatic start/cancel/exact-rect capture and persisted settings.

Screenshot intentionally does not claim the global `C` shortcut because the context workflow already owns `C` and `Shift+C`.

See [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) for the full human-capture and agent-evidence boundary.

## Agent quick start — discover first, inject only if absent

Install the portable skill:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

Use `--package=mesurer-solid@beta` only when intentionally testing a prerelease.

It installs:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches agents to preserve human state, expect context back, ask for selection only when target identity is ambiguous, self-select exact changed targets when possible, require fresh post-edit Mesurer evidence before completion, and distinguish the human screenshot plugin from harness-owned agent screenshot proof.

### Preserve existing human state

```js
const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (hasMesurer) {
  await browser.evaluate(() => window.__MESURER__.ready())
}
```

Do not reinject/dispose a live instance or destroy a human screenshot preview. Destructive replacement is explicit:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

### Inject only when absent

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

To opt a new injected Mesurer instance into the human screenshot plugin, set this **before** first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Do not reinject over an existing instance merely to change that option. Do not add Mesurer to app source, create a Mesurer-specific build, create another browser/CDP stack, or start an agent server merely to inspect a page the harness already controls.

### Consume what the human is showing

```js
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}

const annotations = await window.__MESURER__.annotations()
```

For each relevant annotation, read its context before editing.

`MesurerContextV1` includes page/viewport/DPR, exact target rects, margin/padding/border, typography, appearance, flex/grid/layout, scroll/overflow, guides, measurements, held distances, and selected/annotated regions.

For multi-selection, consume every target and the relevant pair relationships; use `distance(selectorA, selectorB)` for relationships not already represented by selected/held distance evidence.

### Revalidate after editing

```js
await window.__MESURER__.stable()
```

Use annotation review when available:

```js
const review = await window.__MESURER__.review(annotationId)
```

Use still-relevant live selection context when applicable:

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

When the agent knows the exact affected targets, proactively select them and consume the returned context:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

If target identity is ambiguous, ask the human to select it and then read selection context.

For meaningful visual work, fresh Mesurer context/review is part of completion; lint/typecheck/tests/build are not rendered proof.

## Clean screenshot evidence

The optional screenshot plugin is a human capture tool, not an agent-delivery channel. For ordinary coding-agent verification, the outer browser/harness can continue to own real screenshot capture while Mesurer plans the evidence frame:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // capture real viewport and optional focus crop
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides control chrome while preserving rulers, guides, selected outlines, annotations, measurements, distances, and pixel labels.

Use Mesurer geometry/context for exact numeric claims and screenshot pixels for composition/appearance. Only automate the screenshot plugin itself when that feature is what you are testing.

## Low-level agent API

Default global:

```text
window.__MESURER__
```

Useful primitives:

```text
ready / stable
capabilities
context / select / annotations / review
capturePlan / prepareCapture / finishCapture
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state
```

Prefer `context()`, `select()`, and `review()` for normal visual development. Use low-level primitives for focused measurement questions.

## What Mesurer deliberately does not own

Mesurer is not a browser driver or agent orchestration server. It does not own navigation, host-app clicking/typing, tabs/windows, authentication, browser lifetime, source editing, dev servers, chat/thread/task/session routing, or MCP/WebMCP/ACP delivery.

Those stay with Playwright, CDP, Cypress, a coding-agent browser tool, Electron, or whatever outer harness already controls the page. The optional screenshot plugin only owns its explicit human region-capture flow; it does not turn Mesurer into a browser driver or image-delivery service for agents.

## Browser extension

The first-party Manifest V3 extension is a zero-source-change human path for arbitrary Chromium pages:

```bash
bun install
bun run build
```

Load `extension/dist/` as an unpacked extension and click the Mesurer action on an ordinary HTTP(S) page.

The extension enables the screenshot plugin automatically. Its camera tool uses `chrome.tabs.captureVisibleTab()` behind an isolated-world bridge and the existing `activeTab` permission, so region capture does not require `<all_urls>` or the browser screen-share picker. The normal thumbnail/viewer/copy/save behavior remains the same as source-mounted screenshotPlugin usage.

The extension is only a distribution shell plus the narrow capture bridge. An agent does not need an extension-specific protocol; it reads `window.__MESURER__` from the page.

See [`extension/README.md`](./extension/README.md).

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

The screenshot feature is itself a first-party example of this architecture: a substantial capture/UI capability lives behind an optional plugin and public subpath instead of permanent core state.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Public package surface

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/screenshot
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

Browser/package-boundary changes are additionally gated by host compatibility, packed-consumer/package smoke, the screenshot browser contract, and visual/interaction checks where applicable.

## Origin and license

Mesurer Solid is adapted from [ibelick/mesurer](https://github.com/ibelick/mesurer), created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick), and extends that project with the Solid 2 port, framework-agnostic package boundary, plugin/runtime architecture, direct context-first agent workflow, optional screenshot plugin, and additional browser integration work.

MIT. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream and third-party attribution.