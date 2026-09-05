# Mesurer Solid

[![npm](https://img.shields.io/npm/v/mesurer-solid.svg)](https://www.npmjs.com/package/mesurer-solid)
[![CI](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml/badge.svg)](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

Inspect, measure, and express visual intent directly on a live browser UI.

Mesurer Solid is a Solid 2 port and extension of [Mesurer](https://github.com/ibelick/mesurer) by [Julien Thibeaut](https://github.com/ibelick). It keeps Mesurer's source-first visual language while adding framework-agnostic mounting, plugins, agent-readable context, reversible layout and text intent, screenshot capture, and host isolation.

The renderer carries its own isolated Solid 2 runtime. Your application can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without installing Solid for Mesurer.

<p align="center">
  <img src="docs/assets/readme/hero-multi-spacing.png" alt="Mesurer Solid measuring spacing between selected elements" width="100%">
</p>

## Installation

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

## Usage

Mount Mesurer once from the browser entry for the page you want to inspect:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

For Vite, that usually means `src/main.tsx`, `src/main.ts`, or the equivalent browser entry. In Electron, use the renderer entry. In SSR applications, mount from a client-only boundary. Do not mount Mesurer from server code, build configuration, or an Electron main process.

See [Getting started](./docs/GETTING_STARTED.md) for framework-specific placement and HMR guidance.

### Add first-party plugins

Keep plugin setup next to `mountMesurer()`:

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    contextPlugin(),
    arrangePlugin(),
    screenshotPlugin(),
  ],
})
```

## Features

- **Select** — inspect one or more rendered elements.
- **Distance** — measure spacing and geometry, including pairwise multi-selection spacing.
- **X-ray, guides, and rulers** — inspect page structure and alignment.
- **Typography** — inspect rendered type and directly preview reversible copy and typography changes.
- **Arrange** — drag selected UI into a Desired layout without writing application source.
- **Screenshots** — capture a dragged visible-tab region with the optional screenshot plugin.
- **Context and annotations** — expose selection, geometry, styles, measurements, guides, notes, and human intent to code or coding agents.
- **Plugins** — add tools, commands, overlays, settings, state, hooks, and services at runtime.
- **Compact toolbar** — collapse inactive controls while every active tool remains visible; expanding restores the same stable toolbar and order.
- **Color Picker** — use the browser's native `EyeDropper` when it is operational. Unsupported hosts do not advertise the tool.

Mesurer Solid uses one stable toolbar. Arrange is a normal optional tool, not a toolbar mode. Clicking Arrange automatically enables Select; turning Arrange off leaves Select active, while turning Select off also exits Arrange.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `M` | Toggle Mesurer |
| `S` | Select |
| `X` | X-ray |
| `P` | Native Color Picker when supported |
| `R` | Rulers |
| `A` | Typography |
| `G` | Guides |
| `H` / `V` | Horizontal / vertical guide orientation |
| `Alt` / `Option` | Distance overlay |
| `Cmd/Ctrl + ,` | Settings |
| `Shift + A` | Arrange |
| `Shift + S` | Screenshot |
| `C` | Copy Context |
| `Shift + C` | Copy Selection |
| `N` | Add Note |

Plugin shortcuts appear only when the corresponding plugin is mounted and enabled.

## Direct text editing

With Select or Typography active, double-click ordinary direct text to edit it on the rendered page. Mesurer previews the text and typography as reversible Desired intent; it does not write source code.

Native editing stays native. Mesurer does not intercept form controls or descendants that inherit `contenteditable`. A nested `contenteditable="false"` boundary ends that inherited editable region, so an otherwise valid direct-text target inside it can use Mesurer editing.

Undo and redo update the rendered Desired preview while Mesurer still owns the current text/style value. If the application changes that value itself, Mesurer relinquishes ownership instead of overwriting the host change.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange records Before and Desired geometry while previewing the requested layout through temporary browser presentation. It activates Select automatically, supports snapping and multi-selection, persists intent, and exposes Before/Desired/Live review APIs for agents.

Arrange restores a previous inline transform only while the element still carries the exact preview value and priority Mesurer applied. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Arrange](./docs/ARRANGE.md).

## Agent integration

Enable the agent bridge when a coding agent should read the same rendered state and human intent:

```ts
const mesurer = mountMesurer({
  agent: true,
  plugins: [contextPlugin(), arrangePlugin()],
})
```

Read context or select exact rendered targets:

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select(["#pricing-card", "#pricing-cta"])
```

The portable Mesurer skill teaches compatible agents to preserve existing human state, consume Arrange/text/annotation intent before editing source, and verify the real Live result afterward:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

See [Agent integration](./packages/mesurer/AGENT_INTEGRATION.md) and the packaged [`mesurer-ui` skill](./.agents/skills/mesurer-ui/SKILL.md).

## Documentation

Start with the [documentation index](./docs/README.md).

- [Getting started](./docs/GETTING_STARTED.md)
- [Direct text editing and Typography](./docs/TEXT_EDITING.md)
- [Arrange](./docs/ARRANGE.md)
- [Screenshots](./docs/SCREENSHOTS.md)
- [Context workflow](./docs/CONTEXT_WORKFLOW.md)
- [Browser harness](./docs/BROWSER_HARNESS.md)
- [Host isolation](./docs/HOST_ISOLATION.md)
- [Trusted Types](./docs/TRUSTED_TYPES.md)
- [Upstream parity](./docs/UPSTREAM_PARITY.md)
- [Architecture](./ARCHITECTURE.md)

## Upstream

Mesurer Solid tracks upstream Mesurer source rather than recreating its UI from memory. The current upstream audit is pinned to `ibelick/mesurer@91ca55768f1f9e7d6afe72e046a582e424967b91`; adopted behavior and deliberate product differences are recorded in [Upstream parity](./docs/UPSTREAM_PARITY.md).

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).
