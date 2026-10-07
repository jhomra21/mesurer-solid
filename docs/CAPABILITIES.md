# Capabilities

This page lists the public Mesurer features and the APIs that expose them for `mesurer-solid@0.2.1` stable. Feature guides contain the detailed interaction rules.

## Built-in tools

| Tool | What it does |
| --- | --- |
| Select | Select one or many rendered HTML or SVG elements and report exact geometry. Invoking Select clears the current element and Guide selection before toggling the tool. |
| X-ray | Show page structure without changing application source. |
| Color Picker | Sample a rendered color from the current application window when a host capture capability exists; otherwise use the browser `EyeDropper` when operational. Copy the sample in the configured `colorPickerClickFormat`. |
| Rulers | Show viewport rulers and ruler settings. |
| Typography | Inspect rendered typography and computed type styles in Select mode. |
| Guides | Add horizontal and vertical guides, including snapping behavior. |
| Distance | Show spacing between rendered targets. Box-to-box lines use shared-overlap anchors, guide distances use the guide as line geometry, and container spacing uses the padding box. Multi-selection Context also reports pairwise distances. |
| Settings | Control Mesurer preferences, plugin availability, shortcuts, appearance, and presentation options. |

The default keyboard shortcuts are listed in the root [README](../README.md).

## Renderer capabilities

| Capability | What it does |
| --- | --- |
| Direct text editing | In Edit mode, double-click or double-tap a valid direct text run in an HTML element. Mixed inline copy can target the exact run under the pointer while preserving inline children. Typography in Select remains inspection-only. SVG selection does not enable direct text editing. |
| Select/Edit modes | Select owns selection-first inspection/capture tools such as X-ray, Color Picker, Typography, Screenshot, and Recording. Edit owns movement and direct text/style editing. Rulers, Guides, and Layout Guides remain available in both modes; Context and Codex remain visible in both. The grouped toolbar changes mode in 150 ms and respects reduced-motion preferences. |
| Compact toolbar | Hide inactive controls without changing mode or active state. Expanding restores the same controls. Toolbar dragging starts after the pointer crosses the drag threshold, and menus, dialogs, form controls, editable regions, and sliders retain pointer ownership. |
| Multi-selection | Extend Select across multiple targets and inspect group geometry plus pairwise relationships. |
| Visual hit testing | Select and agent point inspection share the rendered-point resolver. It follows the native front-to-back hit stack, traverses open shadow roots, and can recover visible `pointer-events:none` descendants that native hit testing would otherwise skip. |
| Presentation ownership | Edit movement and text previews restore only values Mesurer still owns. Host-authored changes remain untouched. |
| Appearance | Use persisted System, Light, or Dark themes across isolated and document-backed Mesurer UI. System follows `prefers-color-scheme`. |

Direct text editing respects native form controls and `contenteditable` ownership. Mesurer keeps mixed-inline targeting in its own runtime state; it does not replace or redefine the host element's native `childNodes` API. See [Direct text editing and Typography](./TEXT_EDITING.md).

Distance and measurement geometry are documented in [Measurements and distance geometry](./MEASUREMENTS.md).

## First-party plugins

All public plugin factories come from `mesurer-solid/plugins`.

| Feature | Factory | Typed service | Guide |
| --- | --- | --- | --- |
| Context | `context()` | `MesurerContextService` | [Context](./CONTEXT_WORKFLOW.md) |
| Edit | `edit()` | `MesurerEditService` | [Edit](./EDIT.md) |
| Layout Guides | `layoutGuides()` | `MesurerLayoutGuidesService` | [Layout Guides](./LAYOUT_GUIDES.md) |
| Screenshot | `screenshot()` | `MesurerScreenshotService` | [Screenshots](./SCREENSHOTS.md) |
| Recording | `recording()` | `MesurerRecordingService` | [Recording](./RECORDING.md) |
| Codex | `codex()` | `MesurerCodexService` | [Queue Context feedback to Codex](./CODEX.md) |

