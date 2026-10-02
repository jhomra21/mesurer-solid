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

Interactive toolbar capture deliberately has two steps. Dragging a region selects it but does not start video immediately. Mesurer keeps the selection in the `selecting` state so the user can move it, resize it from eight handles, or edit its width, height, left, and top values. **Start recording** or Enter confirms that region. Escape cancels.

Once capture is recording, the selection layer stops owning pointer input. The application underneath remains fully interactive so the recording can demonstrate real clicks, typing, menus, drag operations, and other UAT flows. Mesurer keeps only its own Recording controls interactive; the full-screen Recording mount remains pointer-transparent.

Passing an explicit rectangle to `service.start(rect)` remains the programmatic direct-start path and skips the interactive adjustment step.

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

Electron cannot grant a renderer privileged capture access from renderer code alone. Mesurer therefore owns the native side too: import the Electron entry once from the application's **main process, before creating BrowserWindows**.

```ts
import "mesurer-solid/electron"
```

That is the normal Electron setup. There is no Recording code to add to the application's preload.

The Electron entry installs one shared main-process Recording handler and registers Mesurer's private preload with Electron sessions before each window's normal preload runs. The private preload exposes only the one Recording stream request, only in the main frame. When Recording starts, the handler asks the invoking `WebContents` for a short-lived media source id bound to that same renderer. Mesurer consumes the id immediately with Chromium's tab-stream constraint and sends the frames through the normal selected-region canvas and MediaBunny pipeline.

This keeps `contextIsolation` and sandboxing intact. Mesurer does not expose raw `ipcRenderer`, use `desktopCapturer`, install a session-wide display-media permission handler, open a system picker, or create a second recorder.

For applications that deliberately need their own sender policy or native bridge lifecycle, the lower-level compatibility helpers remain available at `mesurer-solid/plugins/recording/bridge` and `mesurer-solid/plugins/recording/preload`. New Electron integrations should prefer `mesurer-solid/electron`.

Once the native capability is present, failure stays on that path instead of silently opening a different screen-share permission flow.

## Chromium extension capture

The first-party extension requests `tabCapture` in addition to its existing active-tab permissions. It does not add broad host permissions.

After the user has explicitly invoked the extension, the background worker can mint a one-use current-tab stream id with `chrome.tabCapture.getMediaStreamId()`. A private isolated-world bridge passes only that id to the page. On a secure page, the Recording capture layer consumes it with `getUserMedia()` and feeds the resulting stream into the same MediaBunny encoder used by ordinary browser capture.

The extension does not contain a second recorder, an offscreen recorder, or a `MediaRecorder` path. If the extension stream path is unavailable, Recording falls back to the normal browser display picker.

`tabCapture` is a Chrome extension permission and Chrome controls the permission warning shown during installation.

## Preview and export

Stopping a recording opens the compact upstream-style Mesurer editor. The collapsed card is 352px wide and can grow to 576px. It includes:

- click-to-play video preview plus a compact Play/Pause control and current/duration time;
- one timeline with a playhead and keyboard/pointer-accessible trim-start and trim-end handles;
- an export-options menu that groups detected formats with 1× / 2× / 3× output sizes and shows the resulting pixel dimensions;
- a compact Download action that exports through MediaBunny;
- grow/shrink preview control;
- hover/focus Close action;
- export progress overlay and inline export errors.

The export menu opens above or below its anchor according to available viewport space. The editor follows the same persisted System/Light/Dark Appearance setting as the toolbar and other Mesurer inspector surfaces.

The editor is viewport-owned inspector UI. Its object URLs, window/document listeners, and drag state are released when the clip is replaced, dismissed, or the plugin is disposed.

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

- physical drag selection enters adjustment instead of starting immediately;
- explicit start after adjustment;
- host-page pointer input remains live while capture is recording;
- physical stop;
- exact selected dimensions;
- changing decoded frames rather than merely a non-empty container;
- WebM trim and 2× resize;
- MP4 when AVC encoding is supported;
- programmatic service capture;
- browser display acquisition;
- extension-stream acquisition without falling back to the display picker;
- packed Electron acquisition through `mesurer-solid/electron` with no application-owned Recording preload/IPC, using a renderer-bound WebContents stream id; native Electron mouse input must still reach the recorded application while capture is active, with a retained WebM artifact;
- Escape/cancel and clean browser diagnostics.

Build/package checks also reject `MediaRecorder` in the Recording implementation and reject accidental MediaBunny bundling across the MPL/MIT boundary.
