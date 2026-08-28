# mesurer-solid

Framework-agnostic UI measurement, annotation, inspection, and agent-ready visual context for browser applications.

The renderer is implemented privately in Solid 2, but consumers can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

Stable releases use the `latest` dist-tag:

```bash
bun add -d mesurer-solid
# or
npm install -D mesurer-solid
```

Use the `beta` tag only when you intentionally want to test a prerelease:

```bash
bun add -d mesurer-solid@beta
# or
npm install -D mesurer-solid@beta
```

Prereleases through `0.1.0-beta.11` used the old scoped package name; current releases use `mesurer-solid`.

## Mount the base inspector

```ts
import { mountMeasurer } from "mesurer-solid"

const mesurer = mountMeasurer()
```

The base inspector contains Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, the plugin host, and the low-level agent inspection API.

## Add shared visual context

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

The human can select one or multiple elements, drag regions, place guides, create measurements/held distances, enable rulers/X-ray, and save annotation notes/baselines.

The coding agent reads that same rendered state directly from the page. There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, or chat/session routing.

The agent contract is **context-first**: Mesurer visual operations should produce structured context the agent actually consumes.

```text
human evidence OR agent-known affected target
  → window.__MESURER__
  → context() / select() / review()
  → structured rendered evidence
  → source edit
  → render settles
  → fresh context/review
```

## Preserve a live human instance

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

If Mesurer already exists, reuse it and read existing human state before changing the selection. Injected Mesurer preserves a live instance by default. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

That option is for explicit test/tooling replacement, not normal agent attachment.

## Inject only when absent

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

Screenshot capture remains opt-in for normal injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

The first-party Chrome extension enables screenshot capture automatically.

## Direct context API

With the context plugin loaded:

```js
window.__MESURER__.capabilities().capabilities
```

exposes:

```text
context
select
annotations
review
capturePlan
```

There is no send/delivery capability or `sendContext()`.

### Read the whole workspace

```js
const workspace = await window.__MESURER__.context()
```

Workspace context includes page/viewport state, rulers/X-ray visibility, targets, guides, measurements, held distances, exact rects, box model, typography, appearance, layout, scroll size, and overflow.

### Read the current human selection

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Selection context answers what the human is pointing at now. Preserve and consume it before programmatically changing selection.

### Select exact rendered targets and get context back

When an agent knows exactly which rendered element it wants to highlight/verify, it can select it itself:

```js
const context = await window.__MESURER__.select("#pricing-card")
```

For several exact targets:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()`:

1. enables Mesurer and switches to Select;
2. visibly highlights those rendered elements;
3. makes them the live selection;
4. waits for the selection to settle;
5. returns selection-scoped `MesurerContextV1`.

The return value is intentional. Agents should consume it rather than treating the highlight as the end of the operation.

Every selector must resolve to exactly one element inside the page target. Invalid, missing, or ambiguous selectors throw. Refine the selector or ask the human to select the intended target rather than guessing.

This gives agents a clean post-edit verification pattern:

```js
await window.__MESURER__.stable()

const evidence = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

The user sees what the agent changed, and the agent receives the exact rendered evidence in the same operation.

## Multi-selection

For every selected target, context contains selector/identity, rect, margin/padding/border, typography, appearance, layout, and scroll/overflow.

Use existing `visualContext.distances` first, then `distance(selectorA, selectorB)` for selected pairs whose relationship is not already represented. Small multi-selections should expose useful pairwise pixel relationships rather than merely saying “3 elements selected.”

## Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

