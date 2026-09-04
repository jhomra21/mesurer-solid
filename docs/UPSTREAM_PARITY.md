# Upstream parity audit

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. We audit upstream source so adopted behavior stays source-faithful and so product differences are deliberate rather than accidental.

The release question is therefore not “does Mesurer Solid contain every upstream feature?” It is:

1. does an adopted upstream interaction still match the source behavior we claim to preserve;
2. is each new upstream capability classified as adopted, intentionally different, or not relevant to this product; and
3. do the public docs describe the Mesurer Solid workflow that actually ships.

Mesurer Solid-specific architecture and workflows remain local where they serve this product better: the plugin runtime, framework-neutral public package, agent/context workflow, Arrange, direct text editing, host isolation, screenshots, and private Solid renderer.

## Current audit

- Historical pinned visual baseline: `ibelick/mesurer@605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`)
- Previous audited upstream main: `ibelick/mesurer@74936ac1420d3cb214a6b78fc93e5058be1ef9f7` (`0.1.1` release commit)
- Current audited upstream main: `ibelick/mesurer@91ca55768f1f9e7d6afe72e046a582e424967b91` (`0.1.4`, audited 2026-09-04)
- Upstream commits since the previous audit point: 16

The current upstream toolbar work adds compact/minimize motion, full-height separators, tighter group spacing, and animated Inspect/Annotate group switching. Mesurer Solid adopts the useful toolbar presentation ideas without adopting the Inspect/Annotate product model: this product keeps one stable toolbar and keeps Arrange as an ordinary optional plugin tool.

## Product capability delta

| Upstream area | Mesurer Solid status | Product decision |
| --- | --- | --- |
| Screenshot region selection | Implemented | First-party optional `screenshotPlugin()` |
| Clipboard PNG output | Implemented | Screenshot plugin setting/service; automatic copy is best-effort so a clipboard failure never discards a successful capture |
| Local PNG download | Implemented | Screenshot plugin setting/service plus explicit Save from the viewer |
| Chrome visible-tab capture | Implemented | Extension-only capture bridge; no new broad host permission |
| Screenshot copy/download settings | Implemented as persistent plugin state and service options | Keep feature-local instead of adding fields to the core measurement model |
| Screenshot preview | Implemented and extended beyond upstream | Persistent draggable thumbnail, bottom-right 8px default placement, viewport clamping, native image context menu, dismiss control, click-to-open viewer, Copy/Save/Close controls, and capture-status toast |
| Canonical `Mesurer` product naming | Implemented | Public APIs and examples use `Mesurer` / `mountMesurer()`; the old `Measurer` spellings remain only as deprecated compatibility aliases |
| Native screen Color Picker | Implemented with host capability gating | Preserve upstream native `EyeDropper` behavior where operational; hide the tool and keep `P` inert where the native sampler is unavailable or the current Codex host cannot use it |
| Color Picker active-button vs `P` behavior | Implemented | Active toolbar button toggles the result off without another native open; `P` starts a fresh native pick, matching upstream |
| Text Inspector typography inspection | Adopted and extended | Preserve the inspection behavior and internal `text-inspector` compatibility id; the user-facing Solid label is intentionally **Typography** |
| Visible Text Inspector → Typography label | Intentional Mesurer Solid divergence | Rename only the product-facing label/aria text while preserving the internal id, shortcut, icon, and interaction contract |
| Direct copy/typography editing from Select/Typography | Mesurer Solid extension | Double-click/double-tap ordinary direct text, inherit rendered typography, select all text, preview reversible copy/style intent, and expose saved `textEdit` intent to agents |
| Direct-edit formatting toolbar | Mesurer Solid extension using adopted visual language | Reuse the canonical Mesurer white toolbar surface while keeping B/I/U, Font/Size/Weight, rendered colors, and custom color directly available |
| Semantic Text/H1/H2/H3 preset popup | Mesurer Solid extension | Keep semantic presets separate from unrelated typography properties; derive only levels actually rendered and use the dominant rendered bundle for each level |
| Automatic Typography context during direct edit | Mesurer Solid extension using existing inspector primitives | Activate the visible Typography context/card for the edited field without stealing Select or interrupting Arrange |
| Page-derived font/size/weight/color suggestions | Mesurer Solid extension | Suggest styles actually rendered on the page, while keeping source implementation semantic rather than prescribing inline computed values |
| Compact/minimized toolbar presentation | Adopted and adapted from current upstream | Keep one stable toolbar. Compact presentation hides inactive tools, preserves every active tool, never mutates tool/plugin state, and expands back to the same ordered tool set |
| Full-height toolbar separators and tighter group spacing | Adopted from current upstream visual language | Group-owned padding lets separators run flush from the toolbar's top edge to bottom edge without changing tool ownership or commands |
| Interruptible compact/expand motion | Adopted and simplified from current upstream | Use the current upstream 200ms motion language for one simple `expanded ↔ compact` presentation state; respect reduced motion and avoid upstream group-switch state machinery |
| Grouped **Select & Inspect** / **Annotate** tool switch | Intentionally not adopted | Mesurer Solid deliberately keeps one stable toolbar; buttons do not change/disappear because the user entered a conceptual mode |
| Arrange as a toolbar mode | Intentionally not adopted | Arrange remains `mesurer.arrange`, an optional plugin tool with its own active state, `Shift+A`, Select coordination, settings, quick menu, Desired/Live behavior, and lifecycle |
| Arrow annotations | Intentionally not adopted | Freeform arrows are not required for the current agent workflow |
| Freehand pen annotations | Intentionally not adopted | Freeform drawing is outside the current stable product scope |
| Upstream text drawing annotations | Intentionally not adopted | Mesurer Solid uses target-bound context notes plus Typography / direct Desired-text editing instead |
| Annotation selection, move/resize/rotate, multi-select, delete | Intentionally not adopted | Those transforms belong to the upstream drawing-canvas model, which Mesurer Solid does not use |
| Drawing-annotation persistence and undo/redo | Intentionally not adopted | Mesurer Solid persists semantic annotations and review baselines through `mesurer.context` instead |
| Arrow/text drawing configuration and annotation settings | Intentionally not adopted | No drawing-tool configuration surface is needed without the drawing tools |
| Upstream group switching and layered Escape behavior | Intentionally not adopted as a group contract | Keep Mesurer Solid shortcuts coherent with its own stable toolbar/plugin workflow; source-match individual adopted tools where applicable |
| Other current inspection/keyboard refinements | Requires focused behavior audit | Evaluate individually; adopt source-first when they improve the Mesurer Solid inspection contract |
| Site/analytics/footer/build changes | Not library parity | Do not port |

