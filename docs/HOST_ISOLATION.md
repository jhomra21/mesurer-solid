# Host isolation

Mesurer must remain visible and interactive on pages whose CSS and overlay systems were not designed around it.

Shadow DOM protects Mesurer's internal selectors and styles, but the outer host still participates in the document. Host isolation therefore also covers stacking, clipping, top-layer ordering, modal dialogs, and transient plugin/editor UI.

## Host strategy

`mountMesurer()` owns the outer host boundary.

The `[data-mesurer-island="true"]` host is a fixed zero-sized anchor with visible overflow and hardened inline `!important` values for properties a page could otherwise use to hide, move, clip, transform, or restyle it. The anchor itself does not become a viewport-sized click blocker.

When the Popover API is available, Mesurer promotes the host with `popover="manual"` / `showPopover()` so it participates in the browser top layer rather than relying only on `z-index`.

```ts
mounted.hostLayer // "top-layer" | "fixed"
```

`topLayer` defaults to true. `topLayer: false` opts into the fixed fallback.

## Later overlays and modal dialogs

A page can open another popover or enter fullscreen after Mesurer mounts. Mesurer observes relevant top-layer changes and reasserts its inspection surface. Integrations can also request this explicitly:

```ts
mounted.bringToFront()
```

Modal `<dialog>` elements are different because the browser makes nodes outside the active modal inert. When Mesurer observes a modal opening, it temporarily reparents its outer host into the dialog and restores the original parent when the modal closes.

Older browsers without a usable Popover API keep the hardened fixed host with a maximum practical `z-index`. That fallback cannot guarantee the same ordering as the browser top layer.

## Plugin and transient UI

Mesurer-owned UI must use the same isolation boundary instead of appending arbitrary page overlays.

This includes Screenshot region selection, status, thumbnail, and viewer, as well as direct text editing, formatting controls, semantic presets, and the contextual Typography card.

Transient UI must remain above its page target, stay outside host framework ownership, avoid becoming a Mesurer page target itself, and clean up with its owning interaction/plugin.

During screenshot capture, Mesurer control chrome is hidden and restored through the capture presentation boundary. Human evidence that a capture mode intentionally retains follows that mode's rules; camera/editor controls themselves are never part of the captured subject.

## Exact packed-artifact tests

Package smoke exercises the built npm artifact under adversarial host conditions rather than maintaining website-specific hacks. The test covers broad hostile `!important` rules, transformed/clipped ancestors, extreme overlays, later popovers, modal dialogs, hit testing, and plugin controls across React, Solid 1, and Solid 2 consumers.

Rendered browser contracts separately exercise direct text editing, contextual Typography, Arrange coordination, and Screenshot interaction through the real isolated renderer.

The goal is to defend browser primitives that many sites compose, not to special-case YouTube, Figma, or another hostname.

## Limits

No in-page library can guarantee visibility against browser chrome, DevTools, hostile extensions, page JavaScript that deliberately removes Mesurer, inaccessible state inside a closed ShadowRoot, or an automation/security environment that blocks injection before Mesurer executes.

Within a normal same-document modern browser application, ordinary CSS, stacking contexts, clipping, overlays, later top-layer changes, observable modal dialogs, and Mesurer-owned plugin/editor UI should not silently hide the inspector or make it unusable.

When an occlusion regression appears, reduce it to the browser primitive that caused it, add an adversarial regression, and fix the shared mount/plugin/renderer boundary. Do not add a hostname check.

Trusted Types is a separate startup/DOM-construction contract; see [Trusted Types](./TRUSTED_TYPES.md).
