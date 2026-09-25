# Screenshots

Mesurer has two screenshot paths:

- the optional `mesurer.screenshot` plugin is a human camera tool;
- coding-agent evidence uses Context capture planning while the browser controller owns the screenshot bytes.

They share Mesurer's capture-presentation rules but solve different problems.

## Human screenshot plugin

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  plugins: [
    screenshot({
      copy: true,
      download: false,
    }),
  ],
})
```

The plugin adds the camera tool and `Shift+S`. It owns region selection, output settings, HiDPI cropping, capture status, thumbnail preview, viewer, service, commands, state, and cleanup.

The public factory accepts `toolEnabled`, `copy`, `download`, and `includeMeasurements`. These map to the same persisted Screenshot settings shown in the camera menu.

The camera chevron exposes Auto-copy, Auto-download, and Include measurements.

## Capture a region

1. Open the camera or press `Shift+S`.
2. Drag a viewport region.
3. Mesurer hides its control UI and captures the visible page.
4. Mesurer crops the selected region from the captured bitmap.
5. Mesurer restores its presentation.
6. It runs the enabled copy/download outputs and shows the result thumbnail.

Cropping uses the captured bitmap dimensions rather than assuming `devicePixelRatio`, so the selected CSS rectangle stays aligned when the provider's bitmap scale differs.

Mesurer control chrome is excluded from the camera subject. That includes the selection overlay, toolbar, direct text editor and formatting controls, semantic preset popup, contextual Typography card, screenshot preview/viewer, and status UI.

A committed Desired preview can still be visible because it changes page presentation rather than Mesurer controls. To prove source-rendered output, switch relevant Arrange or text intent to Live before capturing.

## Outputs and preview

Copy and download are persistent preferences. Output failures are best-effort: a successful PNG remains usable even when clipboard or download access fails.

A new thumbnail starts in the bottom-right with an 8px viewport inset. It remains until dismissed or replaced, can be dragged within the same safe boundary, and keeps native image right-click behavior.

Click the thumbnail to open a larger viewer with Copy, Save, and Close. Escape or backdrop click closes the viewer without discarding the thumbnail.

## Capture hosts

`screenshot()` chooses the available capture path internally.

A host-provided `window.__MESURER_HOST__.captureScreenshot` capability takes priority. Electron applications can expose it once from preload and back it with `webContents.capturePage()`. Screenshot and the built-in Color Picker share this current-window capability. Color Picker captures once after the user selects a pixel; it does not continuously capture while the pointer moves or invoke the screen-wide browser EyeDropper. Renderer code still uses plain `screenshot()`; there is no Electron-specific Screenshot or Color Picker factory.

`captureScreenshot()` takes no arguments and returns the current renderer window as PNG data. Mesurer accepts a PNG `Blob`, `ArrayBuffer`, `Uint8Array`, or an object with a `png` field containing one of those values. The object may also include metadata such as `width` and `height`. Mesurer hides its control UI, waits for paint, invokes the host capability, and performs region cropping itself.

Expose this capability only from application-owned host code that can capture the same renderer window Mesurer is inspecting. In Electron, keep the privileged call in preload/main with `contextIsolation` enabled and `nodeIntegration` disabled. Packaged `file://` renderers are supported.

If the selected native host capability rejects or returns unusable PNG data, Screenshot reports that failure. It does not silently open a browser screen-share flow. The Chromium extension follows the same rule through its private adapter backed by `chrome.tabs.captureVisibleTab()`. When no native or extension adapter is available, Screenshot uses `getDisplayMedia()` and reuses a live capture stream when possible. Browser permission and chooser behavior remain under browser and platform control.

The old `captureVisibleTab` option remains supported for published-package compatibility. New integrations should not pass a capture provider to `screenshot()`.

See [Electron renderer example](../examples/electron-renderer/README.md) and [Browser extension](../extension/README.md).

## Injection

Screenshot is opt-in for normal injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Set it before first injection. The browser extension enables the plugin automatically.

Do not reinject over a live human instance merely to change Screenshot availability. Existing selection, guides, measurements, annotations, Arrange/text intent, plugin state, and screenshot review state should be preserved.

## Typed service

Mounted integrations can resolve `MesurerScreenshotService` from plugin service id `screenshot`.

| Method | Result |
| --- | --- |
| `active()` | Report whether the Screenshot tool is active. |
| `settings()` | Read the current Screenshot settings. |
| `setSettings(patch)` | Update Screenshot settings. |
| `start()` | Enter region-selection mode. |
| `cancel()` | Cancel the active Screenshot interaction. |
| `capture(rect)` | Capture one viewport rectangle and return the screenshot result. |

This service is plugin-local and is not part of the JSON-safe `window.__MESURER__` Context capability list.

## Compatibility and low-level utilities

`mesurer-solid/plugins` retains earlier low-level Screenshot exports for compatibility. They are not the integration seam for new hosts; new application code should use `screenshot()` and the typed service.

| Export | Use |
| --- | --- |
| `captureVisibleTabPng` | Deprecated capture hook retained for compatibility. |
| `copyPngToClipboard` | Deprecated low-level clipboard helper. |
| `createScreenshotFilename` | Deprecated low-level filename helper. |
| `cropPngToViewportRect` | Deprecated low-level crop helper. |
| `normalizeScreenshotRect` | Deprecated low-level region helper. |
| `prepareScreenshotCapture` | Deprecated capture-lifecycle helper. |
| `releaseScreenshotCapture` | Deprecated capture-lifecycle helper. |
| `waitForNextPaint` | Deprecated capture-timing helper. |
| `MIN_SCREENSHOT_SELECTION` | Deprecated plugin implementation threshold. |

Advanced integrations can also import the Screenshot plugin, service, active-state, and settings-state ids. Do not use the deprecated helpers to add a new host. Add the host capability or an internal adapter instead.

## Agent screenshot evidence

For coding-agent verification, Mesurer prepares the presentation while the existing browser controller owns the pixels:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // existing browser controller screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ annotation: annotationId }` for a saved annotation baseline.

Use Mesurer context for exact geometry and screenshots for composition and visual judgment. Do not estimate dimensions or spacing from pixels when Mesurer can report them directly.

## Validation

The Chromium Screenshot contract exercises every supported native host PNG form and verifies malformed host data fails on the selected path. Package smoke installs the packed npm artifact into a clean Electron 43 renderer with `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`, then captures through preload and `webContents.capturePage()`.

See [Context](./CONTEXT_WORKFLOW.md) for the evidence workflow, [Electron renderer example](../examples/electron-renderer/README.md) for native host wiring, and [Upstream parity](./UPSTREAM_PARITY.md) for screenshot provenance.