## Current toolbar parity boundary

The `605d202` visual suite remains useful as a historical contract for the shared page results and Settings surface, but it predates upstream's current compact toolbar shell. It therefore no longer owns toolbar-chrome geometry.

Mesurer Solid now treats toolbar validation in two layers:

- the historical React → Solid gate continues to compare page/result/Settings behavior while explicitly excluding the evolved toolbar chrome and its direct menu-anchor offset;
- a dedicated current Chromium toolbar contract validates the shipping toolbar itself: stable tool ownership/order, compact width, active-tool retention, full-height separators, Arrange as a normal plugin, quick-menu usability, rapid transition reversal, and `prefers-reduced-motion`.

This is not a general visual-parity exception. Changes outside the explicitly evolved toolbar chrome remain subject to the historical gate, and current toolbar behavior has its own stricter product contract rather than being left untested.

## Typography is an intentional product-label divergence

The historical upstream baseline calls the inspection tool **Text inspector**. Mesurer Solid presents that same user-facing inspection concept as **Typography** because the tool also participates in direct copy/type editing and the broader name better matches its role.

This rename does not change the compatibility contract:

- internal built-in id remains `text-inspector`;
- shortcut remains `A`;
- icon and active-state semantics remain the same inspection concept;
- plugin/tool coordination continues to use the existing internal id.

The historical parity gate normalizes the exact `Text inspector` → `Typography` label difference where that old shared contract is still authoritative. Toolbar-shell geometry is now validated by the current compact-toolbar contract described above. In Settings > General, the historical comparison additionally normalizes the existing React/Solid version-token difference. No broad text or non-toolbar UI parity exception is permitted.

## Direct text editing is an explicit Mesurer Solid extension

The direct text-edit workflow is not presented as upstream source parity. It builds on adopted Mesurer visual/inspection primitives but solves a Mesurer Solid-specific human-to-agent problem:

```text
human sees rendered UI
  → double-clicks direct text while Select/Typography/Arrange-compatible Select is active
  → edits copy and typography in place
  → Typography context/card appears for that exact field
  → Select and Arrange remain active
  → Desired text/style intent is saved separately from source
  → coding agent reads `textEdits()` / `textEdit(id)`
  → agent implements the semantic source change
  → Live source is verified with Mesurer's preview inactive
```

The extension deliberately preserves UI continuity with adopted Mesurer behavior:

- the formatting strip uses the same canonical toolbar visual language;
- B/I/U, Font/Size/Weight, rendered colors, and custom color remain directly available;
- the separate semantic popup contains only Text/H1/H2/H3 presets;
- semantic presets use dominant rendered style bundles while non-dominant variants stay available as direct properties;
- typography information reuses the existing `TypographyInspector` and inspector card renderer;
- contextual Typography does not create a competing page-targeting mode;
- Arrange remains usable because direct editing works through the Select state Arrange already requires.

The current scope is ordinary elements with one unambiguous non-empty direct text node. Native form controls, `contenteditable`, and mixed/nested rich-text structures are not silently converted into a generic rich-text editor.

This is a product extension, so future upstream changes should not replace it automatically. Audit any overlapping upstream text-editing capability source-first, then decide whether to adopt, reconcile, or intentionally diverge.

See [`TEXT_EDITING.md`](./TEXT_EDITING.md) for the shipped contract.

## Why annotations intentionally differ

Current upstream treats annotation as a visual drawing surface: a person can add arrows, pen strokes, and freeform text, then manipulate those drawing objects.

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