# mesurer-solid

Framework-agnostic UI inspection, measurement, visual intent, and agent-readable rendered context for browser applications.

Mesurer Solid ships its own isolated Solid 2 renderer. Host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

**Current stable:** `mesurer-solid@0.2.1` on the `latest` dist-tag.

<p align="center">
  <img src="https://raw.githubusercontent.com/jhomra21/mesurer-solid/main/docs/assets/readme/hero-multi-spacing.png" alt="Mesurer Solid measuring spacing between selected elements" width="100%">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/jhomra21/mesurer-solid/main/docs/assets/readme/electron-typography.png" alt="Mesurer Solid inspecting typography inside an Electron application" width="49%">
  <img src="https://raw.githubusercontent.com/jhomra21/mesurer-solid/main/docs/assets/readme/electron-rulers.png" alt="Mesurer Solid using rulers and guides inside an Electron application" width="49%">
</p>

## Installation

```bash
bun add -d mesurer-solid@latest
```

or:

```bash
npm install -D mesurer-solid@latest
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

For Vite, put this in the existing browser entry such as `src/main.tsx`, `src/main.ts`, or `src/index.tsx`. In Electron, use the renderer entry and keep privileged Electron work in preload/main. If preload exposes `window.__MESURER_HOST__.captureScreenshot`, Screenshot uses native capture and Color Picker samples the current application window through that same capability. If preload exposes `window.__MESURER_HOST__.codexBridge`, Codex starts enabled and uses the native transport. Browser-only hosts still list Codex in Settings, start with it off, and connect through the local Mesurer Codex Bridge companion when enabled. Renderer configuration remains runtime-neutral. In SSR applications, mount from a client-only module or lifecycle.

`src/dev/mesurer.ts` is an optional organization pattern, not a required filename or directory. Do not mount Mesurer from `vite.config.ts`, server/API code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

The returned handle owns the mount. Await `mesurer.ready` when startup completion, initial rendered stability, or direct host access matters, call `mesurer.dispose()` for explicit cleanup, or pass `signal` when an existing lifecycle should own disposal.

Full placement examples: [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md).

## First-party plugins

All public first-party plugin factories are exported from `mesurer-solid/plugins` and use the feature name directly:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, edit, layoutGuides, recording, screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    edit(),
    layoutGuides(),
    screenshot(),
    recording(),
  ],
})
```

The base inspector includes Select, X-ray, Color Picker, Rulers, Typography, Guides, Distance, Settings, plugin hosting, direct text editing, and the low-level inspection API. First-party Recording uses MediaBunny for encoded video, trim, resize, and WebM/MP4 export; its capture adapters only acquire pixels. Electron apps should import `mesurer-solid/electron` once from the main-process entrypoint before creating BrowserWindows; Mesurer then owns its narrow Recording preload/IPC automatically, so the app does not add Recording code to its own preload. The toolbar groups those controls into Select and Edit. Typography stays read-only in Select; Edit owns movement and direct text/style changes. Color Picker uses application-local capture when `window.__MESURER_HOST__.captureScreenshot` is available; other supported browser hosts use an operational `EyeDropper`. A successful sample is copied to the clipboard using `colorPickerClickFormat`.

`mesurer-solid/plugins` also exports the built-in factories for lower-level composition. Normal mounts already include the built-ins. Use `excludeBuiltins` with names such as `"xray"`, `"typography"`, and `"colorPicker"` when a mount should omit one.

Resolve plugin-owned capabilities with `await mesurer.service<T>(serviceId)`. The helper waits for configured plugins to finish loading and keeps normal consumers on the mounted interface instead of requiring `pluginHost.service.get(...)`. Falsy registered values are returned unchanged.

