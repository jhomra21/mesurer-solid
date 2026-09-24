# Electron renderer example

Mesurer runs in the Electron renderer process, where the inspected DOM exists.

Renderer setup stays the same as a browser app:

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

Keep `contextIsolation` enabled and `nodeIntegration` disabled. Do not mount Mesurer from the Electron main process.

## Native window capture

Screenshot chooses its capture path internally. Renderer code stays `screenshot()`.

For an Electron app, expose the privileged capture capability once from preload:

```ts
contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  captureScreenshot: () => ipcRenderer.invoke("window:capture"),
})
```

The main process can back that capability with `webContents.capturePage()`:

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

Mesurer detects `window.__MESURER_HOST__.captureScreenshot` before trying any browser capture path. The renderer does not import Electron and does not pass a provider to Screenshot.

When the host capability is absent, Screenshot checks the first-party extension bridge and then falls back to `getDisplayMedia()`. The package smoke workflow verifies the Electron path from a packaged `file://` renderer with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.

See [Getting started](../../docs/GETTING_STARTED.md) and [Screenshots](../../docs/SCREENSHOTS.md).
