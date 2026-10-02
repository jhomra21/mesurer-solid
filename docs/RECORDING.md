# Recording

Recording is a first-party human capture plugin exposed as `recording()` from `mesurer-solid/plugins`. It records a selected page region and keeps the media pipeline local to the browser.

```ts
import { mountMesurer } from "mesurer-solid"
import {
  MESURER_RECORDING_SERVICE_ID,
  recording,
  type MesurerRecordingService,
} from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  plugins: [recording()],
})

await mesurer.ready

const service = await mesurer.service<MesurerRecordingService>(
  MESURER_RECORDING_SERVICE_ID,
)
```

The toolbar shortcut is **Shift+R**. Recording lives in Select because region selection is an inspection/capture action; Edit remains responsible for page mutation.

## Lifecycle

The typed `recording:v1` service exposes:

- `snapshot()` — current status, elapsed time, selection, dimensions, duration, and error;
- `subscribe(listener)` — observe lifecycle changes;
- `formats()` — formats the current runtime can encode;
- `start(rect?)` — start from an exact viewport rect or enter drag selection when omitted;
- `stop()` — finalize the active capture and return the recorded asset;
- `cancel()` — abandon selection or recording and release capture resources;
- `discard()` — remove the current ready clip;
- `export(options?)` — trim, scale, and export through MediaBunny.

Status is one of `idle`, `selecting`, `recording`, `ready`, `exporting`, or `error`.

The defaults are 30 fps, medium quality, and a 60-second maximum capture. Plugin options may lower or raise the frame rate, quality, and duration cap. Recording currently captures video only; audio is discarded.

## MediaBunny pipeline

MediaBunny 1.59.0 owns the complete encoded-media path:

1. Mesurer acquires a live video source from the browser or host adapter.
2. Selected pixels are painted into the Recording canvas.
3. MediaBunny `CanvasSource` encodes the initial clip.
4. MediaBunny reads duration and coded dimensions.
5. MediaBunny performs trim, resize, conversion, remux/transcode, and final export.

Recording does not use `MediaRecorder`. Capture APIs are only pixel/stream acquisition.

The initial recording is WebM. Export supports WebM and, when the current runtime exposes a compatible AVC encoder, MP4. Call `formats()` instead of assuming MP4 is available. Export scale is 1×, 2×, or 3×. MP4 dimensions are normalized to valid even pixel dimensions at the format boundary.

The frame pump applies encoder backpressure rather than building an unbounded queue. If MediaBunny is still accepting the previous frame, Mesurer waits instead of accumulating stale frame work.

## Region capture

When Chromium exposes Region Capture, Mesurer asks the video track to crop to the selected DOM region through `CropTarget`. Otherwise it maps viewport coordinates into the captured video and paints the correct source rectangle into a canvas. The fallback accounts for HiDPI scaling and letterboxed tab/screen streams instead of stretching independent axes.

Mesurer removes hidden media elements, stops tracks, and releases timers/animation frames when recording stops, is cancelled, the track ends, the plugin is disabled, or the mount is disposed.

## Browser capture

Ordinary browser pages use `navigator.mediaDevices.getDisplayMedia()`. Mesurer requests the current browser surface where the browser supports those hints. The browser still owns the permission picker, and the user may need to choose the current tab.

If the browser returns a non-browser display surface, Recording rejects it rather than silently recording another application.

## Electron capture

Electron renderers should expose Mesurer's narrow Recording host capability instead of relying on Electron's display-media picker. Install the package-owned main-process adapter:

```ts
import { BrowserWindow, ipcMain } from "electron"
import { installMesurerRecordingHost } from "mesurer-solid/plugins/recording/bridge"

const recordingHost = installMesurerRecordingHost({
  ipcMain,
  validateSender(event) {
    const window = BrowserWindow.fromWebContents(event.sender)

    return Boolean(window && !window.isDestroyed())
  },
})
```

Then expose only the one-use bridge from preload:

```ts
import { contextBridge, ipcRenderer } from "electron"
import {
  createMesurerRecordingPreloadBridge,
} from "mesurer-solid/plugins/recording/preload"

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  recordingBridge: createMesurerRecordingPreloadBridge(ipcRenderer),
})
```

The main adapter calls Electron's `webContents.getMediaSourceId(requestWebContents)` for the requesting renderer. The returned id is bound to that renderer and consumed immediately with Chromium's `chromeMediaSource: "tab"` constraint. Mesurer does not install a global `setDisplayMediaRequestHandler`, enumerate desktop windows, or open a second picker. The stream still enters the same canvas and MediaBunny encoder used by browser and extension capture.

If a native Recording bridge is present and fails, Mesurer reports that host error and stays on the native path rather than opening an unrelated browser screen-share prompt.

## Chromium extension capture

The first-party extension requests `tabCapture` in addition to its existing active-tab permissions. It does not add broad host permissions.

After the user has explicitly invoked the extension, the background worker can mint a one-use current-tab stream id with `chrome.tabCapture.getMediaStreamId()`. A private isolated-world bridge passes only that id to the page. On a secure page, the Recording capture layer consumes it with `getUserMedia()` and feeds the resulting stream into the same MediaBunny encoder used by ordinary browser capture.

The extension does not contain a second recorder, an offscreen recorder, or a `MediaRecorder` path. If the extension stream path is unavailable, Recording falls back to the normal browser display picker.

`tabCapture` is a Chrome extension permission and Chrome controls the permission warning shown during installation.

## Preview and export

Stopping a recording opens a Mesurer-owned editor with:

- play/pause and current time;
- trim-in and trim-out;
- detected output formats;
- 1× / 2× / 3× scale;
- export progress;
- expand/shrink;
- discard.

The editor is viewport-owned inspector UI. Its object URLs and listeners are released when the clip is replaced, dismissed, or the plugin is disposed.

Programmatic export returns the output Blob, format, duration, dimensions, and generated filename. The toolbar editor downloads the returned Blob after a successful export.

## Distribution and license boundary

MediaBunny is licensed under MPL-2.0. Mesurer Solid keeps that code on a separate distribution boundary:

- Published Mesurer ESM files import the separate `dist/mediabunny-runtime.js` artifact by relative path, so consumer installs do not pull MediaBunny's ambient WebCodecs types into their dependency graph.
- Classic raw injection and the Chromium extension load the separate `mediabunny-vendor.js` artifact before `inject-script.js`.
- Both MediaBunny runtime artifacts stay separate from Mesurer's MIT-licensed generated files, carry the pinned 1.59.0 source notice, and ship beside the full upstream `mediabunny-LICENSE.txt`.
- The installed Agent Skill includes the classic vendor asset and evaluates it before the injector.

See [Third-Party Notices](../packages/mesurer/THIRD_PARTY_LICENSES.md) for the MediaBunny source and license information.

## Validation

The dedicated Chromium contract uses an animated canvas as a deterministic display stream. It verifies:

- physical drag selection and stop;
- exact selected dimensions;
- changing decoded frames rather than merely a non-empty container;
- WebM trim and 2× resize;
- MP4 when AVC encoding is supported;
- programmatic service capture;
- browser display acquisition;
- extension-stream acquisition without falling back to the display picker;
- Escape/cancel and clean browser diagnostics.

Build/package checks also reject `MediaRecorder` in the Recording implementation and reject accidental MediaBunny bundling across the MPL/MIT boundary.
