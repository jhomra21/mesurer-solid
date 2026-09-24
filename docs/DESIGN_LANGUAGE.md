# Design language

Mesurer UI should look like one compact inspection tool even when a feature is implemented by a separate plugin or document-backed runtime.

This document is the review contract for new Mesurer-owned UI. It describes shared visual decisions, not feature behavior or browser ownership rules.

## Surfaces

Use the existing accepted surfaces as the first reference before adding feature-specific chrome.

The current audited upstream reference is `d47fd6056a01da9c442ae04840ec4d0dd46a1257`. Use its shared theme colors, 8px floating surfaces, 5px control radius, control density, and floating shadows when porting or changing upstream-owned UI. Existing Mesurer Solid surfaces keep their accepted geometry until a focused parity change updates them.

- Reuse an existing Mesurer Solid surface when it already matches the feature.
- New floating controls, menus, inspectors, and review cards should use the shared surface and shadow tokens instead of hard-coded light colors.
- New small controls should use the current upstream 5px control radius unless the source component uses different geometry.
- The toolbar keeps its accepted Solid-specific motion and clipping structure unless a toolbar-focused parity change deliberately updates it.
- Source evidence such as selection outlines, measurement geometry, guide lines, and annotation ownership edges is not a floating surface. Do not give evidence cards, borders, or shadows just to make it look like UI.
- Dark transient previews may keep feature-specific presentation when the background itself carries the hierarchy.

Use `--msr-shadow-floating` and `--msr-shadow-toolbar` for Mesurer-owned floating surfaces. The values change with the active theme. Do not copy the light shadow into a new component or add another shadow without a product reason.

## Color and hierarchy

Mesurer uses neutral light and dark palettes. The active mode is System, Light, or Dark, and System follows `prefers-color-scheme`.

- Use `--msr-surface`, `--msr-surface-raised`, and the `--msr-color-ink-*` scale for Mesurer-owned UI.
- Use `--msr-content` for primary text instead of a hard-coded black value.
- The active accent is `--msr-accent`. It resolves to the upstream light or dark accent and is reserved for active state, selection, focus, and source-linked evidence.
- Borders should not compete with the floating shadow. Keep a border only when it communicates a control boundary or preserves interaction geometry.
- Theme state belongs to each Mesurer instance. Do not set theme variables on the inspected page root.
- Document-backed Context, Typography, direct-edit, and selection surfaces must receive the same theme as their owning renderer.

## Density and typography

Mesurer is an inspector, not an application dashboard.

- Keep controls small enough to scan beside the inspected page.
- Prefer the existing 4px spacing rhythm.
- Reuse toolbar, menu, settings, and inspector typography before introducing another text scale.
- Avoid explanatory copy inside the persistent chrome when a tooltip, accessible label, or documentation is sufficient.

## Motion

Motion explains ownership or state; it should not decorate the tool.

- Reuse existing toolbar/menu timing and reduced-motion behavior.
- Do not animate source evidence in a way that makes measurements lag behind the page.
- Floating surfaces should enter, close, or retarget without overshoot.
- Any intermediate-frame positioning or resize change needs a rendered browser contract, not only an end-state assertion.

## Interaction ownership

Visual consistency does not override browser ownership. Pointer and accessibility state must describe the same owner the user sees.

- Toolbar drag starts only after the drag threshold. Pressing a Settings, Guide, or plugin trigger may become a toolbar drag; if it does, close the trigger's open transient surface when the drag actually starts, not on pointer down.
- Pointer activity inside menus, dialogs, form controls, editable regions, and sliders belongs to that control and must not move the toolbar.
- A trigger that owns an expandable menu or panel exposes its current open state through `aria-expanded`. Keep the accessibility state synchronized with the rendered surface.
- Opening one transient surface should not leave another unrelated toolbar surface claiming pointer or focus ownership.


- Viewport-owned chrome stays in the protected host/top-layer path.
- Source-linked UI stays attached to its source using the established document inspector/native-anchor paths.
- New surfaces must participate in Mesurer hit-test ownership so page targets cannot paint or receive clicks through them.
- Do not move a source-linked surface into the toolbar host only to simplify styling.

See [Host isolation](./HOST_ISOLATION.md) for the browser rules behind those choices.

## Review checklist

Before merging a new UI feature or surface:

1. Classify it as source evidence, a source-linked inspector, or viewport-owned chrome.
2. Find the nearest accepted Mesurer Solid surface before creating a new visual pattern.
3. If the UI ports or updates an upstream component, compare it with the current audited upstream component, not only the historical renderer baseline.
4. Match the source component's control geometry, icons, spacing, typography, colors, shadows, and visible states. Add a current-source browser parity check when pixels or layout can drift.
5. State any deliberate visual difference in the feature PR instead of hiding it in implementation detail.
6. Check keyboard focus, `aria-expanded` or equivalent state, outside-click/Escape dismissal, and competing transient-surface ownership.
7. Verify pointer ownership from both sides. Toolbar drag sources must drag after threshold, while controls inside open surfaces must not.
8. Verify System, Light, and Dark appearance when the new surface uses Mesurer theme tokens.
9. Verify compact and expanded toolbar states when the feature contributes a toolbar control.
10. Verify isolated and non-isolated mounts when shared renderer chrome or document-backed UI changes.
11. Add a browser contract for visible geometry, hit testing, focus, or intermediate motion that can regress.
12. Keep feature behavior in its owning guide. Update this document only when the shared design rules change.

Do not force unrelated tools into the same layout. When Mesurer Solid adopts a React Mesurer component, however, its visible presentation should match that component unless the product decision documents a difference.
