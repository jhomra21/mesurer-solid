# Upstream parity

Mesurer Solid started as a Solid port of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), but it is not a feature-for-feature fork. Upstream audits keep adopted behavior source-faithful and product differences explicit.

## Current audit

| Reference | Commit |
| --- | --- |
| Historical visual baseline | `605d202a4cd0404bb7a4808a11b574174bb14d1a` (`v0.0.11`) |
| Previous upstream audit | `74936ac1420d3cb214a6b78fc93e5058be1ef9f7` (`0.1.1`) |
| Current upstream audit | `91ca55768f1f9e7d6afe72e046a582e424967b91` (`0.1.4`, audited 2026-09-04) |

Upstream `main` is still at the current audited commit. No newer source delta needs classification for this documentation refresh.

For each meaningful upstream change, decide whether Mesurer Solid should **adopt**, **intentionally diverge**, or treat it as **not applicable**.

## Product decisions

| Upstream area | Mesurer Solid decision |
| --- | --- |
| Core measurement, X-ray, guides, rulers, settings | Source-first port with historical visual/interaction validation |
| Native Color Picker | Adopt where `EyeDropper` is operational; hide in unsupported hosts |
| Text Inspector | Adopt inspection behavior; visible label is **Typography**, internal id stays `text-inspector` |
| Screenshot region selection | Adopt as optional `screenshotPlugin()` and extend with preview/viewer and extension capture |
| Compact toolbar | Adopt presentation: one stable toolbar, full-height separators, active-tool retention, 150ms motion, reduced-motion support |
| Inspect/Annotate group switching | Intentionally not adopted |
| Arrange as a toolbar mode | Intentionally not adopted; Arrange remains an optional plugin tool |
| Arrow, pen, and freeform drawing annotations | Intentionally not adopted |
| Site, analytics, footer, and repository-only changes | Not library parity |

Framework-neutral mounting, the plugin runtime, Context, Arrange, direct text editing, host isolation, and the private Solid 2 renderer are Mesurer Solid-specific architecture.

## Toolbar boundary

Current upstream introduced compact/minimize motion, full-height separators, tighter group spacing, and animated Inspect/Annotate switching. Mesurer Solid adopts the presentation improvements without adopting the upstream tool-group product model.

The shipping toolbar keeps one stable tool order. Compact presentation hides inactive controls, preserves every active control and its state, and expands back to the same toolbar. Motion uses a 150ms interruptible transition and respects reduced motion. Arrange remains a normal plugin contribution.

The historical `605d202` parity suite still owns shared page/result and Settings behavior, but it predates the current toolbar shell. Toolbar chrome is excluded only from that historical geometry comparison and is covered by a dedicated current Chromium toolbar contract instead.

## Mesurer Solid extensions

### Typography and direct editing

Mesurer Solid exposes the upstream Text Inspector concept as **Typography** and adds reversible direct copy/type editing. The internal `text-inspector` id, `A` shortcut, icon, and coordination contract remain compatible.

Direct editing follows native browser editability, records Before/Desired copy and style intent, and relinquishes preview ownership when the host application changes the value itself. See [Direct text editing and Typography](./TEXT_EDITING.md).

### Arrange

Arrange records layout intent without changing application source. It activates Select automatically, keeps Arrange/Select coordination explicit, and previews Desired geometry with ownership-aware temporary transforms. See [Arrange](./ARRANGE.md).

### Context annotations

Upstream annotations are drawing objects. Mesurer Solid instead uses target- or region-bound Context notes with machine-readable target identity, geometry, measurements, styles, and review baselines. Direct text editing covers exact copy/type intent; screenshots remain visual evidence. See [Context](./CONTEXT_WORKFLOW.md).

### Screenshots

Mesurer Solid keeps the upstream region-capture interaction behind optional `mesurer-solid/screenshot`, then adapts output, preview/viewer, browser-provider, extension, and cleanup behavior to the plugin architecture. See [Screenshots](./SCREENSHOTS.md).

## Release rule

A newer upstream feature is not automatically a Mesurer Solid release blocker. A stable release is blocked when an adopted behavior has drifted, a public capability claim is false, or an important product difference is undocumented.

Before a stable release, compare upstream `main` from the current audited SHA and classify meaningful deltas as **adopt**, **intentional divergence**, or **not applicable**. Do not turn unrelated upstream repository churn into an automatic feature backlog.