for (const annotation of annotations) {
  const context = await window.__MESURER__.context({ annotation: annotation.id })
}
```

An annotation adds a durable note and immutable baseline. The note is human intent; geometry/computed styles/guides/distances/screenshots are supporting evidence.

## Agent target-acquisition rule

When Mesurer is available, agents should follow this order:

1. existing relevant human selection/annotation → read it first;
2. no relevant selection and intended target is ambiguous → ask the human to select it, then read selection context;
3. no relevant selection and agent knows exact affected rendered targets → call `select()` and consume the returned context.

Do not ask the user to select something the agent can identify exactly itself. Do not guess when the target truly is ambiguous.

## Verify the rendered fix

After source edits and the real page update:

```js
await window.__MESURER__.stable()
```

For a saved annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

For a still-relevant human selection:

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

When the agent knows the affected rendered targets:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

For meaningful visual work, fresh Mesurer context/review is part of completion. Lint, typecheck, tests, and build are implementation checks, not rendered proof.

## Optional screenshot plugin

Screenshot capture is a removable first-party plugin instead of permanent core state:

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

The camera tool lets the user drag a viewport region. Mesurer captures the real visible page, converts CSS viewport coordinates to the captured bitmap scale so Retina/HiDPI crops remain exact, temporarily hides its control chrome from the pixels, then restores the previous inspector presentation.

A successful capture can automatically copy PNG data to the clipboard and/or download a PNG according to persistent plugin settings. Those output operations are best-effort: if clipboard or download access is unavailable, the captured PNG is still kept for preview/viewer use and Mesurer reports the available result instead of discarding it.

After capture, Mesurer shows a persistent draggable thumbnail. A new thumbnail starts in the bottom-right with an 8px viewport inset. Dragging preserves the existing viewport-clamping behavior, so the preview stays inside that safe boundary. The thumbnail can be dismissed, dragged around the viewport, right-clicked with the browser's native image context menu, or clicked to open a larger viewer. The viewer preserves native image right-click behavior and adds explicit Copy, Save, and Close controls. Escape or backdrop click closes the viewer without discarding the thumbnail. A short status message confirms whether the screenshot was copied, saved, captured, or could not complete an optional output.

Normal browser hosts use `getDisplayMedia()` and reuse a live capture stream to avoid prompting for every region. The first-party Chrome extension uses `chrome.tabs.captureVisibleTab()` through its isolated-world extension bridge, so its screenshot path does not open the screen-share chooser and does not require a broad `<all_urls>` permission.

Programmatic mounted users can get the typed `MesurerScreenshotService` from the plugin host with service id `screenshot`. `start()` opens region selection, `cancel()` closes it, `capture(rect)` captures an exact CSS-pixel viewport rectangle, `settings()` reads copy/download preferences, and `setSettings()` updates those persistent preferences.

Screenshot does not claim the global `C` shortcut because the context workflow already uses `C` and `Shift+C`.

## Clean screenshot evidence for agents

The optional screenshot plugin is a human capture tool, not an agent-delivery channel. Agent verification can continue to let the existing browser harness own deterministic task screenshots while Mesurer plans a clean evidence frame:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // Capture the real viewport and optional focus crop through the harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use screenshots for visual composition and Mesurer context for exact numeric claims. A screenshot plugin image does not create a `screenshots` delivery capability on `window.__MESURER__` and does not replace context/select/review evidence.

## Context UI

With default `contextPlugin()` UI:

| Action | Shortcut | What it does |
| --- | --- | --- |
| Copy Context | `C` | Copies current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to selected element(s) or region. |
| Add Note | `N` | Creates a durable annotation baseline. |

Those remain the three human context controls. `select()` is a programmatic agent/harness API, not another toolbar action.

## Portable Agent Skill

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

The installer leaves:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches the context-first workflow, including when to consume human selection, when to ask for a selection, when to self-select changed targets, multi-selection reads, fresh post-edit verification, and the distinction between the optional human screenshot plugin and harness-owned agent screenshot evidence. See [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Low-level agent API

Regardless of the context plugin:

```text
ready / stable
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state
```

Use low-level APIs for narrow measurement questions. Prefer `context()`, `select()`, and `review()` for normal visual work.

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
mesurer-solid/screenshot
mesurer-solid/inject
mesurer-solid/inject-script
```

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.