- Context adds structured Context, exact selection, saved annotations, review, capture planning, Copy Context, Copy Selection, and Add Note.
- Edit adds reversible movement plus direct text/style editing. The existing Arrange service ids and agent methods remain compatible.
- Layout Guides adds page-scoped columns, rows, and pixel grids. Mutations run through JSON-safe plugin commands, participate in plugin history, and are available through the typed `layout-guides:v1` service.
- Screenshot adds region capture with preview, clipboard copy, download, and programmatic capture. It selects an application-native host capability, the Chromium extension adapter, or browser display capture internally, and flattens transparent native PNGs against the renderer backdrop before output.
- Recording adds adjustable selected-region video capture, a typed `recording:v1` lifecycle, 60/120 fps settings, trim/scale preview, and MediaBunny-owned WebM/MP4 export. Browser, extension, and Electron APIs only acquire the live stream.
- Codex is Mesurer's local human-to-Codex delivery integration. Electron hosts with the native bridge start it enabled. Browser hosts list it in Settings but start it off; enabling uses the loopback Mesurer Codex Bridge companion and remains enabled if that helper is temporarily unavailable. Both transports expose the same `codex:v1` service and Queue to Codex UI.

Each feature guide documents the methods and behavior that belong to that plugin. The built-in factories are also exported for lower-level composition. Normal `mountMesurer()` callers get the catalog defaults automatically. Settings can turn managed plugins off or back on; transport selection stays inside Codex.

## Agent API

Pass `agent: true` to `mountMesurer()` or use the injection build. `window.__MESURER__` exposes the full browser-facing agent API. The mounted instance exposes that same object as `mounted.agent`, mirrors the high-level Context, Edit movement, and text-intent methods on the mounted instance, and also owns mount lifecycle methods such as `bringToFront()` and `dispose()`.

### Mounted instance

`mountMesurer()` returns a `MountedMesurer` object. It exposes the full low-level agent object as `mounted.agent` and mirrors the high-level Context, Edit movement, and text-intent methods for normal application code.

Mounted-instance-only helpers include:

| Member | Use |
| --- | --- |
| `ready` | Promise that resolves to the live plugin host after plugin startup and the initial rendered state settle. |
| `service<T>(id)` | Resolve a typed plugin-owned value after startup. Falsy registered values are returned unchanged. |
| `copyContext(request?)` | Copy formatted Context through the enabled Context service. |
| `bringToFront()` | Reassert the Mesurer host above later host-page overlays when the host layer supports it. |
| `describe()` | Resolve the current plugin description after startup. |
| `pluginHost` | Compatibility access to the host when advanced code needs the pre-ready value. Prefer `await ready` for normal use. |
| `hostLayer` | Read the active Mesurer host-layer mode. |
| `element` and `root` | Access the mounted island and its renderer root. |
| `dispose()` | Idempotently remove the mounted Mesurer instance, detach lifecycle listeners, and restore any replaced agent global. |

### General inspection

| Method | Result |
| --- | --- |
| `ready()` | Wait until the Mesurer plugin host is ready. |
| `describe()` | Describe loaded plugins, tools, settings, overlays, state slices, commands, hooks, and services. |
| `inspect(selector, index?)` | Inspect one matching rendered element. |
| `inspectAll(selector, limit?)` | Inspect multiple matching rendered elements. |
| `at(x, y)` | Inspect the rendered element at viewport coordinates. |
| `distance(a, b)` | Measure the relationship between two selector targets. |
| `viewport()` | Read viewport size, document size, scroll position, device pixel ratio, and overflow. |
| `feedback(selectors?)` | Read viewport state, selected inspections, plugin description, and plugin state in one snapshot. |
| `command(id, args?)` | Execute a registered Mesurer command and return its JSON-safe result when it has one. |
| `state()` | Read the current plugin state snapshot. |
| `stable(frames?)` | Wait for fonts and the requested number of animation frames before measuring again. |
| `textEdits()` | List saved direct-text and typography intents. |
| `textEdit(id)` | Read one saved text-edit intent. |

### Context and annotations

These methods require the Context capability.

