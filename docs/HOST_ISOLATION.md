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

A page can open another popover or enter fullscreen after Mesurer mounts. Mesurer observes relevant top-layer changes and reasserts its inspector UI. Integrations can do the same explicitly:

```ts
mounted.bringToFront()
```

Modal `<dialog>` elements need special handling because the browser makes nodes outside the active modal inert. When Mesurer observes a modal opening, it temporarily reparents its outer host into that dialog and restores the original parent when the modal closes.

Older browsers without a usable Popover API keep the hardened fixed host with a maximum practical `z-index`. That fallback cannot provide the same ordering guarantee as the browser top layer.

## Mesurer-owned UI

Mesurer uses two managed paint domains rather than forcing every control into one overlay.

Viewport-owned controls such as the toolbar, Settings, Screenshot selection/status/viewer UI, Recording selection/status/editor UI, and other global inspector chrome stay in the protected outer host and top-layer path.

Toolbar drag ownership is also isolated. Pointer movement from toolbar chrome or a tool trigger can start a drag after the movement threshold, but menus, dialogs, form controls, editable regions, and sliders keep the pointer and do not move the toolbar. Motion's preview follows the toolbar with a compositor transform while dragging; a deliberate 14px drag on the preview detaches it, and the attach control returns it to the toolbar. Motion's snapshot refresh pauses during dragging; the page animation continues.

### macOS Electron window controls

For framed Electron windows, macOS traffic lights live outside the web content area, so the toolbar can use the full renderer viewport (with 8px padding). For frameless/custom-titlebar windows, Mesurer uses `navigator.windowControlsOverlay` when available. If the window's native controls are inside the web content but Window Controls Overlay is unavailable, the host can expose their bounds through its existing narrow renderer bridge:

```ts
window.__MESURER_HOST__ = {
  // Preserve other host capabilities such as codexBridge.
  windowControls: {
    visible: true,
    bounds: { x: 0, y: 0, width: 90, height: 42 },
  },
};
```

`bounds` is an example only: use the actual controls region in CSS viewport pixels. Set `visible: false` when the window deliberately hides native traffic lights; that also removes the top-left exclusion. The host must provide this metadata from a trusted preload/capability layer when context isolation is enabled, not by exposing Electron or Node globals. When a custom titlebar cannot report controls, a conservative upper-left exclusion remains. Electron does not otherwise expose a reliable general-purpose renderer API for arbitrary traffic-light placement.

Source-linked inspector UI may use a managed document inspector mount when browser scrolling and page-relative geometry should move it with the content it describes. Context uses this path for Add Note, its composer, saved markers and panels, and annotation ownership evidence. Ordinary source-linked Typography can use the same document-backed model.

Document-backed nodes are still Mesurer UI. They carry the inspector hit-test boundary, use a runtime-owned mount, and clean up with the interaction or plugin that created them. Do not append unrelated unmanaged overlays to `document.body`.

When a document-backed inspector must occlude page selection evidence, the related Select paint must use the lower document evidence layer too. A browser top-layer node outranks ordinary document `z-index`, so keeping Select hover in the top-layer island while a Context card lives in the document would allow blue hover paint to cross the card. Context therefore moves Select hover into the document evidence layer while its document-backed annotation UI owns that page region, including non-isolated source mounts that still use browser top-layer promotion.

During screenshot capture, Mesurer control chrome is hidden and then restored through the shared capture-presentation boundary. Native host capture, Chromium extension capture, and browser display capture all use that path. If a selected native or extension capture path fails, Screenshot reports the error instead of switching to another permission model.

## What is tested

Package smoke exercises the exact packed npm artifact under adversarial host conditions, including:

- broad hostile `!important` rules;
- transformed and clipped ancestors;
- extreme document overlays;
- later top-layer popovers;
- modal dialogs;
- hit testing and plugin controls;
- React, Solid 1, and Solid 2 host applications;
- a packed Electron renderer with context isolation and sandboxing enabled and Node integration disabled.

Rendered browser contracts separately exercise direct editing, Typography, Edit movement, Screenshot, Recording, Context document ownership, toolbar pointer ownership, and Inspect hit testing. Inspect coverage includes SVG targets, pointer-transparent descendants, overlapping page targets, transformed elements, canvas, closed Shadow DOM boundaries, and a large DOM fixture. Context coverage includes source-attached window and nested scrolling, repeated-note marker placement, one clean annotation ownership edge, and create/saved annotation cards occluding real Select hover in a non-isolated browser top-layer host.

The goal is to defend browser behavior that many sites compose, not to special-case individual websites.

## Limits

No in-page library can guarantee visibility against browser chrome, DevTools, hostile extensions, page JavaScript that deliberately removes Mesurer, inaccessible state inside a closed ShadowRoot, or an automation/security environment that blocks injection before Mesurer executes.

Within a normal same-document modern browser application, ordinary CSS, stacking contexts, clipping, overlays, later top-layer changes, observable modal dialogs, and Mesurer-owned transient UI should not silently hide the inspector or make it unusable.

When an occlusion regression appears, reduce it to the browser behavior that caused it and fix the shared mount/plugin/renderer boundary. Do not add a hostname-specific workaround.

Trusted Types is a separate DOM-construction contract; see [Trusted Types](./TRUSTED_TYPES.md).
