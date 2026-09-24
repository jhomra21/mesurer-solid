# Mesurer Solid renderer

Internal Solid 2 renderer for Mesurer Solid. Application users should install `mesurer-solid`, not this workspace.

The public package bundles this renderer and its Solid 2 runtime into an isolated browser island, so host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

This workspace owns the visible inspector UI, compact toolbar, measurement overlays, Typography/direct editing presentation, Arrange and Screenshot UI, and browser coordination around the framework-neutral model/plugin host. Screenshot capture adapters stay private here. The public package exposes `screenshot()` and `MesurerScreenshotService`, not host-specific capture factories.

Current runtime contracts include general `Element` selection, SVG inspection, ownership-aware text/style previews, inherited `contenteditable` boundaries, HTML-only Arrange transforms, thresholded toolbar dragging, and cancellable plugin setup. Menus, dialogs, form controls, editable regions, and sliders keep pointer ownership instead of moving the toolbar. Browser contracts cover these interactions in real Chromium; historical and current visual-parity checks protect the adopted Mesurer UI behavior.

Use the repository root scripts for normal development. The basic example aliases renderer source directly, so renderer TSX must also parse under Vite's dependency scan. The root `bun run dev` CI smoke covers that path. Renderer-only checks can use the `@jhomra21/mesurer-solid-renderer` workspace filter.
