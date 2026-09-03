# Screenshot capture

Mesurer Solid has two intentionally different screenshot workflows:

1. **Human screenshot capture** through the optional first-party `mesurer.screenshot` plugin.
2. **Agent/harness screenshot evidence** through the existing `mesurer.context` capture-planning boundary plus the outer browser harness's screenshot primitive.

They share Mesurer's capture-presentation rules but solve different problems. The screenshot plugin is not an agent-delivery transport, and harness screenshots do not replace the human camera tool.

## Human screenshot plugin

The public entry is:

```text
mesurer-solid/screenshot
```

Source-mounted applications opt in explicitly:

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

The plugin is removable first-party functionality rather than permanent measurement-core state. It owns:

- the camera toolbar tool;
- viewport-region selection;
- persistent copy/download settings;
- capture provider selection;
- CSS-pixel-to-bitmap HiDPI cropping;
- best-effort clipboard/download outputs;
- capture/output status feedback;
- a persistent draggable screenshot thumbnail;
- native image right-click behavior;
- a click-to-open larger viewer with Copy, Save, and Close controls;
- its service, commands, plugin state, and cleanup lifecycle.

Screenshot uses **Shift+S** for its camera shortcut. It intentionally does not claim `C` because the context workflow already uses `C` and `Shift+C`.

## Human Settings controls

When the plugin is mounted, **Settings → General → Plugins → Screenshot** exposes the same persisted controls that back the screenshot service:

- **Screenshot tool** — hides or restores the camera toolbar tool without unloading the plugin service;
- **Auto-copy** — automatically copies successful captures when clipboard access is available;
- **Auto-download** — automatically saves successful captures locally;
- **Include measurements** — controls whether visible selection/measurement/guide/ruler presentation remains in the capture frame.

The camera toolbar button also has a small chevron quick menu for **Auto-copy**, **Auto-download**, and **Include measurements**. Tool visibility remains in the full Screenshot plugin settings. The quick menu and Settings use the same persisted values, and the quick menu closes after a preference is chosen.

Screenshot-selection chrome and Mesurer control chrome are always excluded from the PNG. That control chrome includes an active direct-text textarea, its Mesurer-style formatting toolbar, and its transient automatic Text Inspector card. Turning **Include measurements** off only hides measurement presentation for the capture frame and restores it immediately afterward.

The controls use the same compact Settings switch geometry as Mesurer's existing Persist and Edge Reveal controls. Their values are persistent plugin settings, so the UI and `MesurerScreenshotService.settings()` / `setSettings()` stay in sync.

## Capture flow

A normal human capture is:

```text
camera tool / Shift+S
  → drag viewport region
  → hide Mesurer control chrome
  → capture visible page
  → convert CSS region to bitmap coordinates
  → crop real PNG
  → restore Mesurer presentation
  → attempt configured copy/download outputs
  → show status + persistent thumbnail
  → optional larger Copy/Save viewer
```

The crop uses the actual captured bitmap dimensions rather than assuming `devicePixelRatio`. This keeps the selected CSS rectangle aligned with the returned image even when the capture provider's bitmap scale differs from CSS pixels.

Selection/capture/editor chrome is excluded from the captured pixels. Existing page content—including a committed/saved Desired text preview when that page state is intentionally being reviewed—is not rewritten merely to obtain the screenshot.

If an agent needs proof of the **source-rendered Live** result for a saved text-edit intent, it must first deactivate Mesurer's text Desired preview as described in [`TEXT_EDITING.md`](./TEXT_EDITING.md). Hiding editor chrome alone does not turn a Desired preview into Live source evidence.

## Outputs and preview/viewer

`copy` and `download` are persistent plugin preferences. Automatic output is best-effort: a clipboard or download failure does not invalidate a successful PNG capture.

After capture, a new thumbnail starts in the **bottom-right corner with an 8px viewport inset**. The thumbnail remains until the user dismisses it or a later capture replaces it. It can be dragged around the viewport and right-clicked with the browser's native image context menu. Dragging keeps the existing viewport-clamping behavior, so the preview remains inside the same 8px-safe boundary. Clicking it opens the larger viewer.

The viewer:

- preserves native image right-click behavior;
- exposes explicit Copy, Save, and Close controls;
- closes on Escape or backdrop click;
- does not discard the underlying thumbnail when merely closed.

A short status message distinguishes successful copy, save, capture-only, and unavailable-output cases.

## Normal browser capture provider

Outside the first-party extension, the default browser provider uses `getDisplayMedia()`.

Mesurer reuses a live capture stream when possible so repeated region captures do not need to prompt on every selection. Browser permission and chooser behavior remain controlled by the browser/platform. If a chooser or permission prompt appears, wait for the user to approve it; after a tab has been validated for capture, reuse that tab/stream when possible instead of opening a new tab for each attempt.

Applications may provide their own `ScreenshotCaptureProvider` when they already have a better same-tab capture source or need deterministic testing.

