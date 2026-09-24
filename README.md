# Mesurer Solid

[![npm](https://img.shields.io/npm/v/mesurer-solid.svg)](https://www.npmjs.com/package/mesurer-solid)
[![CI](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml/badge.svg)](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

Inspect, measure, and express visual intent directly on a live browser UI.

Mesurer Solid ports [Mesurer](https://github.com/ibelick/mesurer) by [Julien Thibeaut](https://github.com/ibelick) to a private Solid 2 renderer. It adds framework-independent mounting, plugins, agent-readable Context, reversible layout and text intent, screenshot capture, and host isolation.

The renderer carries its own isolated Solid 2 runtime. Your application can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without installing Solid for Mesurer.

<p align="center">
  <img src="https://raw.githubusercontent.com/jhomra21/mesurer-solid/main/docs/assets/readme/hero-multi-spacing.png" alt="Mesurer Solid measuring spacing between selected elements" width="100%">
</p>

## Installation

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```


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

For Vite, that usually means `src/main.tsx`, `src/main.ts`, or the equivalent browser entry. In Electron, use the renderer entry. If preload exposes `window.__MESURER_HOST__.captureScreenshot`, the Screenshot plugin uses native window capture automatically and renderer configuration stays `screenshot()`. In SSR applications, mount from a client-only boundary. Do not mount Mesurer from server code, build configuration, or an Electron main process.

See [Getting started](./docs/GETTING_STARTED.md) for framework-specific placement and HMR guidance. The [Electron renderer example](./examples/electron-renderer/README.md) documents native Screenshot capture through preload and `webContents.capturePage()`.

### Add first-party plugins

All first-party plugin factories live at `mesurer-solid/plugins` and use the plugin name directly:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrange, context, layoutGuides, screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    arrange(),
    layoutGuides(),
    screenshot(),
  ],
})
```

The same entry also exposes `select`, `xray`, `colorPicker`, `rulers`, `typography`, `guides`, `distance`, `settings`, `defaults`, and `compose` for applications that want to build a custom plugin set explicitly. Optional plugin capabilities can be resolved from the mount with `await mesurer.service<T>(serviceId)` instead of reaching through the raw plugin host.

## Features

- **Select.** Inspect one or more rendered HTML or SVG elements.
- **Distance.** Measure spacing and geometry, including pairwise multi-selection spacing.
- **X-ray, Guides, and Rulers.** Inspect page structure and alignment.
- **Layout Guides.** Add page-scoped columns, rows, or a pixel grid through the optional `layoutGuides()` plugin. Layout Guide mutations participate in plugin history and visible guides are included in Context.
- **Typography.** Inspect rendered type and preview reversible copy and typography changes.
- **Arrange.** Drag selected UI into a Desired layout without writing application source.
- **Screenshots.** Capture a dragged page region with the optional Screenshot plugin. It selects application-native capture, the Chromium extension adapter, or browser display capture internally.
- **Context and annotations.** Expose selection, geometry, styles, measurements, guides, notes, and human intent to code or coding agents. Saved annotations persist across same-tab reloads, conservatively rebind to their original DOM targets, stay attached through scrolling, keep repeated-note markers local, leave Add Note available while a saved note is open, and keep cards/composers above Select hover and selection chrome.
- **Plugins.** Add tools, commands, overlays, settings, state, hooks, and services at runtime.
- **Compact toolbar.** Collapse inactive controls while every active tool remains visible. Expanding restores the same toolbar order and state.
- **Appearance.** Use System, Light, or Dark without changing the inspected page. The same theme applies to the isolated toolbar and document-backed Context and Typography UI.
- **Color Picker.** Use the browser's native `EyeDropper` when it is operational. Unsupported hosts do not advertise the tool.

Mesurer Solid uses one stable toolbar. Arrange is a normal optional tool, not a toolbar mode. Clicking Arrange automatically enables Select; turning Arrange off leaves Select active, while turning Select off also exits Arrange.

Toolbar dragging starts only after the pointer crosses the drag threshold. A drag from Settings, Guide, or plugin triggers closes the open menu or panel. Pointer activity inside menus, dialogs, form controls, editable regions, and sliders stays with those controls.

Select, point inspection, Context, and annotations accept rendered HTML and SVG elements. Arrange and direct text editing only mutate HTML elements.

Page-owned workspace evidence is scoped by the current route, including sorted query parameters. Navigating within one tab swaps the relevant page workspace instead of carrying guides and selections to another route. The toolbar keeps its tab-session position across those route changes and reloads.

## Appearance

Mesurer follows the system color scheme by default. Choose **System**, **Light**, or **Dark** under **Settings > General > Appearance**, or set the initial mode when mounting:

```ts
mountMesurer({ theme: "dark" })
```

The selected mode is stored with the other Mesurer settings. System mode responds to `prefers-color-scheme` without changing the stored value. Mesurer applies the active theme to its isolated renderer and to document-backed Context, Typography, direct-edit, and selection UI.

## Shortcuts

Global shortcuts are enabled by default. Turn them off from **Settings > General > Shortcuts** or mount with `shortcutsEnabled: false`. Disabling global shortcuts does not disable toolbar controls, editor-local keyboard behavior, or Escape/cancel handling.

| Shortcut | Action |
| --- | --- |
| `M` | Toggle Mesurer |
| `S` | Select |
| `X` | X-ray |
| `P` | Native Color Picker when supported |
| `R` | Rulers |
| `A` | Typography |
| `G` | Guides |
| `L` | Layout Guides when the plugin is enabled |
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

Direct edit owns the visible selection UI for the field. One edit ring remains visible. When the Typography card is below the target, the dimensions pill keeps a 2px gap on each side. Pointer movement does not reposition the card. The selection-adjacent Add Note button is hidden only while editing and returns when the editor closes. Saved annotations remain available.

Native editing stays native. Mesurer does not intercept form controls or descendants that inherit `contenteditable`. A nested `contenteditable="false"` boundary ends that inherited editable region, so an otherwise valid direct-text target inside it can use Mesurer editing.

Mixed inline copy is targeted one direct text run at a time. Text before or after inline children such as `<kbd>Shift+A</kbd>` can be edited without flattening, recreating, or replacing those children, and Mesurer leaves the host element's native DOM APIs intact.

Undo and redo update the Desired preview while the DOM still contains the value Mesurer applied. If the application changes the value, Mesurer stops managing it and preserves the application change.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange records Before and Desired geometry while previewing the requested layout through temporary browser presentation. It activates Select automatically, supports snapping and multi-selection, persists intent, and exposes Before/Desired/Live review APIs for agents.

Arrange restores a previous inline transform only while the element still carries the exact preview value and priority Mesurer applied. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Arrange](./docs/ARRANGE.md).

## Agent integration

Enable the agent bridge when a coding agent should read the same rendered state and human intent:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrange, context } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [context(), arrange()],
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

### Queue human feedback to Codex

Mount `codex()` next to Context when a person should be able to queue the current Mesurer review to Codex:

```ts
import { mountMesurer } from "mesurer-solid"
import { codex, context } from "mesurer-solid/plugins"

mountMesurer({
  plugins: [context(), codex()],
})
```

For Codex-controlled local projects, the trusted `SessionStart` integration runs `mesurer-codex-connect`. It starts or reuses the matching local companion and registers the current Codex thread and project. You can also run it directly:

```bash
bunx mesurer-codex-connect
```

**Queue to Codex** uses Codex's native durable queue. Mesurer queues one message, tracks that exact delivery, and opens the existing Desktop thread when Desktop needs to wake it. It does not create a new Codex thread or use Steer. The page keeps its chosen thread across a same-tab reload.

If a queued review contains saved annotations, Mesurer removes only those annotation ids after the matching Codex turn completes. Interrupted, failed, or uncertain deliveries keep the notes for retry. Turn completion is delivery state, not proof that the UI change is correct.

See [Queue Context feedback to Codex](./docs/CODEX.md) for thread selection, Desktop and CLI/TUI wake behavior, lifecycle correlation, permissions, recovery, and the typed `codex:v1` service.
## Documentation

Start with the [documentation index](./docs/README.md).

- [Capabilities](./docs/CAPABILITIES.md)
- [Getting started](./docs/GETTING_STARTED.md)
- [Direct text editing and Typography](./docs/TEXT_EDITING.md)
- [Arrange](./docs/ARRANGE.md)
- [Layout Guides](./docs/LAYOUT_GUIDES.md)
- [Measurements and distance geometry](./docs/MEASUREMENTS.md)
- [Screenshots](./docs/SCREENSHOTS.md)
- [Electron renderer example](./examples/electron-renderer/README.md)
- [Context workflow](./docs/CONTEXT_WORKFLOW.md)
- [Queue Context feedback to Codex](./docs/CODEX.md)
- [Browser and agent integration](./docs/BROWSER_HARNESS.md)
- [Host isolation](./docs/HOST_ISOLATION.md)
- [Trusted Types](./docs/TRUSTED_TYPES.md)
- [Upstream parity](./docs/UPSTREAM_PARITY.md)
- [Architecture](./ARCHITECTURE.md)
- [Repository structure](./docs/REPOSITORY_STRUCTURE.md)
- [Contributing](./CONTRIBUTING.md)

## Development

Contributor setup, validation expectations, and repository ownership are documented in [CONTRIBUTING.md](./CONTRIBUTING.md) and [Repository structure](./docs/REPOSITORY_STRUCTURE.md).

## Upstream

Mesurer Solid tracks upstream Mesurer source rather than recreating its UI from memory. The current upstream audit is pinned to `ibelick/mesurer@d47fd6056a01da9c442ae04840ec4d0dd46a1257`; adopted behavior and deliberate product differences are recorded in [Upstream parity](./docs/UPSTREAM_PARITY.md).

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).