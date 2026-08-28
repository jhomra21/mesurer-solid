# Upstream parity audit

Mesurer Solid tracks the product behavior of [`ibelick/mesurer`](https://github.com/ibelick/mesurer) without copying its React architecture into the Solid implementation.

## Current audit

- Previous pinned visual baseline: `ibelick/mesurer@605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`)
- Audited upstream main: `ibelick/mesurer@005f9fab396abd75b3f5324e4b0ce90cfa82d55b`
- Upstream commits reviewed after the pinned baseline: 41

### Product capability delta

| Upstream 0.1.0 area | Mesurer Solid status | Decision |
| --- | --- | --- |
| Screenshot region selection | Added in this parity branch | First-party optional `screenshotPlugin()` |
| Clipboard PNG output | Added in this parity branch | Screenshot plugin setting/service |
| Local PNG download | Added in this parity branch | Screenshot plugin setting/service |
| Chrome visible-tab capture | Added in this parity branch | Extension-only capture bridge; no new broad host permission |
| Screenshot copy/download settings | Added as persistent plugin state and service options | Keep feature-local instead of adding fields to the core measurement model |
| Public React `Measurer` -> `Mesurer` rename | Not applicable | Solid public package is already `mesurer-solid` and its stable mount/plugin contract is framework-agnostic |
| Settings/guides/rulers/isolation refinements | Already covered or independently exceeded by current Solid implementation | Validate behavior rather than porting React hook/refactor structure |
| Arrow/text annotation experiment | Not current upstream behavior | Do not port; upstream added and then reverted it |
| Site/analytics/footer/build changes | Not library parity | Do not port |

## Screenshot architecture

The upstream screenshot behavior is preserved while fitting Mesurer Solid's composable architecture:

- `mesurer-solid/screenshot` is an optional public package entry.
- `screenshotPlugin()` registers the camera tool, persistent copy/download state, commands, capture service, selection overlay, preview, and cleanup lifecycle.
- Normal browser hosts use `getDisplayMedia()` and reuse a live capture stream to avoid repeated permission prompts.
- The Chrome extension injects a short isolated-world message bridge and captures through `chrome.tabs.captureVisibleTab()` using its existing `activeTab` permission.
- Injection can opt in with `__MESURER_CONFIG__.screenshot`; it is not forced into every injected/browser-agent session.
- Screenshot capture uses the renderer's existing `prepareCapture()` / `finishCapture()` presentation boundary, so Mesurer chrome is excluded from the captured pixels without duplicating context-plugin hiding logic.

The upstream commit remains pinned in this document so a later audit can compare from this exact point instead of rediscovering the delta.
