# Design language

Mesurer UI should look like one compact inspection tool even when a feature is implemented by a separate plugin or document-backed runtime.

This document is the review contract for new Mesurer-owned UI. It describes shared visual decisions, not feature behavior or browser ownership rules.

## Surfaces

Use the existing accepted surfaces as the first reference before adding feature-specific chrome.

For new or deliberately refreshed floating UI, current upstream Mesurer is the design reference: 8px floating surfaces, a 5px control radius, and the shared floating-shadow recipe below. Existing Mesurer Solid surfaces that are protected by visual-parity contracts keep their accepted chrome until they are migrated in a dedicated visual change.

- Reuse an existing Mesurer Solid surface when it already matches the feature.
- New floating white controls, menus, inspectors, and review cards should use the current upstream 8px surface geometry and floating-shadow language.
- New small controls should use the current upstream 5px control radius unless their geometry has a stronger interaction reason.
- The toolbar keeps its accepted Solid-specific motion and clipping structure unless a toolbar-focused parity change deliberately updates it.
- Source evidence such as selection outlines, measurement geometry, guide lines, and annotation ownership edges is not a floating surface. Do not give evidence cards, borders, or shadows just to make it look like UI.
- Dark transient previews may keep feature-specific presentation when the background itself carries the hierarchy.

The shared floating shadow follows current upstream Mesurer:

```css
0 0 0 0.4px rgba(0, 0, 0, 0.22),
0 6px 18px rgba(0, 0, 0, 0.03),
0 3px 9px rgba(0, 0, 0, 0.06),
0 1px 1px rgba(0, 0, 0, 0.06)
```

Do not add a new one-off shadow or floating-card radius without a product reason. Do not restyle an accepted existing surface merely to satisfy this document; visual migrations must go through the normal parity/acceptance path.

## Color and hierarchy

Mesurer is light, neutral, and compact.

- White is the default control surface.
- The ink scale carries normal hierarchy. Prefer existing `ink` tokens to new grays.
- `#0d99ff` is the established active/selection accent. Reserve it for active state, selection, focus, and source-linked evidence rather than decoration.
- Borders should not compete with the floating shadow. Keep a border only when it communicates a control boundary or preserves interaction geometry.
- Text labels stay quiet. Feature names and primary actions can be stronger; supporting metadata should use the muted ink range.

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