Advanced integrations may supply their own `pluginHost`. That host remains caller-owned; disposing or aborting the Mesurer mount does not dispose it. Use `onPluginHost` only when code needs the host before startup settles.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, public domain types, and agent API |
| `mesurer-solid/plugins` | All first-party plugin factories and plugin-specific contracts |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic browser injection |
| `mesurer-solid/inject-script` | Built classic Mesurer injection artifact; load `mesurer-solid/mediabunny-vendor` first for raw classic evaluation |
| `mesurer-solid/mediabunny-vendor` | Separate MPL-2.0 MediaBunny classic runtime for raw injection and the extension; the normal ESM entrypoints use an internal relative `dist/mediabunny-runtime.js` so MediaBunny is not installed into consumer dependency graphs |
| `mesurer-skill` | Install the portable coding-agent skill |
| `mesurer-solid/electron` | Preferred Electron main-process bootstrap; automatically installs Mesurer's narrow Recording bridge/preload |
| `mesurer-solid/plugins/codex/bridge` | Native Codex transport and Electron main-process host adapter |
| `mesurer-solid/plugins/codex/preload` | Bundle-friendly Electron preload adapter for the Codex host capability |
| `mesurer-solid/plugins/recording/bridge` | Advanced/manual Electron Recording host adapter for custom sender policy |
| `mesurer-solid/plugins/recording/preload` | Advanced/manual Electron Recording preload adapter |

Programmatic injection reuses an existing connected instance by default. Lifecycle-owning integrations can set `recoverDisconnected: true` in `MesurerInjectConfig` to remount Mesurer when page DOM replacement disconnects its host. The option defaults to `false`, so ordinary one-shot injection does not silently reappear after disposal.

## Features

- Select one or many rendered HTML or SVG elements and inspect exact geometry. Turning Select off clears the current element and Guide selection.
- Measure distance and pairwise multi-selection spacing.
- Use X-ray, guides, rulers, and persisted settings.
- Add page-scoped columns, rows, or pixel grids with the optional `layoutGuides()` plugin. Guide edits participate in plugin undo/redo, and Context includes the current page's saved guides with their visibility state.
- Inspect rendered typography in Select. Edit previews reversible direct copy and style changes.
- Use Edit to move selected UI and change direct text, typography, and text color without changing source.
- Capture page regions through the optional Screenshot plugin. It selects native host capture, the Chromium extension adapter, or browser display capture internally, and flattens transparent native captures against the renderer backdrop before preview, copy, or save.
- Record adjustable selected regions through the optional Recording plugin at 60 fps by default or 120 fps when selected and supported. Browser, extension, and Electron APIs only acquire the stream; MediaBunny owns encoding, inspection, trim, 1×/2×/3× resize, and WebM/MP4 export.
- Read selection, measurements, guides, annotations, layout, styles, and saved human intent through Context and agent APIs.
- Keep saved annotations across same-tab reloads and conservatively rebind them to their original DOM targets; markers, cards, and ownership evidence stay attached through scrolling, repeated-note markers stay local, Add Note remains available while a note is open, and cards/composers occlude Select hover and selection chrome.
- Extend the runtime with tools, settings, overlays, commands, hooks, state, and services.
- Compact the toolbar to active controls without changing tool state or order.
- Choose System, Light, or Dark appearance while keeping the same theme across isolated and document-backed Mesurer UI.

Use `1` for Select and `2` for Edit. Select owns X-ray, Color Picker, Typography, Screenshot, and Recording. Edit owns movement and direct text/style changes. Rulers, Guides, and Layout Guides remain usable in both modes; Context and Codex remain visible in both modes. The grouped toolbar changes modes in 150 ms. `Shift+A` still enters Edit as a compatibility shortcut.

Toolbar dragging starts after the pointer crosses the drag threshold. Dragging from Settings, Guide, or plugin triggers closes the open menu or panel. Pointer activity inside menus, dialogs, form controls, editable regions, and sliders does not drag the toolbar.

Select and agent point inspection use the same rendered hit-test path. They can target SVG and visible `pointer-events:none` descendants instead of collapsing those descendants to an interactive ancestor. Open shadow roots are traversed; closed shadow roots remain browser-owned boundaries. Context and annotations accept the same SVG targets. Edit movement and direct text editing only mutate HTML elements.

Persisted workspace evidence is page-scoped by route, including sorted query parameters. In-tab navigation swaps the current page workspace without carrying page-owned guides or selection state to another route. Toolbar placement remains tab-session UI and survives those route changes and reloads.

Direct text editing respects native editing boundaries. Descendants of an editable ancestor remain native, while a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the normal direct-text rules pass. Mixed inline copy can target the exact direct text run before or after an inline child without flattening or recreating that child, and the host element keeps its native DOM APIs throughout the interaction.

While direct text editing is active, Mesurer keeps one visible edit ring, keeps the selected dimensions pill and Typography separated by the same `2px` rendered gap when the card is below the source, and keeps Typography stationary during ordinary pointer movement. The selection-adjacent Add Note button is suppressed only for the active edit and returns when the editor closes; saved annotation markers and panels remain available.

