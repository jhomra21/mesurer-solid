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

Keep Electron privileges in preload/main. The renderer does not import `electron`, and Screenshot does not need an Electron-specific factory or provider option.

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

When the native capability is absent, Screenshot checks the first-party Chromium extension adapter and then falls back to `getDisplayMedia()`. Packaged `file://` renderers are supported.

## Validation

Package smoke installs the packed `mesurer-solid` artifact into a clean Electron 43 consumer. It runs with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`, selects a real DOM target through Mesurer, captures through preload and `webContents.capturePage()`, and verifies the PNG result.

See [Getting started](../../docs/GETTING_STARTED.md), [Screenshots](../../docs/SCREENSHOTS.md), and [Host isolation](../../docs/HOST_ISOLATION.md).
