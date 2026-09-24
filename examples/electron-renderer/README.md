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

Screenshot chooses its capture path at runtime. If a Mesurer capture bridge is available, it uses that bridge. Otherwise it falls back to the normal browser `getDisplayMedia()` path.

For Electron, the application can connect that internal bridge to `webContents.capturePage()`. This is host setup, not Screenshot configuration.

A main-process handler can return the current window as PNG bytes:

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

The preload script owns the privileged IPC call and answers Mesurer's internal capture bridge. The renderer still uses `screenshot()` with no Electron-specific option.

The package smoke workflow runs this path in Electron 43 with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. The packaged app loads through `file://`, Mesurer selects a DOM target, and Screenshot captures that target through `capturePage()`.

Mesurer does not import `electron` in its browser runtime. The application keeps ownership of Electron permissions and IPC, while Screenshot keeps one host-neutral API.

See [Getting started](../../docs/GETTING_STARTED.md) and [Screenshots](../../docs/SCREENSHOTS.md).
