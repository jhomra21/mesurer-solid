# mesurer-solid

Framework-agnostic UI measurement, visual inspection, layout intent, and agent-ready rendered context for browser applications.

Mesurer's private renderer uses Solid 2. Consumer applications can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

Stable releases use the `latest` dist-tag:

```bash
bun add -d mesurer-solid
# or
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

Prereleases through `0.1.0-beta.11` used the old scoped package name. Current releases use `mesurer-solid`.

## Where Mesurer code goes

Mesurer runs in the browser. Mount it once from a client/browser entry for the page you want to inspect.

**There is no required `dev/` directory or `mesurer.ts` filename.** The simplest setup is to put the Mesurer mount directly in the browser entry file your app already has. Extracting it to `src/dev/mesurer.ts` is only an optional organization pattern.

Typical browser entry locations:

| Application | Typical location |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/index.tsx`, `src/main.tsx`, or the project browser entry |
| Vue + Vite | `src/main.ts` |
| Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | renderer entry such as `src/renderer.ts` or `src/renderer/main.tsx` |
| SSR / metaframework | client-only module or lifecycle that never executes during SSR |

### Simplest: mount it directly in the existing entry

For example, in a React + Vite app, `src/main.tsx` can contain Mesurer alongside the app's existing startup code:

```tsx
import { createRoot } from "react-dom/client"
import { mountMesurer } from "mesurer-solid"
import { App } from "./App"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

createRoot(document.getElementById("root")!).render(<App />)
```

In Solid + Vite, the same idea can live directly in `src/main.tsx` or `src/index.tsx`:

```tsx
import { render } from "solid-js/web"
import { mountMesurer } from "mesurer-solid"
import App from "./App"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

render(() => <App />, document.getElementById("root")!)
```

For Vue, Svelte, or vanilla Vite, put the same Mesurer block in the existing `src/main.ts` or `src/main.js`, next to the code that starts the browser app:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

// Keep the app's existing browser startup code here as usual.
```

For Electron, use the renderer entry—not the Electron main process:

```ts
// src/renderer.ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

// Existing renderer startup follows.
```

In an SSR/metaframework app, call `mountMesurer()` only from a client-only module or client lifecycle. Do not put it at module scope in code that also executes during SSR.

`import.meta.env.DEV` and `import.meta.hot` are Vite-specific. With another bundler, use its development flag and HMR lifecycle.

### Optional: extract Mesurer into its own development module

If you prefer to keep inspector setup separate from app startup, this is also valid:

```text
src/
├── main.tsx
└── dev/
    └── mesurer.ts
```

Create `src/dev/mesurer.ts`:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()

if (import.meta.hot) {
  import.meta.hot.dispose(() => mesurer.dispose())
}
```

Then load that helper from the same existing browser entry:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

Both patterns mount Mesurer in the same place conceptually: **the browser entry for the page or renderer you want to inspect**. The helper module only moves Mesurer-specific code out of that entry file.

Do not put `mountMesurer()` in build configuration, API/server routes, Node-only scripts, an Electron main process, or a shared SSR module that also runs on the server.

Put plugin setup in the same place you mount Mesurer—either directly in the browser entry or in the optional extracted Mesurer module.

## Base inspector

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

The base inspector includes Select, X-ray, Rulers, Text Inspector, Guides, Distance, Settings, the plugin host, and the low-level inspection API. Color Picker is also available when the host exposes an operational native `EyeDropper`; it is intentionally hidden in unsupported hosts and has no DOM/CSS fallback.

Text Inspector can inspect rendered typography and supports reversible Desired-text preview editing on double-click.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `M` | Toggle Mesurer visibility |
| `S` | Select |
| `X` | X-ray |
| `P` | Native Color Picker when supported |
| `R` | Rulers |
| `A` | Text Inspector |
| `G` | Guides |
| `H` / `V` | Choose horizontal / vertical guide orientation |
| `Alt` / `Option` | Distance overlay |
| `Cmd/Ctrl + ,` | Settings |
| `Shift + A` | Arrange when `arrangePlugin()` is mounted |
| `Shift + S` | Screenshot when `screenshotPlugin()` is mounted |
| `C` | Copy Context when `contextPlugin()` is mounted |
| `Shift + C` | Copy Selection when `contextPlugin()` is mounted |
| `N` | Add Note when `contextPlugin()` is mounted |

In the current Codex browser host, Color Picker is not advertised and `P` is inert because native screen sampling is not operational there.

## Arrange

Arrange is an optional first-party plugin for showing how selected rendered elements should be positioned without pretending to edit application source.

```ts
import { mountMesurer } from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  plugins: [arrangePlugin()],
})
```

Select one or more page elements, click **Arrange** or press **Shift+A**, and drag the selection. Arrange activates Select automatically and stays coordinated with selection state. Hold **Shift** while dragging to lock movement to the dominant axis.

Each completed drag records one persisted, undoable intent containing:

- target selector and fingerprint;
- Before geometry;
- Desired geometry;
- previous and Desired visual offsets;
- page scope;
- creation time.

Arrange only changes the temporary browser presentation. It does not write CSS, component source, templates, or application state.

### Arrange with a coding agent

For the full agent workflow, mount context and Arrange together:

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

The agent capability surface then includes `arrange: true` and can read saved intents:

```js
const intents = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(intents.at(-1).id)
```

Arrange distinguishes three states:

