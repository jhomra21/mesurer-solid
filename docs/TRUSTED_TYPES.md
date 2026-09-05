# Trusted Types

Mesurer must start and operate on pages that enforce Trusted Types without asking the host to weaken its Content Security Policy.

This is separate from [Host isolation](./HOST_ISOLATION.md): Trusted Types covers safe DOM construction under strict CSP; host isolation covers stacking, clipping, overlays, popovers, and modal dialogs after Mesurer mounts.

## Renderer contract

A strict page may send:

```text
Content-Security-Policy:
  require-trusted-types-for 'script';
  trusted-types 'none'
```

Mesurer does not work around this policy by injecting a permissive Trusted Types policy or rewriting the host CSP.

The private Solid 2 renderer uses Solid's universal JSX transform:

```ts
solid({
  solid: {
    generate: "universal",
    moduleName: "@mesurer/solid-dom",
  },
})
```

`packages/renderer/src/solid-dom.ts` builds UI with DOM node and property APIs such as `createElement`, `createTextNode`, `setAttribute`, `style.setProperty`, and `insertBefore`. Renderer startup therefore does not depend on parsing compiled JSX through `innerHTML` or another HTML-string sink.

The Solid 2 renderer remains private. Applications install `mesurer-solid` and do not need to provide Solid 2 or `@solidjs/universal`.

## Runtime-created UI

Transient UI follows the same rule. Direct text editing, formatting controls, semantic presets, swatches, and the contextual Typography card are created from DOM nodes, text, properties, and styles rather than HTML-string parsing.

The target copy is updated through its resolved text node. Mesurer does not serialize and reparse the host component merely to preview Desired text or typography.

## Release test

Package smoke tests the exact packed artifact that would be published. It starts a page with:

```text
require-trusted-types-for 'script'; trusted-types 'none'
```

and requires the real injection artifact to initialize `window.__MESURER__`, render an interactive toolbar, inspect real geometry, initialize commands, pass hostile host-isolation checks, and produce no Mesurer startup page or console error.

The same release surface exercises packed React, Solid 1, and Solid 2 consumers. Direct text editing has separate Chromium coverage for its interaction and presentation behavior.

## Regression rule

Do not fix a Trusted Types failure by weakening the target CSP, creating a permissive page policy, special-casing a hostname, or reintroducing an HTML-string sink for transient UI.

Reduce the failure to the renderer/browser operation that triggered it, add exact-artifact coverage when needed, and keep the fix inside Mesurer's renderer/runtime boundary.

The outer browser harness still owns how `mesurer-solid/inject-script` reaches the page's JavaScript execution context. Mesurer's Trusted Types guarantee begins once that payload is evaluated.

See [Direct text editing and Typography](./TEXT_EDITING.md) for the transient editor contract.
