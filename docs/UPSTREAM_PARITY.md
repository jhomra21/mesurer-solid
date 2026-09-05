# Upstream parity

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. We audit upstream source so adopted behavior stays source-faithful and product differences stay deliberate.

## Current audit

| Reference | Commit |
| --- | --- |
| Historical visual baseline | `605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`) |
| Previous upstream audit | `74936ac1420d3cb214a6b78fc93e5058be1ef9f7` (`0.1.1`) |
| Current upstream audit | `91ca55768f1f9e7d6afe72e046a582e424967b91` (`0.1.4`, audited 2026-09-04) |

Upstream `main` is still at the current audited commit. No newer source delta needs classification as of this documentation refresh.

The audit asks three questions:

1. Does an adopted interaction still match the source behavior we claim to preserve?
2. Is a new upstream capability adopted, intentionally different, or irrelevant to this product?
3. Do Mesurer Solid's public docs describe what actually ships?

## Current product decisions

| Upstream area | Mesurer Solid |
| --- | --- |
| Core measurement, X-ray, guides, rulers, settings | Source-first port with historical visual/interaction validation |
| Native Color Picker | Adopted where `EyeDropper` is operational; hidden in unsupported hosts |
| Typography inspection | Adopted; visible label is **Typography**, internal id remains `text-inspector` |
| Screenshot region selection | Optional first-party `screenshotPlugin()` with clipboard/download, preview, viewer, and extension capture bridge |
| Compact toolbar | Adopted and simplified: one stable toolbar, full-height separators, active-tool retention, 150ms motion, reduced-motion support |
| Inspect/Annotate group switch | Intentionally not adopted |
| Arrange as a toolbar mode | Intentionally not adopted; Arrange remains an optional plugin tool |
| Arrow, pen, and freeform drawing annotations | Intentionally not adopted |
| Site, analytics, footer, and repository-only changes | Not library parity |

Mesurer Solid-specific architecture remains local where it serves this product: framework-neutral mounting, plugins, agent/context workflows, Arrange, direct text editing, screenshots, host isolation, and the private Solid 2 renderer.

## Toolbar boundary

Current upstream added compact/minimize motion, full-height separators, tighter group spacing, and animated Inspect/Annotate switching. Mesurer Solid adopted the presentation improvements without adopting the upstream tool-group product model.

The shipping contract is:

- one stable toolbar and tool order;
- compact mode hides inactive controls but preserves every active control and its state;
- expanding restores the full toolbar without reordering or changing commands;
- separators run from the top to bottom edge of the toolbar;
- compact/expand motion uses a 150ms interruptible transition and respects reduced motion;
- Arrange remains a normal optional plugin tool.

The historical `605d202` parity suite still owns page/result and Settings behavior, but it predates the current toolbar shell. Toolbar chrome is therefore excluded only from that historical geometry comparison and is covered by a dedicated Chromium toolbar contract instead. This is a narrow boundary, not a general visual-parity exception.

## Typography and direct editing

Upstream calls the inspection tool Text Inspector. Mesurer Solid presents it as Typography because it also participates in direct copy/type editing. The internal `text-inspector` id, shortcut `A`, icon, and coordination contract remain compatible.

Direct text editing is a Mesurer Solid extension. It reuses the adopted typography/card and toolbar language but adds reversible copy/style intent and agent APIs.

The target contract follows native browser editing semantics. Form controls and content that inherits `contenteditable` stay under application/browser editing. A nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer direct-text target when it otherwise satisfies the normal rules.

While Mesurer still owns a text/style preview, undo and redo update the rendered Desired value. If the host changes the text or inline style itself, Mesurer relinquishes ownership and preserves the host value through later history and cleanup.

If Typography is explicitly selected before direct editing starts, the normal hover/pinned Typography surface is temporarily suppressed so the active field has one live card. Closing the edit restores the normal surface without deselecting Typography.

See [Direct text editing and Typography](./TEXT_EDITING.md).

## Arrange

Arrange is a Mesurer Solid extension for layout intent. It can be activated before a selection exists and enables Select automatically. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Arrange previews Desired geometry with a temporary inline transform. It restores a prior transform only while the current value and priority still match the exact preview Mesurer applied. If the host application changes the transform, Mesurer preserves that host value and relinquishes the old preview ownership rather than restoring an obsolete baseline.

See [Arrange](./ARRANGE.md).

## Annotations intentionally differ

Current upstream annotation is a drawing surface: arrows, pen strokes, freeform text, selection, transforms, and drawing-state persistence.

Mesurer Solid uses target-bound Context notes instead. A note can carry selected target identity, geometry, measurements, distances, guides, computed styles, and an immutable review baseline. Coding agents can read that semantic context directly instead of inferring what a drawing points at.

Direct text editing covers exact copy/typography intent, while screenshots remain visual evidence rather than the transport for structured annotation state.

See [Context workflow](./CONTEXT_WORKFLOW.md).

## Screenshot architecture

Mesurer Solid keeps the upstream screenshot interaction while fitting it into the plugin architecture:

- `mesurer-solid/screenshot` is optional;
- the plugin owns region selection, output preferences, capture service, preview/viewer UI, and cleanup;
- clipboard and download outputs are best-effort and never discard a successful capture;
- normal browser hosts use `getDisplayMedia()`;
- the Chromium extension uses `chrome.tabs.captureVisibleTab()` through its existing `activeTab` grant;
- Mesurer chrome is hidden through the normal capture presentation boundary.

See [Screenshots](./SCREENSHOTS.md).

## Release rule

A newer upstream feature is not automatically a Mesurer Solid release blocker. A stable release is blocked when an adopted behavior has drifted, a public capability claim is false, or an important product difference is undocumented.

Before a stable release, compare upstream `main` from the current audited SHA and classify meaningful deltas as **adopt**, **intentional divergence**, or **not applicable**. Do not turn upstream repository churn into an automatic feature backlog.
