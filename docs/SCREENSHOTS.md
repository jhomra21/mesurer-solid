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

Settings include:

- Screenshot tool visibility
- Auto-copy
- Auto-download
- Include measurements

The camera chevron exposes Auto-copy, Auto-download, and Include measurements through the same persisted state.

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

A host-provided `window.__MESURER_HOST__.captureScreenshot` capability takes priority. Electron applications can expose it once from preload and back it with `webContents.capturePage()`; renderer code still uses plain `screenshot()`.

The Chromium extension uses its isolated-world capture adapter with `chrome.tabs.captureVisibleTab()`. When neither host path is available, Screenshot uses `getDisplayMedia()` and reuses a live capture stream when possible. Browser permission and chooser behavior remain under browser and platform control.

This keeps one Screenshot factory across browser pages, the extension, Electron renderers, and future native hosts. Selection is capability-based rather than tied to a user agent or framework.

The old `captureVisibleTab` option remains supported for published-package compatibility, but new application integrations should use automatic host capture instead of passing providers to `screenshot()`.

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

## Low-level screenshot utilities

`mesurer-solid/plugins` also exports the utilities used by the first-party Screenshot plugin. Most applications do not need these when `screenshot()` is mounted.

| Export | Use |
| --- | --- |
| `captureScreenshotPng` | Capture through the best available host path, falling back to browser display capture. |
| `captureVisibleTabPng` | Deprecated compatibility alias for `captureScreenshotPng`. |
| `copyPngToClipboard` | Copy PNG data to the clipboard. |
| `createScreenshotFilename` | Create the default timestamped screenshot filename. |
| `cropPngToViewportRect` | Crop captured PNG data to a CSS viewport rectangle using the captured bitmap dimensions. |
| `normalizeScreenshotRect` | Normalize two drag points into a viewport-bounded screenshot rectangle. |
| `prepareScreenshotCapture` | Hide Mesurer control UI before capture. |
| `releaseScreenshotCapture` | Restore Mesurer control UI after capture. |
| `waitForNextPaint` | Wait for the next browser paint before capture work continues. |
| `MIN_SCREENSHOT_SELECTION` | Minimum accepted region-selection size used by the Screenshot tool. |

Advanced plugin integrations can also import the public Screenshot plugin, service, active-state, and settings-state ids.

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

See [Context](./CONTEXT_WORKFLOW.md) for the evidence workflow and [Upstream parity](./UPSTREAM_PARITY.md) for screenshot provenance.
