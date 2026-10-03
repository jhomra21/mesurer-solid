# Getting started

Mesurer runs in the browser. Mount it once from the browser entry for the page or renderer you want to inspect. The current stable package is `mesurer-solid@0.2.1` on `latest`.

## Install

```bash
bun add -d mesurer-solid@latest
```

or:

```bash
npm install -D mesurer-solid@latest
```

## Mount Mesurer

With Vite, place the mount next to the code that starts the browser app:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

Typical locations:

| Application | Browser entry |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/main.tsx`, `src/index.tsx`, or the project browser entry |
| Vue / Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | renderer entry such as `src/renderer.ts` |
| SSR / metaframework | client-only module or lifecycle |

`import.meta.env.DEV` and `import.meta.hot` are Vite APIs. With another bundler, use its development flag and cleanup lifecycle.

## Mount lifecycle

`mountMesurer()` is the one browser/Electron renderer factory. It creates the host, renderer, built-ins, first-party plugin registry, persistence wiring, and optional agent bridge, then returns a `MountedMesurer` handle.

Most callers can use the handle immediately. Methods such as `service()`, `context()`, and `describe()` wait for the plugin runtime when they need it.

Await `ready` when code needs startup completion or direct access to the live plugin host:

```ts
const mesurer = mountMesurer({
  plugins: [context()],
})

const host = await mesurer.ready
const description = await mesurer.describe()
```

`ready` resolves to the live plugin host after built-ins, configured plugins, persisted plugin state, fonts, and the initial rendered frames settle. If the mount is disposed before that point, `ready` rejects with an `AbortError`.

Use `dispose()` when your framework already has an explicit cleanup hook. When another lifecycle already owns an `AbortController`, pass its signal instead:

```ts
const controller = new AbortController()

const mesurer = mountMesurer({
  signal: controller.signal,
})

controller.abort()
```

Aborting the signal disposes the mount. Passing an already-aborted signal fails before Mesurer adds a host to the document.

To omit built-ins, use their public names:

```ts
mountMesurer({
  excludeBuiltins: ["xray", "typography", "colorPicker"],
})
```

`plugins` controls the initial first-party feature set. Omitting it starts every registered first-party feature. Supplying a list starts that list while omitted first-party features remain available through Settings. Built-ins are separate and are controlled by `excludeBuiltins`.

### Advanced plugin-host ownership

Normal application code does not need `pluginHost`, `onPluginHost`, or `onPluginsReady`.

If an integration supplies `pluginHost`, that host remains caller-owned. Disposing or aborting the Mesurer mount removes the renderer but does not dispose the supplied host. The caller must dispose its host when that longer-lived owner ends.

`onPluginHost` is the early hook for code that must see the host before configured plugin setup settles. For ordinary post-startup access, use `const host = await mesurer.ready`. The older `onPluginsReady` callback remains for compatibility.

### Optional separate module

Mesurer does not require a `dev/` directory or a `mesurer.ts` filename. If you want the setup out of your main entry, move the same mount code into a helper such as `src/dev/mesurer.ts` and load it from the browser entry:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

## Add first-party plugins

Keep plugin setup with the Mesurer mount. First-party plugin factories all come from `mesurer-solid/plugins`:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, edit, layoutGuides, recording, screenshot } from "mesurer-solid/plugins"

if (import.meta.env.DEV) {
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

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

Context, Edit, Layout Guides, Screenshot, Recording, and optional transports such as Codex do not require separate application files. Add `layoutGuides()` when the page needs columns, rows, or a pixel grid. For explicit custom composition, the same `mesurer-solid/plugins` entry also exposes the built-in factories.

## Browser-only boundary

Do not call `mountMesurer()` from build configuration, API/server code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

For SSR frameworks, use the framework's normal client-only boundary. For Electron, use the renderer process where the DOM exists and keep privileged APIs in preload/main. If preload exposes `window.__MESURER_HOST__.captureScreenshot`, Screenshot uses native capture and Color Picker uses the same capability for current-window pixel sampling. For Recording, import `mesurer-solid/electron` once in Electron main before creating BrowserWindows; normal integrations do not add Recording IPC or preload code. Renderer setup remains `screenshot()` / `recording()` as usual. See the [Electron renderer example](../examples/electron-renderer/README.md).

If Mesurer should ship in the browser build instead of being development-only, remove the development guard and keep the returned instance so it can be disposed later.

## Verify the setup

Once mounted:

- press `S` and click a rendered HTML or SVG element to select it; invoking Select again turns it off and clears the current element and Guide selection;
- use `1` for Select mode and `2` for Edit mode; Select owns selection-first inspection/capture tools, while Edit owns movement and direct text/style changes;
- hold Shift while selecting to build a multi-selection;
- hold `Alt` / `Option` for the distance overlay;
- Context and Codex remain visible when switching between Select and Edit;
- use `Shift+R` to select a Recording region when the plugin is enabled; MediaBunny owns encoding and export while the browser or extension only provides the live stream;
- keep Rulers, Guides, and Layout Guides available while Edit is active; X-ray, Color Picker, Typography, Screenshot, and Recording stay in Select;
- use the compact control to hide inactive toolbar items without changing active mode;
- drag the toolbar from its chrome or tool triggers; menus, dialogs, form controls, editable regions, and sliders keep pointer ownership.

The base inspector includes Select, X-ray, Color Picker, Rulers, Typography, Guides, Distance, Settings, direct text editing, and plugin hosting. Typography is read-only inspection in Select. Enter Edit before changing text or typography. Rulers and ordinary Guides remain usable in Edit, and the optional Layout Guides plugin does too.

Global shortcuts are enabled by default. Disable them from **Settings > General > Shortcuts** or mount with `shortcutsEnabled: false`; toolbar controls and Escape/cancel behavior remain available.

Mesurer uses **Settings > General > Appearance** for System, Light, and Dark modes. System is the default and follows `prefers-color-scheme`. Set `theme: "light"` or `theme: "dark"` on `mountMesurer()` when the initial appearance should not follow the system. The setting persists with the other Mesurer preferences.

Default workspace persistence is page-scoped. The page key uses pathname plus sorted query parameters and includes `#/` hash routes. Navigating within one tab swaps page-owned selection, measurements, annotations, and Layout Guides instead of carrying them into another route. Toolbar position is tab-session UI and survives route changes and reloads separately from page workspace state.

Mode shortcuts are `1` for Select and `2` for Edit. `Shift+A` remains an Edit compatibility shortcut. Plugin shortcuts are available only when global shortcuts are enabled and their plugin is mounted and enabled.

## Next

- [Capabilities](./CAPABILITIES.md)
- [Direct text editing and Typography](./TEXT_EDITING.md)
- [Edit](./EDIT.md)
- [Arrange compatibility](./ARRANGE.md)
- [Layout Guides](./LAYOUT_GUIDES.md)
- [Measurements and distance geometry](./MEASUREMENTS.md)
- [Screenshots](./SCREENSHOTS.md)
- [Recording](./RECORDING.md)
- [Electron renderer example](../examples/electron-renderer/README.md)
- [Context](./CONTEXT_WORKFLOW.md)
- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md)
- [Documentation index](./README.md)
