# Electron renderer example

Mesurer runs in the Electron renderer process because that is where the inspected DOM exists. Mount it the same way you would in a browser application:

```ts
import { mountMesurer } from "mesurer-solid"
import { context, recording, screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot(),
    recording(),
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

Codex starts enabled when the renderer has a native Codex host capability. Without that capability, Settings lists Codex as off.

Install the main-process adapter once. `validateSender(event)` is required so the application chooses which renderer may use the privileged Codex capability:

```ts
import { BrowserWindow, ipcMain } from "electron"
import { installMesurerCodexHost } from "mesurer-solid/plugins/codex/bridge"

const codexHost = installMesurerCodexHost({
  ipcMain,
  validateSender(event) {
    const window = BrowserWindow.fromWebContents(event.sender)

    return Boolean(window && !window.isDestroyed())
  },
})
```

Expose the narrow renderer capability from preload:

```ts
import { contextBridge, ipcRenderer } from "electron"
import {
  createMesurerCodexPreloadBridge,
} from "mesurer-solid/plugins/codex/preload"

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  codexBridge: createMesurerCodexPreloadBridge(ipcRenderer),
})
```

If the application also exposes `captureScreenshot`, put both functions on the same host object.

Keep the preload sandboxed. Electron's sandboxed preload runtime cannot load arbitrary CommonJS packages directly, so bundle a preload that imports `mesurer-solid/plugins/codex/preload`. The package smoke does this with esbuild while keeping `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.

Turning Codex on requests a native lease and waits for Codex readiness before Settings commits the enabled state. Turning it off waits for lease release before the plugin disappears. The main adapter also releases all leases owned by a renderer if it navigates, exits, or is destroyed.

Codex Bridge runs inside Electron main. It does not create an HTTP server or launch another Electron or Node helper. Shared sessions use Codex's local app-server and `thread/queue/add`. If the host inherited an exact Codex Desktop thread, the bridge may instead run Codex's native queue command for that thread and wake it with `codex://threads/<id>`. It never connects to the private app-tools pipe. A Desktop-bundled Codex executable is never used to start the shared daemon.

Disabling Mesurer Codex releases Mesurer's lease. It does not stop the shared Codex daemon.

The package smoke bundles both Electron main and preload before launch. A separate packed runtime smoke verifies private Desktop detection, exact inherited Desktop queue and deep-link routing, lease release, and standalone-daemon startup.

Users do not install a Codex marketplace plugin or manage a Mesurer bridge process.

## Native Recording capture

Recording reuses the same application-local `captureScreenshot` capability as Screenshot and Color Picker. There is no second Electron Recording adapter to install.

Once preload exposes:

```ts
contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("window:capture"),
})
```

the normal `recording()` plugin pulls current-window frames through that capability, crops them to the selected region in the renderer, and feeds the canvas into MediaBunny. The existing `webContents.capturePage()` main-process handler shown below is sufficient.

The host function may receive an optional `{ purpose: "recording" }` argument. Existing implementations that ignore arguments continue to work.

Native frame acquisition participates in the Recording backpressure loop: Mesurer waits for the previous capture and MediaBunny frame submission before requesting another frame. No `MediaRecorder`, desktop-source enumeration, display-media request handler, or screen-share picker is added.

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

Package smoke installs the packed `mesurer-solid` artifact into a clean Electron 43 consumer. It runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. The smoke asserts the native host capabilities are exposed, samples a deterministic color through the current-window host path without calling native `EyeDropper`, selects a real DOM target, captures a PNG through preload and `webContents.capturePage()`, records the same renderer through the one-use Recording stream id, and writes both PNG and WebM artifacts.

See [Getting started](../../docs/GETTING_STARTED.md), [Screenshots](../../docs/SCREENSHOTS.md), and [Host isolation](../../docs/HOST_ISOLATION.md).
