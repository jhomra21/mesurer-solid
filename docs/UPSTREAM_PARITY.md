# Upstream parity audit

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. We audit upstream source so adopted behavior stays source-faithful and so product differences are deliberate rather than accidental.

The release question is therefore not “does Mesurer Solid contain every upstream feature?” It is:

1. does an adopted upstream interaction still match the source behavior we claim to preserve;
2. is each new upstream capability classified as adopted, intentionally different, or not relevant to this product; and
3. do the public docs describe the Mesurer Solid workflow that actually ships.

Mesurer Solid-specific architecture and workflows remain local where they serve this product better: the plugin runtime, framework-neutral public package, agent/context workflow, Arrange, direct text editing, host isolation, screenshots, and private Solid renderer.

## Current audit

- Previous pinned visual baseline: `ibelick/mesurer@605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`)
- Previous audited upstream main: `ibelick/mesurer@005f9fab396abd75b3f5324e4b0ce90cfa82d55b`
- Current audited upstream main: `ibelick/mesurer@74936ac1420d3cb214a6b78fc93e5058be1ef9f7` (`0.1.1` release commit, audited 2026-09-02)
- Upstream commits after the previous audit point: 1 large product commit (`feat: add annotate (#22)`)

The `74936ac` audit supersedes the earlier conclusion that arrow/text annotation work had been reverted. Upstream `0.1.1` now ships those drawing tools. Mesurer Solid intentionally does not adopt that annotation/tool-group workflow for the current product.

## Product capability delta

| Upstream area | Mesurer Solid status | Product decision |
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
| Text Inspector typography inspection | Adopted and extended | Preserve the existing typography inspection contract, then reuse the same typography/card primitives for contextual direct-edit information |
| Direct copy/typography editing from Select/Text Inspector | Mesurer Solid extension | Double-click/double-tap ordinary direct text, inherit rendered typography, select all text, preview reversible copy/style intent, and expose saved `textEdit` intent to agents |
| Direct-edit formatting toolbar | Mesurer Solid extension using adopted visual language | Reuse the canonical Mesurer white toolbar surface/spacing/control states instead of creating a separate editor visual system |
| Automatic Text Inspector card during direct edit | Mesurer Solid extension using existing inspector primitives | Show the edited field's Family/Size/Weight/Line/Tracking context without globally switching Text Inspector mode or interrupting Arrange |
| Page-derived font/size/weight/color suggestions | Mesurer Solid extension | Suggest styles actually rendered on the page, while keeping source implementation semantic rather than prescribing inline computed values |
| Grouped **Select & Inspect** / **Annotate** tool switch | Intentionally not adopted | Mesurer Solid keeps its existing inspector/plugin toolbar because its primary review flow is context-first rather than drawing-tool-first |
| Arrow annotations | Intentionally not adopted | Freeform arrows are not required for the current agent workflow |
| Freehand pen annotations | Intentionally not adopted | Freeform drawing is outside the current stable product scope |
| Upstream text drawing annotations | Intentionally not adopted | Mesurer Solid uses target-bound context notes plus Text Inspector / direct Desired-text editing instead |
| Annotation selection, move/resize/rotate, multi-select, delete | Intentionally not adopted | Those transforms belong to the upstream drawing-canvas model, which Mesurer Solid does not use |
| Drawing-annotation persistence and undo/redo | Intentionally not adopted | Mesurer Solid persists semantic annotations and review baselines through `mesurer.context` instead |
| Arrow/text drawing configuration and annotation settings | Intentionally not adopted | No drawing-tool configuration surface is needed without the drawing tools |
| Upstream `0.1.1` shortcut/group switching and layered Escape behavior | Intentionally not adopted as a group contract | Keep Mesurer Solid shortcuts coherent with its own toolbar/plugin workflow; source-match individual adopted tools where applicable |
| Other `0.1.1` inspection refinements (for example SVG targeting, layout details, click cycling, remembered tool state) | Requires focused behavior audit | Evaluate individually; adopt source-first when they improve the Mesurer Solid inspection contract |
| Site/analytics/footer/build changes | Not library parity | Do not port |

