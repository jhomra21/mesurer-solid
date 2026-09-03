# Trusted Types renderer contract

Mesurer must be able to start and operate on host pages that enforce Trusted Types without asking the page to weaken its Content Security Policy.

This is a separate contract from [host-page isolation](./HOST_ISOLATION.md):

- **Trusted Types compatibility** answers whether Mesurer's renderer and transient UI can create DOM under a strict CSP without requiring unsafe HTML-string sinks.
- **Host-page isolation** answers whether an already-mounted Mesurer UI remains visible and interactive despite stacking contexts, clipping, overlays, popovers, and modal dialogs.

Both contracts must hold for the browser integration to be reliable on complex sites such as YouTube.

## The failure mode

A page can send a policy such as:

```text
Content-Security-Policy:
  require-trusted-types-for 'script';
  trusted-types 'none'
```

Under that policy, browser APIs that parse strings as HTML become Trusted Types sinks. A renderer that turns compiled JSX templates into DOM by assigning strings through sinks such as `innerHTML` can fail during startup before the Mesurer toolbar exists.

Mesurer must not solve this by weakening the page's CSP, injecting a permissive Trusted Types policy, or asking the host application to opt out of its security policy.

## Renderer invariant

The private Solid 2 renderer is compiled with Solid's **universal** JSX transform rather than the optimized DOM-template transform.

`packages/renderer/vite.config.ts` points the compiler at Mesurer's private DOM runtime:

```ts
solid({
  solid: {
    generate: "universal",
    moduleName: "@mesurer/solid-dom",
  },
})
```

`packages/renderer/src/solid-dom.ts` then builds the real DOM through node APIs such as:

```text
document.createElement()
document.createElementNS()
document.createTextNode()
Element.setAttribute()
CSSStyleDeclaration.setProperty()
Node.insertBefore()
```

Static JSX props are applied through the same property/attribute path. The renderer does not need to parse compiled static JSX through an HTML-string sink during startup.

Solid 2's custom-renderer runtime comes from `@solidjs/universal`. This renderer remains private implementation detail; host applications consume the framework-neutral `mesurer-solid` package and do not need to provide Solid 2 or `@solidjs/universal` themselves.

## Transient direct-editor UI follows the same rule

Direct text editing is created at runtime rather than from a permanent JSX component, but it must preserve the same Trusted Types boundary.

The in-place textarea, Mesurer-style formatting controls, options/swatches, and automatic Text Inspector information card are built from DOM nodes and text/property/style operations. They must not introduce `innerHTML`, HTML-string template parsing, or a TrustedHTML policy as a shortcut for transient UI creation.

The target text itself is edited through its resolved text node. Mesurer does not serialize the host component to HTML and reparse it merely to preview Desired copy/style.

This matters because direct editing is part of the same mounted/injected renderer on arbitrary pages; it does not get a separate CSP exemption just because the UI is transient. See [`TEXT_EDITING.md`](./TEXT_EDITING.md) for the interaction/runtime ownership contract.

## Exact-artifact regression test

The package-smoke suite tests the artifact that would actually be published to npm, not just workspace source.

It starts a browser page whose response includes:

```text
require-trusted-types-for 'script'; trusted-types 'none'
```

The test then evaluates the packed `inject-script` payload through the existing browser harness and requires all of the following:

1. `window.__MESURER__` initializes.
2. `await window.__MESURER__.ready()` completes.
3. The real Mesurer toolbar exists inside the isolated ShadowRoot.
4. A visible toolbar button can be clicked and changes state.
5. `inspect("h1")` returns real, non-zero rendered geometry.
6. The stable built-in command surface initializes.
7. The same page also passes Mesurer's hostile host-isolation checks for CSS, extreme overlays, later popovers, and modal dialogs.
8. No page error or console error is produced by the Mesurer startup path.

The normal packed-consumer cases for React, Solid 1, and Solid 2 continue to run in the same suite. Direct text editing has its own rendered Chromium contract for its interaction/presentation behavior; a future Trusted Types regression specific to opening that editor should be reduced to the unsafe sink and added to exact-artifact coverage rather than worked around in the host page.

## Regression rule

Do not fix a Trusted Types failure by:

- relaxing or rewriting the target page's CSP;
- creating a permissive Trusted Types policy for the page;
- special-casing YouTube or another hostname;
- switching the renderer back to a compilation mode that depends on HTML-string parsing and merely suppressing the failing test;
- introducing an HTML-string sink only for transient editor/plugin UI.

Reduce any future startup or interaction failure to the specific browser sink or renderer operation that triggered it, add an exact-artifact regression, and keep the fix inside Mesurer's private renderer/runtime boundary.

## Browser-harness boundary

Mesurer still does not own browser process or script-injection policy. The outer harness is responsible for getting the self-contained `mesurer-solid/inject-script` source into the page's JavaScript execution context.

The Trusted Types contract begins once that payload is evaluated. Mesurer guarantees that its own renderer startup and renderer-owned UI do not require the host page to grant TrustedHTML or weaken `require-trusted-types-for 'script'`.

## Release status

Trusted Types compatibility is part of the current package contract and is covered by the exact packed-artifact startup regression above. Stable candidates must keep that regression green; old prerelease version numbers are not used as evidence of current compatibility.
