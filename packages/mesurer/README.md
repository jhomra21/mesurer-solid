# mesurer-solid

Framework-agnostic UI inspection, measurement, visual intent, and agent-readable rendered context for browser applications.

Mesurer Solid ships its own isolated Solid 2 renderer. Host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

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

Mount Mesurer from browser code:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

For Vite, put this in the existing browser entry such as `src/main.tsx`, `src/main.ts`, or `src/index.tsx`. In Electron, use the renderer entry and keep privileged Electron work in preload/main. If preload exposes `window.__MESURER_HOST__.captureScreenshot`, Screenshot uses native capture automatically. Renderer configuration remains `screenshot()`; there is no Electron-specific Screenshot factory or provider option. In SSR applications, mount from a client-only module or lifecycle.

`src/dev/mesurer.ts` is an optional organization pattern, not a required filename or directory. Do not mount Mesurer from `vite.config.ts`, server/API code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

The returned handle owns the mount. Await `mesurer.ready` when startup completion, initial rendered stability, or direct host access matters, call `mesurer.dispose()` for explicit cleanup, or pass `signal` when an existing lifecycle should own disposal.

Full placement examples: [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md).

## First-party plugins

All public first-party plugin factories are exported from `mesurer-solid/plugins` and use the feature name directly:

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

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, Settings, plugin hosting, direct text editing, and the low-level inspection API. Native Color Picker is available only when the host exposes an operational `EyeDropper`. A successful native sample is copied to the clipboard using `colorPickerClickFormat`.

`mesurer-solid/plugins` also exports the built-in factories for lower-level composition. Normal mounts already include the built-ins. Use `excludeBuiltins` with names such as `"xray"`, `"typography"`, and `"colorPicker"` when a mount should omit one.

Resolve plugin-owned capabilities with `await mesurer.service<T>(serviceId)`. The helper waits for configured plugins to finish loading and keeps normal consumers on the mounted interface instead of requiring `pluginHost.service.get(...)`. Falsy registered values are returned unchanged.

Advanced integrations may supply their own `pluginHost`. That host remains caller-owned; disposing or aborting the Mesurer mount does not dispose it. Use `onPluginHost` only when code needs the host before startup settles.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, public domain types, and agent API |
| `mesurer-solid/plugins` | All first-party plugin factories and plugin-specific contracts |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic browser injection |
| `mesurer-solid/inject-script` | Built classic injection artifact |
| `mesurer-skill` | Install the portable coding-agent skill |
| `mesurer-codex` | Run the optional loopback Codex queue companion |
| `mesurer-codex-connect` | Start or reuse the matching Codex companion and register the current Codex session |

Programmatic injection reuses an existing connected instance by default. Lifecycle-owning integrations can set `recoverDisconnected: true` in `MesurerInjectConfig` to remount Mesurer when page DOM replacement disconnects its host. The option defaults to `false`, so ordinary one-shot injection does not silently reappear after disposal.

## Features

- Select one or many rendered HTML or SVG elements and inspect exact geometry. Turning Select off clears the current element and Guide selection.
- Measure distance and pairwise multi-selection spacing.
- Use X-ray, guides, rulers, and persisted settings.
- Add page-scoped columns, rows, or pixel grids with the optional `layoutGuides()` plugin. Guide edits participate in plugin undo/redo, and Context includes the current page's saved guides with their visibility state.
- Inspect Typography and preview reversible direct copy/style changes.
- Arrange selected UI into a Desired position without changing source.
- Capture page regions through the optional Screenshot plugin. It selects native host capture, the Chromium extension adapter, or browser display capture internally.
- Read selection, measurements, guides, annotations, layout, styles, and saved human intent through Context and agent APIs.
- Keep saved annotations across same-tab reloads and conservatively rebind them to their original DOM targets; markers, cards, and ownership evidence stay attached through scrolling, repeated-note markers stay local, Add Note remains available while a note is open, and cards/composers occlude Select hover and selection chrome.
- Extend the runtime with tools, settings, overlays, commands, hooks, state, and services.
- Compact the toolbar to active controls without changing tool state or order.
- Choose System, Light, or Dark appearance while keeping the same theme across isolated and document-backed Mesurer UI.

Arrange is not a toolbar mode. It can be activated before a selection exists and enables Select automatically. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Toolbar dragging starts after the pointer crosses the drag threshold. Dragging from Settings, Guide, or plugin triggers closes the open menu or panel. Pointer activity inside menus, dialogs, form controls, editable regions, and sliders does not drag the toolbar.

