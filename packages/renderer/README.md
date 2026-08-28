# Mesurer Solid renderer (internal)

This workspace contains Mesurer's Solid 2 reference UI renderer. It is an implementation detail and is not published for users to install directly.

The public package is `mesurer-solid`. It bundles this renderer and its Solid 2 runtime into an isolated browser island so the host application can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

The framework-neutral state, plugin host, DOM measurement primitives, universal mount API, and agent harness live outside this renderer workspace.

The renderer also owns the UI implementation of the optional first-party screenshot plugin: region selection, capture presentation, HiDPI crop helpers, persistent draggable preview, full Copy/Save viewer, and capture-status feedback. Consumers access that feature through the public `mesurer-solid/screenshot` entry instead of importing this private workspace.

For repository development, use the root scripts. Renderer-specific checks can be run with the `@jhomra21/mesurer-solid-renderer` workspace filter.

The visual-parity workflow keeps the existing upstream-derived UI contract intact. Screenshot-specific behavior is additionally covered by the dedicated screenshot browser contract so the real plugin lifecycle, crop scaling, preview/viewer interactions, and capture-chrome hiding remain regression-tested.
