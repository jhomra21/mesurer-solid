# Mesurer Solid renderer (internal)

This workspace contains Mesurer's Solid 2 reference UI renderer. It is an implementation detail and is not published for users to install directly.

The public package is `@jhomra21/mesurer-solid`. It bundles this renderer and its Solid 2 runtime into an isolated browser island so the host application can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

The framework-neutral state, plugin host, DOM measurement primitives, universal mount API, and agent harness live outside this renderer workspace.

For repository development, use the root scripts. Renderer-specific checks can be run with the `@jhomra21/mesurer-solid-renderer` workspace filter.

The visual-parity workflow compares this renderer with the pinned React upstream implementation and keeps the existing UI contract intact.