```text
Before  → original presentation before the Arrange action
Desired → human-arranged visual result
Live    → real application result with Arrange preview removed
```

The agent can reconstruct Before and Desired before editing source:

```js
await window.__MESURER__.showArrange(intent.id, "before")
const beforePlan = await window.__MESURER__.arrangeCapturePlan(intent.id, "before")

await window.__MESURER__.showArrange(intent.id, "desired")
const desiredPlan = await window.__MESURER__.arrangeCapturePlan(intent.id, "desired")
```

The outer browser harness owns screenshot bytes. Mesurer supplies the exact state and capture geometry, so the person does not need to export or attach Before/Desired screenshots manually.

After source edits:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(intent.id, "live")
const review = await window.__MESURER__.reviewArrange(intent.id)
```

`reviewArrange()` reports exact Live-vs-Desired rectangle deltas and conservative target status.

A drag is a visual specification, not a CSS prescription. If a person moves something `96px` right, the coding agent should determine the appropriate flex/grid/gap/margin/component change rather than blindly writing a `translateX(96px)` production transform.

See the repository's [`docs/ARRANGE.md`](https://github.com/jhomra21/mesurer-solid/blob/main/docs/ARRANGE.md) for the full workflow.

## Shared visual context

Context and annotations are provided by the optional `mesurer.context` plugin:

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"

const mesurer = mountMesurer({
  agent: true,
  plugins: [contextPlugin()],
})
```

Read the workspace or current human selection:

```js
const workspace = await window.__MESURER__.context()
const selection = await window.__MESURER__.context({ scope: "selection" })
```

Select exact rendered targets and get their context back:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one page target. Invalid, missing, or ambiguous selectors throw instead of guessing.

`MesurerContextV1` includes rendered geometry, box model, typography, appearance, flex/grid layout, transforms, scroll/overflow, guides, measurements, distances, selected targets, and annotated regions.

## Annotations and review

Mesurer Solid context annotations are semantic, target-bound review records. A note stays attached to the rendered element or region the person selected and keeps an immutable baseline together with the structured context around that target.

```js
const annotations = await window.__MESURER__.annotations()
const context = await window.__MESURER__.context({
  annotation: annotations[0].id,
})
```

After a source change:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

Review reports concrete pixel changes and missing evidence rather than relying on source assumptions. Because the annotation already carries target identity, geometry, measurements, distances, guides, styles, and layout context, a coding agent can read what was highlighted directly instead of inferring intent from a drawn arrow or screenshot markup.

Upstream Mesurer `0.1.1` added a separate drawing workflow with arrows, freehand pen strokes, text drawings, transforms, and grouped annotation tools. Mesurer Solid intentionally does not adopt that drawing surface for the current product. Its annotation workflow is designed around structured context that an agent can consume and review against the same rendered target. Screenshots remain a separate optional tool for cases where real pixel evidence is useful.

The current upstream audit and intentional differences are documented in [`docs/UPSTREAM_PARITY.md`](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md).

## Agent integration

The coding-agent contract is context-first and preserves existing human state:

```text
human Arrange / annotation / selection
  → window.__MESURER__
  → structured rendered evidence
  → source edit
  → real render / HMR
  → fresh Live review/context
```

There is no Mesurer MCP, WebMCP, ACP, localhost feedback daemon, Send-to-agent callback, or chat/session routing.

Before injecting anything, reuse a live Mesurer instance if one is already present:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

A live human instance may already contain the information the agent needs. Do not overwrite selection, Arrange history, guides, measurements, annotations, or screenshot preview state before reading it.

Install the portable Agent Skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

For detailed agent rules, use [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Optional screenshot plugin

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  plugins: [
    screenshotPlugin({
      copy: true,
      download: false,
    }),
  ],
})
```

The human camera tool supports **Shift+S**, drag-region visible-tab capture, HiDPI/Retina-aware PNG cropping, copy/download settings, a draggable thumbnail, and a larger Copy/Save viewer.

For coding-agent verification, the outer browser harness should normally own screenshot bytes. Mesurer supplies exact capture scope and can temporarily remove inspector presentation:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // use the harness screenshot primitive
} finally {
  await window.__MESURER__.finishCapture()
}
```

## Public entry points

```ts
import {
  contextPlugin,
  defineMesurerPlugin,
  mountMesurer,
} from "mesurer-solid"

import { arrangePlugin } from "mesurer-solid/arrange"
import { createMesurerPluginHost } from "mesurer-solid/core"
import { screenshotPlugin } from "mesurer-solid/screenshot"
```

The transport-neutral classic browser payload is:

```text
mesurer-solid/inject-script
```

## Supported hosts

Mesurer's renderer is bundled and isolated from the host framework. Supported host classes include:

- Solid 1
- Solid 2
- React
- Vue
- Svelte
- vanilla DOM applications
- Electron renderer pages

## More documentation

- [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md)
- [Arrange](https://github.com/jhomra21/mesurer-solid/blob/main/docs/ARRANGE.md)
- [Context workflow](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CONTEXT_WORKFLOW.md)
- [Screenshots](https://github.com/jhomra21/mesurer-solid/blob/main/docs/SCREENSHOTS.md)
- [Host isolation](https://github.com/jhomra21/mesurer-solid/blob/main/docs/HOST_ISOLATION.md)
- [Upstream audit and intentional differences](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md)
- [Agent integration](./AGENT_INTEGRATION.md)

## License

MIT