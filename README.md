# Mesurer Solid

[![npm](https://img.shields.io/npm/v/mesurer-solid.svg)](https://www.npmjs.com/package/mesurer-solid)
[![CI](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml/badge.svg)](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

A Solid 2 port and extension of [Mesurer](https://github.com/ibelick/mesurer) by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer Solid is a visual inspection and measurement tool for browser apps. Use it to select elements, inspect spacing and layout, measure distances, add guides, inspect text and colors, capture screenshots, and expose rendered UI state through a programmatic API.

<p align="center">
  <img src="docs/assets/showcase/mesurer-solid-0.1.1.svg" alt="Mesurer Solid 0.1.1 showing multi-selection, exact spacing, live context, context tools, and the screenshot plugin" width="100%">
</p>

<sub>Captured from the published `mesurer-solid@0.1.1` package.</sub>

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

```ts
import { mountMeasurer } from "mesurer-solid"

const mesurer = mountMeasurer()
```

For local development only:

```ts
if (import.meta.env.DEV) {
  import("mesurer-solid").then(({ mountMeasurer }) => {
    const mesurer = mountMeasurer()
    import.meta.hot?.dispose(() => mesurer.dispose())
  })
}
```

Mesurer carries its own isolated Solid 2 renderer, so the host app does not need Solid.

## What you can do

| Feature | What it does |
| --- | --- |
| Select | Inspect one or multiple rendered elements |
| Distance | Measure exact spacing and geometry between elements |
| Guides & rulers | Add visual alignment and position references |
| X-ray | Inspect page structure visually |
| Color Picker | Read colors directly from the rendered page |
| Text Inspector | Inspect rendered typography |
| Settings | Configure tools and persisted behavior |
| Screenshots | Capture a dragged viewport region with the optional screenshot plugin |
| Context & annotations | Read selections, measurements, guides, notes, geometry, styles, and relationships programmatically |
| Plugins | Add or replace tools, commands, overlays, settings, state, and services at runtime |

## Screenshot capture

Screenshot capture is an optional first-party plugin:

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

The camera tool supports drag-region visible-tab capture, HiDPI/Retina-aware PNG cropping, copy/download settings, a draggable thumbnail, and a larger Copy/Save viewer.

See [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) for screenshot options and browser/extension behavior.

## Programmatic selection and context

Add the context plugin when you want rendered UI state available through the API:

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

Annotations let you attach a note to rendered UI and keep a baseline that can be reviewed again after changes:

```ts
const annotation = await mesurer.context({ annotation: annotationId })
const review = await mesurer.review(annotationId)
```

This is useful when a visual change needs to be checked against the same target or region after an edit.

## Agent integration

For coding-agent setup, injection, state-preservation rules, and the full visual verification workflow, use the dedicated agent docs instead of the README:

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
  mountMeasurer,
} from "mesurer-solid"

import { createMesurerPluginHost } from "mesurer-solid/core"
import { screenshotPlugin } from "mesurer-solid/screenshot"
```

The classic injectable browser bundle is available at:

```text
mesurer-solid/inject-script
```

## Docs

- [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md) — screenshot plugin
- [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) — context, selection, annotations, and review
- [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md) — host isolation and browser compatibility
- [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md) — upstream Mesurer parity
- [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md) — agent-specific setup and API usage

## Origin and attribution

Mesurer Solid started as a Solid port of [ibelick/mesurer](https://github.com/ibelick/mesurer) and preserves the original tool's visual language and interaction model where practical.

Original Mesurer copyright and attribution are documented in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## License

MIT
