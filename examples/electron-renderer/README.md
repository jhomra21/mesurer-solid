# Electron renderer example

Mesurer runs in the Electron renderer process, where the inspected DOM exists. Keep Electron privileges in main or preload.

A normal renderer mount needs no Electron API:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer({ target: document.body })
```

Keep `contextIsolation` enabled and `nodeIntegration` disabled. Do not mount Mesurer from the Electron main process.

## Diffusion Studio-style screenshot capture

[Diffusion Studio Editor](https://github.com/diffusionstudio/editor) captures its window in the main process with `webContents.capturePage()` and returns PNG bytes to the renderer through its existing typed IPC bridge. Mesurer can use the same pattern.

Main process:

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

Preload:

```ts
contextBridge.exposeInMainWorld("desktop", {
  captureWindow: () => ipcRenderer.invoke("window:capture"),
})
```

Renderer:

```ts
import { mountMesurer } from "mesurer-solid"
import {
  context,
  createElectronScreenshotCaptureProvider,
  screenshot,
} from "mesurer-solid/plugins"

const captureVisibleTab = createElectronScreenshotCaptureProvider(
  () => window.desktop.captureWindow(),
)

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    screenshot({
      captureVisibleTab,
      copy: false,
      download: false,
    }),
  ],
})
```

`createElectronScreenshotCaptureProvider()` accepts `ArrayBuffer`, `Uint8Array`, or an object with a `png` field containing either type. Extra fields such as `width` and `height` are allowed.

Mesurer does not import `electron`. The application owns IPC channels, permissions, and the preload API. This keeps `contextIsolation`, sandboxing, and the application's existing security policy intact.

The package smoke workflow runs this pattern in Electron 43 with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. It selects a DOM target, captures that target through the Screenshot plugin, and stores the PNG and JSON result as CI artifacts.

See [Getting started](../../docs/GETTING_STARTED.md) for development guards and HMR cleanup, and [Screenshots](../../docs/SCREENSHOTS.md) for the capture provider contract.
