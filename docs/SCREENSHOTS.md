# Screenshots

Mesurer has two screenshot paths:

- the optional `mesurer.screenshot` plugin is a human camera tool;
- coding-agent evidence uses Context capture planning while the outer browser harness owns the screenshot bytes.

They share Mesurer's capture-presentation rules but solve different problems.

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

Settings include:

- Screenshot tool visibility
- Auto-copy
- Auto-download
- Include measurements

The camera chevron exposes Auto-copy, Auto-download, and Include measurements through the same persisted state.

## Capture a region

```text
camera / Shift+S
  → drag viewport region
  → hide Mesurer control chrome
  → capture visible page
  → crop the selected region
  → restore Mesurer presentation
  → attempt configured outputs
  → show status + thumbnail
```

Cropping uses the captured bitmap dimensions rather than assuming `devicePixelRatio`, so the selected CSS rectangle stays aligned when the provider's bitmap scale differs.

Mesurer control chrome is excluded from the camera subject. That includes the selection overlay, toolbar, direct text editor and formatting controls, semantic preset popup, contextual Typography card, screenshot preview/viewer, and status UI.

A committed Desired preview can still be visible because it is page presentation, not control chrome. For proof of source-rendered output, switch relevant Arrange or text intent to Live before capturing.

## Outputs and preview

Copy and download are persistent preferences. Output failures are best-effort: a successful PNG remains usable even when clipboard or download access fails.

A new thumbnail starts in the bottom-right with an 8px viewport inset. It remains until dismissed or replaced, can be dragged within the same safe boundary, and keeps native image right-click behavior.

Click the thumbnail to open a larger viewer with Copy, Save, and Close. Escape or backdrop click closes the viewer without discarding the thumbnail.

## Capture providers

Normal browser hosts use `getDisplayMedia()` and reuse a live capture stream when possible. Browser permission and chooser behavior remain under browser/platform control.

Applications can provide a custom `ScreenshotCaptureProvider` for another capture source or deterministic testing.

The first-party Chromium extension uses `chrome.tabs.captureVisibleTab()` through its existing `activeTab` permission and isolated-world bridge, so that path does not show the normal screen-share chooser. See [Browser extension](../extension/README.md).

## Injection

Screenshot is opt-in for normal injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

Set it before first injection. The browser extension enables the plugin automatically.

Do not reinject over a live human instance merely to change Screenshot availability. Existing selection, guides, measurements, annotations, Arrange/text intent, plugin state, and screenshot review state should be preserved.

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

This service is plugin-local and is not part of the JSON-safe `window.__MESURER__` context capability list.

## Agent screenshot evidence

For coding-agent verification, Mesurer prepares the presentation while the existing harness owns the pixels:

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

Use Mesurer context for exact geometry and screenshots for composition and visual judgment. Do not estimate dimensions or spacing from pixels when Mesurer can report them directly.

See [Context](./CONTEXT_WORKFLOW.md) for the evidence workflow and [Upstream parity](./UPSTREAM_PARITY.md) for screenshot provenance.