## Direct text editing is an explicit Mesurer Solid extension

The direct text-edit workflow is not presented as upstream source parity. It builds on adopted Mesurer visual/inspection primitives but solves a Mesurer Solid-specific human-to-agent problem:

```text
human sees rendered UI
  → double-clicks direct text while Select/Text Inspector/Arrange-compatible Select is active
  → edits copy and typography in place
  → Mesurer shows existing Text Inspector information for that exact field
  → Desired text/style intent is saved separately from source
  → coding agent reads `textEdits()` / `textEdit(id)`
  → agent implements the semantic source change
  → Live source is verified with Mesurer's preview inactive
```

The extension deliberately preserves UI continuity with adopted Mesurer behavior:

- the formatting strip uses the same canonical toolbar visual language;
- typography information reuses the existing `TypographyInspector` and Text Inspector card renderer;
- the contextual card does not create a competing Text Inspector mode;
- Arrange remains usable because direct editing works through the Select state Arrange already requires.

The current scope is ordinary elements with one unambiguous non-empty direct text node. Native form controls, `contenteditable`, and mixed/nested rich-text structures are not silently converted into a generic rich-text editor.

This is a product extension, so future upstream changes should not replace it automatically. Audit any overlapping upstream text-editing capability source-first, then decide whether to adopt, reconcile, or intentionally diverge.

See [`TEXT_EDITING.md`](./TEXT_EDITING.md) for the shipped contract.

## Why annotations intentionally differ

Upstream `0.1.1` treats annotation as a visual drawing surface: a person can add arrows, pen strokes, and freeform text, then manipulate those drawing objects.

Mesurer Solid uses annotation for a different job. A context annotation is attached to the rendered target or region the person selected and stores structured evidence with the note: target identity, geometry, measurements, distances, guides, computed styles, layout information, and an immutable review baseline.

That means a coding agent does not need to infer what a drawn arrow points at or recover intent from screenshot pixels. It can read the selected target and its related context directly through `window.__MESURER__`, edit source, then call `review()` against the same semantic baseline.

```text
human selects/highlights rendered UI + adds note
                 ↓
        target-bound Mesurer context
                 ↓
           coding agent reads it
                 ↓
              source edit
                 ↓
       fresh context / review()
```

Direct text editing complements this distinction: when the human wants to specify exact copy/typography rather than write a note about it, the Desired text/style intent is machine-readable and target-bound instead of being a freeform text drawing.

Screenshots remain useful for visual composition, evidence, or other human workflows, but they are not the transport for Mesurer Solid annotation or direct-text intent. This is an intentional product distinction, not an incomplete port.

See [`CONTEXT_WORKFLOW.md`](./CONTEXT_WORKFLOW.md) for the full agent-first review model.

## Stable-release rule

The upstream drawing annotation/tool-group surface listed above is **not a blocker for Mesurer Solid stable release**. It is explicitly outside the current product scope.

A stable release is blocked when one of these is true:

- Mesurer Solid publicly claims an upstream capability that it does not actually implement;
- an upstream behavior we intentionally adopted has drifted in a way that breaks the user contract we claim to preserve;
- a new upstream change exposes a regression or missing behavior in an already-adopted Mesurer Solid feature; or
- the current product differences have not been classified/documented clearly enough for users to understand what ships.

A newer upstream feature is not automatically a release blocker merely because it exists. Audit it, decide whether it belongs in Mesurer Solid, and record that decision here.

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

Keep the exact upstream commit in this document. Before every stable release, re-check upstream `main`. If it moved, compare from the current audited SHA and classify each meaningful product delta as:

- **adopt** — preserve the relevant source-visible behavior and validate it;
- **intentional divergence** — document why Mesurer Solid's workflow differs; or
- **not applicable** — do not port repository/site/internal changes that do not belong to the library.

Do not turn upstream churn into an automatic feature backlog. The purpose of the audit is to prevent accidental drift while keeping Mesurer Solid's product direction explicit.