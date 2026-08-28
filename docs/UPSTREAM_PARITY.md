# Upstream parity audit

Mesurer Solid tracks the product behavior of [`ibelick/mesurer`](https://github.com/ibelick/mesurer) without copying its React architecture into the Solid implementation.

## Current audit

- Previous pinned visual baseline: `ibelick/mesurer@605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`)
- Audited upstream main: `ibelick/mesurer@005f9fab396abd75b3f5324e4b0ce90cfa82d55b`
- Upstream commits reviewed after the pinned baseline: 41

### Product capability delta

| Upstream 0.1.0 area | Mesurer Solid status | Decision |
| --- | --- | --- |
| Screenshot region selection | Implemented | First-party optional `screenshotPlugin()` |
| Clipboard PNG output | Implemented | Screenshot plugin setting/service; automatic copy is best-effort so a clipboard failure never discards a successful capture |
| Local PNG download | Implemented | Screenshot plugin setting/service plus explicit Save from the viewer |
| Chrome visible-tab capture | Implemented | Extension-only capture bridge; no new broad host permission |
| Screenshot copy/download settings | Implemented as persistent plugin state and service options | Keep feature-local instead of adding fields to the core measurement model |
| Screenshot preview | Implemented and extended beyond upstream | Persistent draggable thumbnail, bottom-right 8px default placement, viewport clamping, native image context menu, dismiss control, click-to-open viewer, Copy/Save/Close controls, and capture-status toast |
| Public React `Measurer` -> `Mesurer` rename | Not applicable | Solid public package is already `mesurer-solid` and its stable mount/plugin contract is framework-agnostic |
| Settings/guides/rulers/isolation refinements | Already covered or independently exceeded by current Solid implementation | Validate behavior rather than porting React hook/refactor structure |
| Arrow/text annotation experiment | Not current upstream behavior | Do not port; upstream added and then reverted it |
| Site/analytics/footer/build changes | Not library parity | Do not port |

The screenshot parity implementation first shipped publicly for prerelease validation in `mesurer-solid@0.1.1-beta.0`. Stable release status is tracked by the normal release workflow rather than being assumed in this audit document.

## Screenshot architecture

The upstream screenshot behavior is preserved while fitting Mesurer Solid's composable architecture:

- `mesurer-solid/screenshot` is an optional public package entry.
- `screenshotPlugin()` registers the camera tool, persistent copy/download state, commands, capture service, selection overlay, preview/viewer UI, and cleanup lifecycle.
- Automatic clipboard copy remains the default, but output copy/download failures are best-effort: a successful capture still produces a usable PNG preview and viewer.
- The preview persists by default until the user dismisses it or starts another capture. A new preview starts in the bottom-right with an 8px viewport inset; after that, the existing drag positioning and viewport-clamping behavior remains unchanged. It can be right-clicked with the browser's native image context menu or clicked to open the larger viewer.
- The viewer keeps native right-click behavior on the image and adds explicit Copy, Save, and Close controls. Escape and backdrop click close the viewer without discarding the thumbnail.
- A short bottom status message confirms `Copied screenshot`, `Saved screenshot`, `Screenshot captured`, or an output-unavailable fallback.
- Normal browser hosts use `getDisplayMedia()` and reuse a live capture stream to avoid repeated permission prompts.
- The Chrome extension injects a short isolated-world message bridge and captures through `chrome.tabs.captureVisibleTab()` using its existing `activeTab` permission.
- Injection can opt in with `__MESURER_CONFIG__.screenshot`; it is not forced into every injected/browser-agent session.
- Screenshot capture uses the renderer's existing `prepareCapture()` / `finishCapture()` presentation boundary, so Mesurer chrome is excluded from the captured pixels without duplicating context-plugin hiding logic.
- The human-facing `screenshot.html` fixture uses the real browser capture provider. A separate `screenshot-contract.html` keeps the deterministic synthetic 2x bitmap used only by CI.

For the current user-facing API, capture lifecycle, preview/viewer behavior, extension path, typed service, and agent/harness boundary, see [`SCREENSHOTS.md`](./SCREENSHOTS.md).

The upstream commit remains pinned in this document so a later audit can compare from this exact point instead of rediscovering the delta.