| Method | Result |
| --- | --- |
| `capabilities()` | Report which Context, selection, annotation, Edit movement, and text-edit capabilities are available. |
| `context(request?)` | Return structured `mesurer.context/v1` evidence. |
| `contextText(request?)` | Format the same Context evidence as text. |
| `select(selectorOrSelectors)` | Select exact rendered targets and return selection Context. Every selector must resolve to one element. |
| `annotations()` | List saved annotations. |
| `review(annotationId?)` | Compare saved annotation baselines with the current rendered result. |
| `capturePlan(request?)` | Return the regions needed for a Context or annotation screenshot. |
| `prepareCapture()` | Hide or adjust Mesurer presentation before an external screenshot. |
| `finishCapture()` | Restore Mesurer presentation after the screenshot. |

Context reports the page and viewport, selected or annotated targets, rulers/X-ray visibility, ordinary guides, saved Layout Guides for the current page, measurements, and relevant distances. Each Layout Guide entry carries its own `visible` flag. Context reads the plugin service at capture time, so the two plugins do not require a particular load order.

### Edit movement

These methods require Edit. The agent method names keep `Arrange` for compatibility. TypeScript exposes them through `MesurerEditHarness`; `MesurerArrangeHarness` remains a compatibility alias.

| Method | Result |
| --- | --- |
| `arrangements()` | List saved Edit movement intents. |
| `arrange(id)` | Read one Edit movement intent. |
| `showArrange(id, "before" | "desired" | "live")` | Switch the visible Edit movement presentation. |
| `arrangeCapturePlan(id, presentation)` | Return regions for an Edit movement screenshot. |
| `reviewArrange(id, tolerance?)` | Compare Live geometry with the saved Desired geometry. |

## Standalone helpers

Normal application code should use the mounted instance or `window.__MESURER__`. Advanced integrations can call these root exports directly.

| Export | Use |
| --- | --- |
| `createMesurerAgentHarness(options)` | Build the low-level inspection API around an existing document and plugin host. |
| `captureMesurerContext(options)` | Build a `mesurer.context/v1` payload from a workspace runtime and request. |
| `formatMesurerContext(context)` | Format structured Context as plain text. |
| `createMesurerCapturePlan(context)` | Build viewport and focus capture regions from structured Context. |
| `reviewMesurerAnnotation(options)` | Compare one saved annotation baseline with current rendered evidence. |
| `copyTextToClipboard(ownerDocument, ownerWindow, text)` | Copy text with Clipboard API support and a DOM fallback. |

## Plugin API

`mesurer-solid/core` exports the framework-neutral plugin host and contracts.

| Export | Use |
| --- | --- |
| `defineMesurerPlugin(plugin)` | Preserve a plugin's inferred type while declaring it as a Mesurer plugin. |
| `createMesurerPluginHost()` | Create an empty plugin host for code that manages plugin loading directly. |
| `createMesurerRuntime({ plugins })` | Create a plugin host and load a readonly initial plugin set. Failed startup disposes the partial host before rethrowing. |

A plugin can register state, tools, settings, overlays, commands, hooks, services, and cleanup. State slices can opt into undo/redo history and persistence.

The host can load, remove, replace, inspect, and list plugins. It also exposes registered tools, settings, overlays, services, commands, hooks, state, subscriptions, and undo/redo.

Renderer-only services remain private. Public plugins request them by service id instead of importing private renderer types.

## Mount and persistence options

`mountMesurer()` accepts these public option groups:

| Area | Options |
| --- | --- |
| Host and lifecycle | `target`, `isolate`, `shadowMode`, `topLayer`, `agent`, `signal` |
| Colors and appearance | `highlightColor`, `guideColor`, `hoverHighlightEnabled`, `theme` |
| Persistence | `persistOnReload`, `persistKey`, `persistence`, `onPersistenceError` |
| Shortcuts | `shortcutsEnabled` |
| Color Picker | `colorPickerFormats`, `colorPickerClickFormat` |
| Snapping and measurement | `snapEnabled`, `snapGuidesEnabled`, `selectNewGuideEnabled`, `multiMeasureEnabled` |
| Guide and ruler presentation | `guideStyle`, `selectionSpacingStyle`, `rulerSettings` |
| Plugins | `plugins`, `excludeBuiltins`, `pluginHost`, `onPluginHost`, `onPluginError` |

