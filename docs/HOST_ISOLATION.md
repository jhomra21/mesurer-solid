# Host isolation

Mesurer must remain visible and interactive on pages whose CSS and overlay systems were not designed around it.

Shadow DOM protects Mesurer's internal styles. Host isolation handles the rest: stacking, clipping, top-layer ordering, modal dialogs, and Mesurer-owned transient UI.

## Mounting strategy

`mountMesurer()` owns the outer host boundary.

The `[data-mesurer-island="true"]` host is a fixed zero-sized anchor with visible overflow and hardened inline `!important` values for properties a page could otherwise use to hide, move, clip, transform, or restyle it. The anchor itself does not become a viewport-sized click blocker.

When the Popover API is available, Mesurer promotes the host with `popover="manual"` / `showPopover()` so it participates in the browser top layer instead of relying only on `z-index`.

```ts
mounted.hostLayer // "top-layer" | "fixed"
```

`topLayer` defaults to true. `topLayer: false` opts into the fixed fallback.

## Later overlays and modals

A page can open another popover or enter fullscreen after Mesurer mounts. Mesurer observes relevant top-layer changes and reasserts its inspection surface. Integrations can do the same explicitly:

```ts
mounted.bringToFront()
```

Modal `<dialog>` elements need special handling because the browser makes nodes outside the active modal inert. When Mesurer observes a modal opening, it temporarily reparents its outer host into that dialog and restores the original parent when the modal closes.

Older browsers without a usable Popover API keep the hardened fixed host with a maximum practical `z-index`. That fallback cannot provide the same ordering guarantee as the browser top layer.

## Mesurer-owned overlays

Plugin and transient UI must use the same isolation boundary instead of appending unrelated page overlays.

That includes Screenshot region selection, status, thumbnail, and viewer, as well as direct text editing, formatting controls, semantic presets, and the contextual Typography card.

These surfaces must stay interactive without becoming page-inspection targets themselves, and they must clean up with the interaction or plugin that owns them.

During screenshot capture, Mesurer control chrome is hidden and then restored through the shared capture-presentation boundary.

## What is tested

Package smoke exercises the exact packed npm artifact under adversarial host conditions, including:

- broad hostile `!important` rules;
- transformed and clipped ancestors;
- extreme document overlays;
- later top-layer popovers;
- modal dialogs;
- hit testing and plugin controls;
- React, Solid 1, and Solid 2 host applications.

Rendered browser contracts separately exercise direct editing, Typography, Arrange, and Screenshot through the isolated renderer.

The goal is to defend browser primitives that many sites compose, not to special-case individual websites.

## Limits

No in-page library can guarantee visibility against browser chrome, DevTools, hostile extensions, page JavaScript that deliberately removes Mesurer, inaccessible state inside a closed ShadowRoot, or an automation/security environment that blocks injection before Mesurer executes.

Within a normal same-document modern browser application, ordinary CSS, stacking contexts, clipping, overlays, later top-layer changes, observable modal dialogs, and Mesurer-owned transient UI should not silently hide the inspector or make it unusable.

When an occlusion regression appears, reduce it to the browser primitive that caused it and fix the shared mount/plugin/renderer boundary. Do not add a hostname-specific workaround.

Trusted Types is a separate DOM-construction contract; see [Trusted Types](./TRUSTED_TYPES.md).
