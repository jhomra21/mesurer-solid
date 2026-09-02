# Upstream parity audit

Mesurer Solid tracks the product behavior of [`ibelick/mesurer`](https://github.com/ibelick/mesurer) without copying its React architecture into the Solid implementation.

This document is a release gate, not a claim that every upstream implementation detail belongs in Mesurer Solid. Product behavior and visible interaction fidelity come first; Mesurer Solid-specific architecture such as the plugin runtime, framework-neutral public package, agent/context workflow, Arrange, host isolation, and private Solid renderer stays local where it does not change the upstream user contract.

## Current audit

- Previous pinned visual baseline: `ibelick/mesurer@605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`)
- Previous audited upstream main: `ibelick/mesurer@005f9fab396abd75b3f5324e4b0ce90cfa82d55b`
- Current audited upstream main: `ibelick/mesurer@74936ac1420d3cb214a6b78fc93e5058be1ef9f7` (`0.1.1` release commit, audited 2026-09-02)
- Upstream commits after the previous audit point: 1 large product commit (`feat: add annotate (#22)`)

The `74936ac` audit supersedes the earlier conclusion that arrow/text annotation work had been reverted. Upstream `0.1.1` now ships annotation tools as current product behavior.

## Product capability delta

| Upstream area | Mesurer Solid status | Stable-release decision |
| --- | --- | --- |
| Screenshot region selection | Implemented | First-party optional `screenshotPlugin()` |
| Clipboard PNG output | Implemented | Screenshot plugin setting/service; automatic copy is best-effort so a clipboard failure never discards a successful capture |
| Local PNG download | Implemented | Screenshot plugin setting/service plus explicit Save from the viewer |
| Chrome visible-tab capture | Implemented | Extension-only capture bridge; no new broad host permission |
| Screenshot copy/download settings | Implemented as persistent plugin state and service options | Keep feature-local instead of adding fields to the core measurement model |
| Screenshot preview | Implemented and extended beyond upstream | Persistent draggable thumbnail, bottom-right 8px default placement, viewport clamping, native image context menu, dismiss control, click-to-open viewer, Copy/Save/Close controls, and capture-status toast |
| Canonical `Mesurer` product naming | Implemented | Public APIs and examples use `Mesurer` / `mountMesurer()`; the 0.1.1 `Measurer` spellings remain only as deprecated compatibility aliases |
| Native screen Color Picker | Implemented with host capability gating | Preserve upstream native `EyeDropper` behavior where operational; hide the tool and keep `P` inert where the native sampler is unavailable or the current Codex host cannot use it |
| Color Picker active-button vs `P` behavior | Implemented | Active toolbar button toggles the result off without another native open; `P` starts a fresh native pick, matching upstream |
| Grouped **Select & Inspect** / **Annotate** tool switch | **Not implemented** | **Stable parity blocker** unless explicitly scoped out before release |
| Arrow annotations | **Not implemented** | **Stable parity blocker** |
| Freehand pen annotations | **Not implemented** | **Stable parity blocker** |
| Upstream text annotations | **Not implemented** | **Stable parity blocker**. Mesurer Solid's Text Inspector / Desired-text editing and context notes are different features and do not satisfy this upstream contract |
| Annotation selection, move/resize/rotate, multi-select, delete | **Not implemented** | **Stable parity blocker** |
| Annotation persistence and undo/redo | **Not implemented** | **Stable parity blocker** |
| Arrow/text configuration and annotation settings | **Not implemented** | **Stable parity blocker** |
| Upstream `0.1.1` shortcut/group switching and layered Escape behavior | Requires parity work with the grouped tools | Validate as part of the annotation/tool-group port rather than documenting the older shortcut model as current upstream parity |
| Other `0.1.1` inspection refinements (for example SVG targeting, layout details, click cycling, remembered tool state) | Requires focused behavior audit | Do not assume parity from source similarity; lock each adopted behavior with browser tests |
| Site/analytics/footer/build changes | Not library parity | Do not port |

## Stable-release gate

Do **not** describe Mesurer Solid as fully current with upstream `0.1.1`, and do not use this document as evidence for a stable promotion, while the blocker rows above remain unresolved.

Before stable promotion, choose one of these explicitly:

1. port the current upstream annotation/tool-group product behavior with source-first UI and interaction fidelity, adapting ownership to Mesurer Solid's composable architecture without reducing functionality; or
2. deliberately scope those features out of the first stable release and state that product difference clearly in the README, release notes, and this audit.

The default project direction is source-first parity, so option 1 is the expected path unless the release scope is intentionally changed.

A parity implementation should preserve upstream-visible behavior rather than copy React hook structure mechanically. Mesurer Solid may expose the annotation capability through a first-party plugin if that keeps the core composable, but the resulting toolbar, tools, transforms, settings, persistence, shortcuts, and Escape behavior must be validated against the pinned upstream source.

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

## Audit rule

Keep the exact upstream commit in this document. Before every stable release, re-check upstream `main`. If it moved, compare from the current audited SHA and classify the product delta before declaring parity or promoting the package.