When `agent` is an object instead of `true`, `AgentBridgeOptions` also accepts `globalName` and `root`. The returned `mounted.agent` exists regardless; `agent` controls whether that interface is also installed on the owning window.

`excludeBuiltins` uses the public built-in names `select`, `xray`, `colorPicker`, `rulers`, `typography`, `guides`, `distance`, and `settings`. The older `excludePlugins` option and `onPluginsReady` callback remain compatibility surfaces; new code should use `excludeBuiltins` and `await mounted.ready`.

A supplied `pluginHost` is caller-owned. Mount disposal removes the renderer but does not dispose that host. `onPluginHost` runs when the host becomes available, before configured plugin startup settles.

Custom persistence implements `load()`, `saveSettings()`, `saveWorkspace()`, `clearWorkspace()`, and `clearSettings()`. It may also implement `setPageKey(pageKey)`, `subscribe()`, and `setErrorHandler()`. The default adapter scopes page-owned workspace state by pathname plus sorted query parameters (and hash routes that start with `#/`), while settings remain shared for the persistence key. Toolbar position is session UI state and is not stored in the page workspace.

See [Getting started](./GETTING_STARTED.md) for placement examples and the TypeScript declarations for exact value types.

## Package entries and installed tools

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, public types, persistence contracts, agent API, and high-level Context/Edit/text methods. |
| `mesurer-solid/plugins` | First-party plugin factories and plugin service contracts. Deprecated Screenshot helpers remain for compatibility. |
| `mesurer-solid/core` | Framework-neutral plugin host and runtime contracts. |
| `mesurer-solid/inject` | Programmatic browser injection. |
| `mesurer-solid/inject-script` | Built classic Mesurer artifact for browser evaluation; raw evaluators load `mediabunny-vendor` first. |
| `mesurer-solid/mediabunny-vendor` | Separate MPL-2.0 MediaBunny classic runtime used by raw injection and the extension. |
| `mesurer-skill` | Install the portable Mesurer coding-agent skill and its packaged assets. |
| `mesurer-solid/electron` | Preferred Electron main-process bootstrap for package-owned Recording capture. |
| `mesurer-solid/plugins/codex/bridge` | Native-host Codex Bridge and Electron main-process adapter. |
| `mesurer-solid/plugins/codex/preload` | Bundle-friendly Electron preload adapter for Codex. |
| `mesurer-solid/plugins/recording/bridge` | Advanced/manual Electron Recording host adapter. |
| `mesurer-solid/plugins/recording/preload` | Advanced/manual Electron Recording preload adapter. |

The repository also ships a Chromium extension that injects Mesurer into the active tab and provides extension-backed screenshot capture. See the [browser extension](../extension/README.md). Electron applications can provide native window capture from preload/main without changing renderer plugin configuration; see the [Electron renderer example](../examples/electron-renderer/README.md).

## Browser and application support

Mesurer can run in browser applications built with Solid 1 or 2, React, Vue, Svelte, vanilla DOM, and Electron renderer pages. The public package ships its own Solid 2 renderer. Electron/native hosts can provide `window.__MESURER_HOST__.captureScreenshot` from preload; Screenshot uses it for native region capture and Color Picker uses it for a one-shot current-window pixel sample. Electron Recording should use `mesurer-solid/electron` from main before BrowserWindows are created; renderer code still mounts `recording()` normally.

Mount or inject Mesurer only where a DOM exists. Do not mount it in server code, an Electron main process, or another Node-only environment.

Mesurer supports Trusted Types and isolates its default UI from host styles. Source-linked inspector UI uses managed document mounts when it must move with page content.

See [Browser and agent integration](./BROWSER_HARNESS.md), [Host isolation](./HOST_ISOLATION.md), and [Trusted Types](./TRUSTED_TYPES.md).
