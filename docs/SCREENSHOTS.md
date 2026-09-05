# Screenshots

Mesurer has two screenshot paths with different owners:

- the optional `mesurer.screenshot` plugin is a human camera tool;
- agent/harness evidence uses Context capture planning while the outer harness owns screenshot bytes.

They share the same capture-presentation rules but are not interchangeable.

## Human screenshot plugin

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  plugins: [
    screenshotPlugin({
      copy: true,
      download: false,
    }),
  ],
})
```

The plugin contributes the camera tool and `Shift+S`. It owns region selection, output settings, HiDPI cropping, capture status, thumbnail preview, viewer, service, commands, state, and cleanup.

Settings expose:

- Screenshot tool visibility;
- Auto-copy;
- Auto-download;
- Include measurements.

The camera chevron exposes Auto-copy, Auto-download, and Include measurements through the same persisted state.

## Capture flow

```text
camera / Shift+S
  → drag viewport region
  → hide Mesurer control chrome
  → capture visible page
  → map CSS region to bitmap coordinates
  → crop PNG
  → restore Mesurer presentation
  → attempt configured outputs
  → show status + thumbnail
```

Cropping uses the captured bitmap dimensions instead of assuming `devicePixelRatio`, so CSS selection remains aligned even when the provider's bitmap scale differs.

Control chrome is never part of the camera subject. That includes the screenshot selection overlay, Mesurer toolbar, direct text editor and formatting controls, semantic preset popup, contextual Typography card, screenshot preview/viewer, and status UI.

Committed Desired content can still be visible because it is page presentation, not control chrome. When an agent needs proof of real source output for a saved text edit or Arrange intent, switch that intent to Live first. See [Direct text editing and Typography](./TEXT_EDITING.md) and [Arrange](./ARRANGE.md).

## Outputs and preview

Copy and download are persistent preferences. Output failures are best-effort: a successful PNG remains usable even when clipboard or download access fails.

A new thumbnail starts at the bottom-right with an 8px viewport inset. It remains until dismissed or replaced by a later capture, can be dragged within the same safe boundary, and keeps native image right-click behavior.

Clicking the thumbnail opens a larger viewer with Copy, Save, and Close. Escape or backdrop click closes the viewer without discarding the thumbnail.

## Browser providers

Normal browser hosts use `getDisplayMedia()` and reuse a live capture stream when possible. Browser permission and chooser behavior stay under browser/platform control.

Applications can provide a custom `ScreenshotCaptureProvider` when they already have a better same-tab capture source or need deterministic testing.

The first-party Chromium extension uses `chrome.tabs.captureVisibleTab()` through its existing `activeTab` permission and isolated-world bridge, so the extension path does not show the normal screen-share chooser. See [Browser extension](../extension/README.md).

## Injection

Screenshot remains opt-in for normal injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Set it before first injection. The browser extension enables the plugin automatically.

Do not reinject over a live human instance just to change Screenshot availability. Preserve selection, guides, measurements, annotations, Arrange/text intent, plugin state, and any existing preview/viewer.

## Typed service

Mounted integrations can resolve `MesurerScreenshotService` from plugin service id `screenshot`:

```text
active()
settings()
setSettings(patch)
start()
cancel()
capture(rect)
```

The service is plugin-local. It is not added to the JSON-safe `window.__MESURER__` context capability list.

## Agent/harness evidence

Coding-agent verification normally keeps screenshot bytes in the outer browser harness:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // existing harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ annotation: annotationId }` for a saved annotation baseline.

Mesurer supplies scope and clean presentation; the harness controls browser, viewport, timing, artifact storage, and comparison.

Use Mesurer context for exact geometry and screenshots for composition and visual judgment. Do not estimate dimensions or spacing from pixels when Mesurer can report the values directly.

## Validation

The screenshot browser contract covers plugin activation, region selection, capture presentation, HiDPI crop behavior, cancellation, preview/viewer interaction, repeated captures, and cleanup. Package smoke protects the public `mesurer-solid/screenshot` entry in the packed artifact.

See [Upstream parity](./UPSTREAM_PARITY.md) for the screenshot source/provenance decision.