Select and agent point inspection use the same rendered hit-test path. They can target SVG and visible `pointer-events:none` descendants instead of collapsing those descendants to an interactive ancestor. Open shadow roots are traversed; closed shadow roots remain browser-owned boundaries. Context and annotations accept the same SVG targets. Arrange and direct text editing only mutate HTML elements.

Persisted workspace evidence is page-scoped by route, including sorted query parameters. In-tab navigation swaps the current page workspace without carrying page-owned guides or selection state to another route. Toolbar placement remains tab-session UI and survives those route changes and reloads.

Direct text editing respects native editing boundaries. Descendants of an editable ancestor remain native, while a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the normal direct-text rules pass. Mixed inline copy can target the exact direct text run before or after an inline child without flattening or recreating that child, and the host element keeps its native DOM APIs throughout the interaction.

While direct text editing is active, Mesurer keeps one visible edit ring, keeps the selected dimensions pill and Typography separated by the same `2px` rendered gap when the card is below the source, and keeps Typography stationary during ordinary pointer movement. The selection-adjacent Add Note button is suppressed only for the active edit and returns when the editor closes; saved annotation markers and panels remain available.

Mesurer previews text, styles, and Arrange transforms only while it still owns the value it applied. Host-authored changes take ownership and are preserved through undo/redo, Live review, cleanup, and disposal.

## Appearance

The default appearance is `"system"`. Users can change it under **Settings > General > Appearance**, or applications can choose the initial mode:

```ts
mountMesurer({ theme: "light" })
```

The setting accepts `"system"`, `"light"`, or `"dark"` and persists with the other Mesurer settings. System mode follows `prefers-color-scheme`.

## Shortcuts

Global shortcuts are enabled by default. Turn them off from **Settings > General > Shortcuts** or pass `shortcutsEnabled: false` to `mountMesurer()`. Toolbar controls, editor-local keys, and Escape/cancel behavior remain available.

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

Plugin shortcuts are active only when their plugin is mounted and enabled.

## Agent integration

Enable `agent: true` to expose the full browser agent object through `mesurer.agent` and `window.__MESURER__`. The mounted instance also mirrors the high-level Context, Arrange, and text-intent methods.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select("#pricing-card")
```

Install the portable Agent Skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

The skill preserves existing human state, reads Arrange/text/annotation intent before source changes, and verifies the real Live result after implementation.

See [Agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/packages/mesurer/AGENT_INTEGRATION.md).

### Optional Queue to Codex

Mount `codex()` next to Context when a person should be able to queue the current review to Codex:

```ts
import { mountMesurer } from "mesurer-solid"
import { codex, context } from "mesurer-solid/plugins"

mountMesurer({
  plugins: [context(), codex()],
})
```

The trusted Codex `SessionStart` integration normally starts or reuses the local companion and registers the current thread. It can also be run directly:

```bash
bunx mesurer-codex-connect
```

**Queue to Codex** writes one item to Codex's native durable queue and tracks that delivery through Queued, Working, Finished, or Interrupted. It does not create threads or invoke Steer. A Mesurer page keeps its selected destination across a same-tab reload.

Saved annotations included in a delivery are removed only after the exact matched turn completes. Interrupted, failed, or uncertain deliveries keep them. Set `codex({ clearCompletedAnnotations: false })` to retain completed notes.

See [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md) for thread discovery, Desktop and CLI/TUI behavior, lifecycle recovery, permissions, and the typed `codex:v1` service.
## Documentation

- [Capabilities](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CAPABILITIES.md)
- [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md)
- [Direct text editing and Typography](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TEXT_EDITING.md)
- [Arrange](https://github.com/jhomra21/mesurer-solid/blob/main/docs/ARRANGE.md) and [Layout Guides](https://github.com/jhomra21/mesurer-solid/blob/main/docs/LAYOUT_GUIDES.md)
- [Measurements and distance geometry](https://github.com/jhomra21/mesurer-solid/blob/main/docs/MEASUREMENTS.md)
- [Screenshots](https://github.com/jhomra21/mesurer-solid/blob/main/docs/SCREENSHOTS.md)
- [Electron renderer example](https://github.com/jhomra21/mesurer-solid/blob/main/examples/electron-renderer/README.md)
- [Context workflow](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CONTEXT_WORKFLOW.md)
- [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md)
- [Browser and agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/docs/BROWSER_HARNESS.md)
- [Host isolation](https://github.com/jhomra21/mesurer-solid/blob/main/docs/HOST_ISOLATION.md)
- [Trusted Types](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TRUSTED_TYPES.md)

Mesurer Solid is a source-first Solid port and extension of [Mesurer](https://github.com/ibelick/mesurer). Upstream adoption and deliberate differences are tracked in [Upstream parity](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md).

## License

MIT.