## First-party Chrome extension

The extension enables screenshot capture automatically.

Its camera path does **not** use `getDisplayMedia()`. The page-mounted plugin sends a narrowly scoped request through an isolated-world bridge, and the extension background worker captures with:

```text
chrome.tabs.captureVisibleTab()
```

The extension already has `activeTab`, so screenshot capture does not require `<all_urls>` or persistent access to every site. Because the browser extension captures the current tab directly, the human does not see the normal screen-share chooser for this path.

See [`../extension/README.md`](../extension/README.md).

## Injection

Normal `/inject` and `/inject-script` usage keeps screenshot capture opt-in:

```js
window.__MESURER_CONFIG__ = {
  screenshot: true,
}
```

Set the configuration before the first injection. The first-party Chrome extension sets the equivalent option automatically.

Do not reinject over an existing human Mesurer instance merely to turn the screenshot plugin on. Existing selection, guides, measurements, annotations, Arrange intents, text-edit intents, plugin state, and screenshot preview/viewer state are human review state and should be preserved. If the feature must be added to a live mounted instance, use the plugin host deliberately rather than destructive replacement.

## Typed screenshot service

Advanced mounted integrations can resolve `MesurerScreenshotService` from the plugin host under service id `screenshot`.

The service exposes:

```text
active()
settings()
setSettings(patch)
start()
cancel()
capture(rect)
```

`capture(rect)` accepts a CSS-pixel viewport rectangle and returns the captured PNG result plus output status. The service is a plugin-local typed API; it is not added to the JSON-safe `window.__MESURER__` context contract.

## Agent/harness screenshot evidence

Coding-agent visual verification normally keeps screenshot bytes in the outer browser harness. This gives the harness control over the exact browser, viewport, timing, artifact storage, and comparison pipeline while Mesurer supplies the clean presentation and exact geometry.

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })

await window.__MESURER__.prepareCapture()
try {
  // Use the existing harness's real screenshot primitive.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ annotation: annotationId }` for a saved annotation baseline.

The context plugin's `capturePlan()` / `prepareCapture()` / `finishCapture()` are not a hidden screenshot implementation. They define what evidence should remain visible and temporarily hide Mesurer control chrome—including transient direct-editor UI—so the outer harness can capture clean pixels.

The capability list therefore still has no `screenshots` or image-delivery capability. The screenshot plugin is a human tool/service; the context API remains context-first. Saved text/style intent remains available separately through `textEdits()` / `textEdit(id)`.

## How agents should use the two paths

For ordinary UI implementation/review work:

```text
Mesurer context/review   → exact numbers and rendered state
Arrange/text saved intent → requested human visual outcome
outer harness screenshot → composition and visual judgment
```

Do not estimate spacing, alignment, dimensions, or box-model facts from screenshot pixels when Mesurer can report them exactly. Do not use a screenshot of Mesurer's Desired text preview as proof that application source implements the edit; verify Live source with the preview inactive.

When the task is specifically about the screenshot feature itself, test the screenshot plugin as the subject under test: camera activation, `Shift+S`, region selection, hidden capture chrome, HiDPI crop, output behavior, bottom-right 8px default preview placement, thumbnail dragging/clamping/dismissal, viewer actions, repeated captures, cancellation, and console cleanliness.

Agents should not close, replace, or otherwise mutate a human's existing screenshot preview merely to tidy their own session.

## Testing and release gates

Screenshot behavior has a dedicated browser contract in `visual-parity/screenshot-contract.mjs` and `.github/workflows/screenshot-contract.yml`.

The contract exercises the real plugin lifecycle and deterministic capture fixture, including region selection, crop dimensions, cancellation, preview/viewer behavior, and restoration of Mesurer UI. Focused renderer coverage also locks the new-preview default to the bottom-right at an 8px inset while preserving drag clamping. Package guards require the public `./screenshot` entry and declarations to be present in the staged npm package.

Direct text editing has a separate rendered browser contract. Screenshot-related changes must not accidentally include or break its transient editor/automatic-inspector chrome, and direct-text changes must keep screenshot capture presentation clean.

Before a stable release that changes screenshot behavior or public screenshot documentation:

- validate the public package entry from a clean installed consumer;
- validate the normal-browser and extension capture paths when relevant;
- keep the npm README, Agent Integration guide, repository Agent Skill, packaged Agent Skill, extension guide, and this document consistent;
- remove prerelease-only install instructions from canonical stable examples;
- keep the two Agent Skill copies byte-identical.

## Upstream provenance

Screenshot region capture was added after the repository's older pinned `ibelick/mesurer` baseline and was intentionally ported as part of the current upstream parity work. Mesurer Solid keeps the user-facing capability while adapting it to the composable plugin architecture and extending the preview/viewer behavior.

See [`UPSTREAM_PARITY.md`](./UPSTREAM_PARITY.md) for the pinned upstream commit and exact parity decisions.
