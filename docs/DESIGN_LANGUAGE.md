# Design language

Mesurer UI should look like one compact inspection tool even when a feature is implemented by a separate plugin or document-backed runtime.

This document is the review contract for new Mesurer-owned UI. It describes shared visual decisions, not feature behavior or browser ownership rules.

## Surfaces

Use the existing accepted surfaces as the first reference before adding feature-specific chrome.

Current upstream Mesurer at `c20ad51` is the reference for shared theme colors, 8px floating surfaces, 5px control radii, and floating shadows. Mesurer Solid adopts those theme tokens while keeping its existing feature geometry and ownership rules.

- Reuse an existing Mesurer Solid surface when it already matches the feature.
- New floating controls, menus, inspectors, and review cards should use the shared surface and shadow tokens instead of hard-coded light colors.
- New small controls should use the current upstream 5px control radius unless their geometry has a stronger interaction reason.
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

## Ownership

Visual consistency does not override browser ownership.

- Viewport-owned chrome stays in the protected host/top-layer path.
- Source-linked UI stays attached to its source using the established document inspector/native-anchor paths.
- New surfaces must participate in Mesurer hit-test ownership so page targets cannot paint or receive clicks through them.
- Do not move a source-linked surface into the toolbar host only to simplify styling.

See [Host isolation](./HOST_ISOLATION.md) for the browser rules behind those choices.

## Review checklist

Before merging a new UI feature or surface:

1. Identify whether it is source evidence, a source-linked inspector, or viewport-owned chrome.
2. Reuse an existing surface class/token and control radius before creating styling.
3. Compare it with the nearest existing Mesurer surface and current upstream Mesurer.
4. Check keyboard focus, outside-click/Escape dismissal, and competing transient-surface ownership.
5. Verify compact and expanded toolbar states if the feature appears in the toolbar.
6. Verify isolated and non-isolated mounts when shared renderer chrome changes.
7. Add a browser contract for visible geometry, hit testing, or intermediate motion that can regress.
8. Keep feature behavior in its own guide; update this document only when the shared design language changes.

The goal is not pixel uniformity between unrelated tools. The goal is one visual system with explicit exceptions.
