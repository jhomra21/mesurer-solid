# Mesurer Solid

[![npm](https://img.shields.io/npm/v/mesurer-solid.svg)](https://www.npmjs.com/package/mesurer-solid)
[![CI](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml/badge.svg)](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

A Solid 2 port and extension of [Mesurer](https://github.com/ibelick/mesurer) by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer Solid is a visual inspection and measurement tool for browser apps. Use it to select elements, inspect spacing and layout, measure distances, add guides, inspect text and colors, arrange a desired layout, capture screenshots, and expose rendered UI state through a programmatic API.

<p align="center">
  <img src="docs/assets/readme/hero-multi-spacing.png" alt="Mesurer Solid measuring spacing between four selected elements" width="100%">
</p>

<sub>Mesurer Solid measuring the rendered 24px and 32px gaps in a four-element selection.</sub>

## Install

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

## Quick start

Mesurer runs in the browser. Mount it once from the client/browser entry for the page you want to inspect, not from server code or build configuration.

For local development in a Vite app, the recommended setup is a small development-only module:

```text
src/
├── main.tsx          # your existing browser entry; the filename may differ
└── dev/
    └── mesurer.ts    # Mesurer setup lives here
```

Create `src/dev/mesurer.ts`:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()

import.meta.hot?.dispose(() => {
  mesurer.dispose()
})
```

Then load it from your existing browser entry, such as `src/main.tsx`, `src/main.ts`, or `src/index.tsx`:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

Keep your normal app startup code in that entry file as usual. `import.meta.env.DEV` is Vite-specific; with another bundler, use its build-time development flag instead.

If you intentionally want Mesurer in every build of a browser bundle, the direct form can live in that same browser entry:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

Common locations are `src/main.tsx` for React/Vite, `src/index.tsx` or `src/main.tsx` for Solid, `src/main.ts` for Vue/Svelte/vanilla Vite apps, and the renderer entry for Electron. In SSR/metaframework apps, mount Mesurer only from a client-only module or lifecycle that never runs during server rendering.

Do not put `mountMesurer()` in `vite.config.ts`, API/server routes, Node-only scripts, an Electron main process, or a shared SSR module that also executes on the server.

Add plugins in the same Mesurer setup module. See [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) for detailed file placement, Vite/HMR setup, client-only/SSR guidance, Electron placement, and plugin examples.

Mesurer carries its own isolated Solid 2 renderer, so the host app does not need Solid.

## What you can do

| Feature | What it does |
| --- | --- |
| Select | Inspect one or multiple rendered elements |
| Distance | Measure exact spacing and geometry between elements |
| Guides & rulers | Add visual alignment and position references |
| X-ray | Inspect page structure visually |
| Color Picker | Use the browser's native screen sampler when `EyeDropper` is operational; the tool is hidden in unsupported hosts |
| Text Inspector | Inspect rendered typography and double-click Desired text to make a reversible preview edit |
| Settings | Configure tools and persisted behavior |
| Arrange | Move selected elements into a desired visual layout without editing application source |
| Screenshots | Capture a dragged viewport region with the optional screenshot plugin |
| Context & annotations | Read selections, measurements, guides, notes, geometry, styles, and relationships programmatically |
| Plugins | Add or replace tools, commands, overlays, settings, state, and services at runtime |

### Keyboard shortcuts

The default renderer and first-party plugins expose shortcuts only while their corresponding tools are available:

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

Color Picker intentionally has no DOM/CSS sampling fallback. In hosts where native screen sampling cannot operate—including the current Codex browser bridge—the Color Picker control is not advertised and `P` is inert.

## Arrange a desired layout

Arrange is an optional first-party plugin for showing how selected UI should be positioned without pretending to edit the application source:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  agent: true,
  plugins: [arrangePlugin()],
})
```

Select one or more elements, click **Arrange** or press **Shift+A**, and drag the selection. Arrange activates Select automatically and stays coordinated with selection state. Hold **Shift** while dragging to lock movement to the dominant axis.

Each completed drag records Before and Desired geometry, persists through the plugin state channel, and participates in Mesurer undo/redo. Coding agents can reconstruct Before/Desired, capture both through their existing browser harness, switch to Live after editing source, and use exact geometry to verify whether the real implementation matches the human-arranged result.

Arrange is a visual specification: an agent should implement the appropriate flex/grid/spacing/component change rather than blindly copying the preview offset into a production transform.

See [`docs/ARRANGE.md`](./docs/ARRANGE.md) for the human workflow, agent API, Before/Desired/Live states, persistence, screenshots, and review loop.

## Screenshot capture

Add screenshot capture in the same Mesurer mounting module used in the quick start:

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

The camera tool supports **Shift+S**, drag-region visible-tab capture, HiDPI/Retina-aware PNG cropping, copy/download settings, a draggable thumbnail, and a larger Copy/Save viewer.

See [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) for screenshot options and browser/extension behavior.

## Programmatic selection and context

Add the context plugin in that same Mesurer mounting module when you want rendered UI state available through the API:

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

Read the current workspace or selection:

```ts
const workspace = await mesurer.context()
const selected = await mesurer.context({ scope: "selection" })
```

Select exact rendered targets from code and get their context back:

```ts
const selected = await mesurer.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one rendered element. Missing or ambiguous selectors reject instead of guessing.

After the page changes, wait for the UI to settle and inspect it again:

```ts
await mesurer.agent.stable()
const selected = await mesurer.context({ scope: "selection" })
```

`MesurerContextV1` includes rendered geometry, computed styles, typography, layout, overflow, guides, measurements, distances, selected targets, and annotated regions.

## Annotations and review

Mesurer Solid context annotations attach a note to rendered UI and keep a baseline that can be reviewed again after changes:

```ts
const annotation = await mesurer.context({ annotation: annotationId })
const review = await mesurer.review(annotationId)
```

This is useful when a visual change needs to be checked against the same target or region after an edit. These context/review annotations are distinct from the arrow, pen, and text drawing tools introduced by upstream Mesurer `0.1.1`; current upstream-parity status is tracked in [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md).

## Agent integration

For coding-agent setup, injection, state-preservation rules, Arrange handling, and the full visual verification workflow, use the dedicated agent docs instead of the README:

- [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md)
- [`.agents/skills/mesurer-ui/SKILL.md`](./.agents/skills/mesurer-ui/SKILL.md)

Install the portable skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

## Supported hosts

The renderer is bundled and isolated from the host framework. Mesurer Solid can run over:

- Solid 1
- Solid 2
- React
- Vue
- Svelte
- vanilla DOM apps
- Electron renderer pages

## Runs over real applications

<table>
  <tr>
    <td><img src="docs/assets/showcase/youtube.png" alt="Mesurer Solid inspecting YouTube" width="100%"></td>
    <td><img src="docs/assets/showcase/github.png" alt="Mesurer Solid inspecting GitHub" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>YouTube</sub></td>
    <td align="center"><sub>GitHub</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/showcase/google-maps.png" alt="Mesurer Solid inspecting Google Maps" width="100%"></td>
    <td><img src="docs/assets/showcase/electron-solid.jpg" alt="Mesurer Solid running over a packaged Electron application with a Solid 1 renderer" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>Google Maps</sub></td>
    <td align="center"><sub>Electron + Solid 1</sub></td>
  </tr>
</table>

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

The classic injectable browser bundle is available at:

```text
mesurer-solid/inject-script
```

## Docs

- [`docs/GETTING_STARTED.md`](./docs/GETTING_STARTED.md) — where to mount Mesurer and development/client setup
- [`docs/ARRANGE.md`](./docs/ARRANGE.md) — Arrange visual layout intent and agent review
- [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) — screenshot plugin
- [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) — context, selection, annotations, and review
- [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md) — host isolation and browser compatibility
- [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md) — upstream Mesurer parity and stable-release blockers
- [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md) — agent-specific setup and API usage

## Origin and attribution

Mesurer Solid started as a Solid port of [ibelick/mesurer](https://github.com/ibelick/mesurer) and preserves the original tool's visual language and interaction model where practical.

The current upstream audit is pinned in [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md). Do not assume that a newer upstream feature is present here unless that audit marks it implemented.

Original Mesurer copyright and attribution are documented in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## License

MIT