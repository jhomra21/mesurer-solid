# Electron renderer example

Mesurer runs in the Electron renderer process because that is where the inspected DOM exists. Mount it the same way you would in a browser application:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot(),
  ],
})
```

Keep Electron privileges in preload/main. The renderer does not import `electron`, and Screenshot does not need an Electron-specific factory or provider option. The same host capture capability also keeps Color Picker inside the Electron window.

On macOS Electron renderers, Mesurer keeps the toolbar below the native titlebar area across the full window width. This avoids both the close, minimize, and full-screen controls and the titlebar region that macOS uses for window dragging. The toolbar can still sit against the left edge below that strip. Tab-session persistence remains in place, and an older saved position inside the titlebar area is moved down on the next mount.

## BrowserWindow security

A typical window keeps context isolation and sandboxing enabled and leaves Node integration off:

```ts
const window = new BrowserWindow({
  webPreferences: {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  },
})
```

Do not mount Mesurer from the main process.

## Codex bridge

Codex is enabled by default in Mesurer Settings. To let the sandboxed renderer reach local Codex safely, expose one native-host capability through the same `__MESURER_HOST__` object used by Screenshot.

In main:

```ts
import { ipcMain } from "electron"
import { codexBridge } from "mesurer-solid/plugins/codex/bridge"

ipcMain.handle("mesurer:codex-bridge", (_event, request) =>
  codexBridge(request)
)
```

In preload:

```ts
contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  codexBridge: (request) =>
    ipcRenderer.invoke("mesurer:codex-bridge", request),
})
```

If the application also exposes `captureScreenshot`, put both functions on the same host object.

Without `codexBridge`, the renderer shows **Codex host not connected** and keeps queueing disabled. This is a host-integration diagnostic, not evidence that the local Codex installation is broken. Mesurer does not open a helper server or an extra Electron window as a fallback.

Codex Bridge runs inside Electron main. It does not create an HTTP server or launch another Electron/Node helper. Shared sessions use Codex's local app-server and `thread/queue/add`. If the host inherited an exact Codex Desktop thread, the same bridge may instead run Codex's native queue command for that thread and wake it with `codex://threads/<id>`; it never connects to the private app-tools pipe. A Desktop-bundled Codex executable is never used to bootstrap the shared daemon.

The package smoke bundles this main-process topology to CommonJS with esbuild before launching Electron. A separate packed runtime smoke verifies private Desktop detection without execution, exact inherited Desktop queue/deep-link routing, and standalone-daemon startup. The native bridge must therefore remain independent of `import.meta.url`, `process.execPath`, and sibling runtime-file lookup.

Users do not install a Codex marketplace plugin, trust lifecycle hooks, or manage a bridge process.

## Native Screenshot capture

Screenshot chooses its capture path internally. For native Electron capture, expose one host capability from preload:

```ts
contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("window:capture"),
})
```

Back that IPC call in the main process with `webContents.capturePage()`:

```ts
ipcMain.handle("window:capture", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (!window) throw new Error("No BrowserWindow")

  const image = await window.webContents.capturePage(undefined, {
    stayHidden: true,
  })
  const png = image.toPNG()

  return {
    png: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
    ...image.getSize(),
  }
})
```

`captureScreenshot()` may return a PNG `Blob`, `ArrayBuffer`, `Uint8Array`, or an object with a `png` field containing one of those values. Extra metadata such as `width` and `height` is allowed. Mesurer hides its control UI, waits for paint, calls the host capability, and crops the selected region itself.

Reject the promise when native capture fails. Once Screenshot has selected the Electron host capability, a failure stays on that path instead of opening a browser screen-share prompt.

Color Picker also uses `captureScreenshot()` when it is present. Mesurer shows a renderer-local crosshair, hides its own UI after the user clicks, captures the window once, maps the CSS point to the returned PNG dimensions, and copies the sampled color. Blur, visibility loss, plugin disable, and disposal cancel the pending local pick. Mesurer does not call the browser's screen-wide `EyeDropper` on this path.

When the native capability is absent, Screenshot checks the first-party Chromium extension adapter and then falls back to `getDisplayMedia()`. Color Picker uses a working browser `EyeDropper` when available. Packaged `file://` renderers are supported.

## Validation

Package smoke installs the packed `mesurer-solid` artifact into a clean Electron 43 consumer. It runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. The smoke asserts both native host capabilities are exposed, samples a deterministic color through the current-window host path without calling native `EyeDropper`, then selects a real DOM target, captures through preload and `webContents.capturePage()`, and verifies the PNG result and exact capture count.

See [Getting started](../../docs/GETTING_STARTED.md), [Screenshots](../../docs/SCREENSHOTS.md), and [Host isolation](../../docs/HOST_ISOLATION.md).