Mesurer previews text, styles, and Edit movement only while it still owns the value it applied. Host-authored changes take ownership and are preserved through undo/redo, Live review, cleanup, and disposal.

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
| `1` | Select mode |
| `2` | Edit mode |
| `S` | Select |
| `X` | X-ray |
| `P` | Color Picker when supported |
| `R` | Rulers |
| `A` | Typography |
| `G` | Guides |
| `L` | Layout Guides when the plugin is enabled |
| `H` / `V` | Horizontal / vertical guide orientation |
| `Alt` / `Option` | Distance overlay |
| `Cmd/Ctrl + ,` | Settings |
| `Shift + A` | Edit compatibility shortcut |
| `Shift + S` | Screenshot |
| `Shift + R` | Recording |
| `C` | Copy Context |
| `Shift + C` | Copy Selection |
| `N` | Add Note |

Plugin shortcuts are active only when their plugin is mounted and enabled.

## Agent integration

Enable `agent: true` to expose the full browser agent object through `mesurer.agent` and `window.__MESURER__`. The mounted instance also mirrors high-level Context, Edit movement, and text-intent methods. The movement method names retain `Arrange` for compatibility.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select("#pricing-card")
```

Install the portable Agent Skill with:

```bash
npx --yes --package=mesurer-solid@latest mesurer-skill install
```

The skill preserves existing human state, reads Edit movement, text, and annotation intent before source changes, and verifies the real Live result after implementation.

See [Agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/packages/mesurer/AGENT_INTEGRATION.md).

### Queue to Codex

Codex is Mesurer's own local delivery integration and is separate from the Mesurer Solid ChatGPT/Codex agent plugin. Browser-only hosts list it in **Settings -> Plugins**, start with it off, and use the local Mesurer Codex Bridge companion when enabled. A missing helper leaves the plugin enabled with an unavailable/retry state instead of producing an Electron-preload error.

Native applications can install `installMesurerCodexHost()` in Electron main and expose `createMesurerCodexPreloadBridge()` from a bundled preload. That path uses an in-process native bridge and renderer-scoped lease instead of loopback HTTP. Both transports expose the same `codex:v1` service and **Queue to Codex** UI.

**Queue to Codex** remains one runtime-neutral API. Shared delivery tracks Queued, Working, Finished, or Interrupted through the shared app-server. Desktop current-thread delivery keeps the durable queued submission and wake result visible without fabricating private Desktop lifecycle state. It does not create threads or invoke Steer.

Saved annotations included in a delivery are removed only after the exact matched turn completes. Interrupted, failed, ambiguous, or unreadable deliveries keep them. Set `codex({ clearCompletedAnnotations: false })` to retain completed notes.

See [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md) for host wiring, loaded-thread discovery, recovery, and the typed `codex:v1` service.

## Documentation

- [Capabilities](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CAPABILITIES.md)
- [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md)
- [Direct text editing and Typography](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TEXT_EDITING.md)
- [Edit](https://github.com/jhomra21/mesurer-solid/blob/main/docs/EDIT.md) and [Layout Guides](https://github.com/jhomra21/mesurer-solid/blob/main/docs/LAYOUT_GUIDES.md)
- [Measurements and distance geometry](https://github.com/jhomra21/mesurer-solid/blob/main/docs/MEASUREMENTS.md)
- [Screenshots](https://github.com/jhomra21/mesurer-solid/blob/main/docs/SCREENSHOTS.md)
- [Recording](https://github.com/jhomra21/mesurer-solid/blob/main/docs/RECORDING.md)
- [Electron renderer example](https://github.com/jhomra21/mesurer-solid/blob/main/examples/electron-renderer/README.md)
- [Context workflow](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CONTEXT_WORKFLOW.md)
- [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md)
- [Browser and agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/docs/BROWSER_HARNESS.md)
- [Host isolation](https://github.com/jhomra21/mesurer-solid/blob/main/docs/HOST_ISOLATION.md)
- [Trusted Types](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TRUSTED_TYPES.md)
- [Browser extension](https://github.com/jhomra21/mesurer-solid/blob/main/extension/README.md)
- [Upstream parity](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md)

Mesurer Solid is a source-first Solid port and extension of [Mesurer](https://github.com/ibelick/mesurer). Upstream adoption and deliberate differences are tracked in [Upstream parity](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md).

## License

MIT.
