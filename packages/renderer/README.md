# Mesurer Solid renderer

Internal Solid 2 renderer for Mesurer Solid. Application users should install `mesurer-solid`, not this workspace.

The public package bundles this renderer and its Solid 2 runtime into an isolated browser island, so host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

This workspace owns the visible inspector UI, compact toolbar, measurement overlays, Typography/direct editing presentation, Arrange and Screenshot UI, and browser-facing coordination around the framework-neutral model/plugin host.

Current runtime contracts include ownership-aware text/style previews, inherited `contenteditable` boundaries, ownership-aware Arrange transforms, and cancellable plugin setup. Browser contracts cover these interactions in real Chromium; historical and current visual-parity checks protect the adopted Mesurer UI surface.

Use the repository root scripts for normal development. Renderer-only checks can use the `@jhomra21/mesurer-solid-renderer` workspace filter.
