# Host-page isolation contract

Mesurer must remain visible and usable on real applications whose CSS and overlay systems were not designed with Mesurer in mind.

This is a **class-of-problems contract**, not a list of websites we happened to test. YouTube is useful as a motivating case, but the implementation must defend against the underlying browser behaviors that can occur on any site.

## Why Shadow DOM is not enough

Mesurer mounts its renderer inside a ShadowRoot by default. That protects the renderer's internal selectors and styles from most host CSS, but the ShadowRoot's **host element still participates in the host document**.

Without a separate host-layer strategy, a page can still interfere through:

- stacking contexts and high `z-index` overlays;
- ancestor `overflow` clipping;
- transformed or contained ancestors;
- broad author rules that target the Mesurer host element;
- later top-layer popovers/fullscreen elements;
- modal dialogs, which make nodes outside the active modal inert.

A shadow tree solves style encapsulation. It does not solve document layering by itself.

## Mesurer's host invariants

The public `mountMeasurer()` boundary owns these invariants.

### 1. Harden the outer host

The outer `[data-mesurer-island="true"]` element receives inline `!important` values for the properties that host pages commonly use to hide, clip, move, or restyle overlays.

The protected contract includes a fixed viewport box, visible overflow, transparent background, no transform/filter/containment, full opacity/visibility, maximum fallback `z-index`, predictable typography inheritance, and `pointer-events: none` at the outer surface so ordinary page interaction still passes through. Mesurer's actual controls opt back into pointer events inside the island.

This protects against broad rules such as `body > div`, `*`, or application overlay resets, including author `!important` declarations for the same properties.

### 2. Prefer the browser top layer

When the Popover API is available, Mesurer turns its outer host into a `popover="manual"` element and calls `showPopover()`.

A shown popover is promoted into the browser **top layer**. Unlike a normal `z-index` strategy, top-layer rendering is above ordinary document stacking contexts and is not clipped by ancestor `position` or `overflow` rules.

`topLayer` defaults to `true`. Integrations can set `topLayer: false` when they explicitly need the compatibility fallback.

The mounted instance reports the selected strategy through:

```ts
mounted.hostLayer // "top-layer" | "fixed"
```

### 3. Reassert above later host overlays

Top-layer entries are ordered by the browser. A page can open another popover or enter fullscreen after Mesurer mounts.

Mesurer watches observable top-layer changes and reasserts its manual popover so its inspection UI remains the newest inspection surface. Integrations can also request this explicitly:

```ts
mounted.bringToFront();
```

### 4. Stay interactive through modal dialogs

A modal `<dialog>` is different from an ordinary overlay: the HTML platform makes every connected node outside the active modal inert.

When Mesurer observes a modal dialog opening, it temporarily reparents its outer host into that dialog, keeps the Mesurer host top-layered, and restores the original parent when the modal closes. This preserves toolbar interaction while inspecting modal UI.

### 5. Fall back safely on older browsers

If the Popover API is unavailable or top-layer promotion fails, Mesurer keeps the hardened fixed host with the maximum practical `z-index`.

That fallback is intentionally best-effort. A normal document layer cannot provide the same guarantee as the browser top layer against every possible stacking context.

## How we test this without testing every website

We test the **browser invariants that websites compose**, using the exact packed npm artifact in clean framework hosts.

The package-smoke suite creates adversarial host conditions after Mesurer has mounted:

1. global `!important` rules attempt to hide, shrink, transform, clip, and lower the Mesurer host;
2. `body` is transformed, paint-contained, and overflow-clipped;
3. a full-viewport host overlay is added with an extreme `z-index`;
4. a later host popover is promoted into the top layer;
5. a modal dialog is opened and then closed;
6. the test verifies that the toolbar remains the hit-tested surface and that the host is restored after the modal;
7. the same packed package is exercised in React, Solid 1, and Solid 2 consumers, including external browser-eval injection.

This is more general than maintaining a list of YouTube/Twitter/Figma/etc. fixtures. Those sites can change their HTML tomorrow; the underlying stacking, clipping, popover, and modal rules are browser primitives.

## What this contract cannot guarantee

No in-page JavaScript library can literally guarantee visibility against every actor with control of the browser or document.

Out of scope for a hard guarantee:

- browser chrome and DevTools UI;
- browser extensions that intentionally cover or remove page content;
- hostile page JavaScript that explicitly finds and removes/mutates the Mesurer node after mount;
- inaccessible modal/top-layer state hidden inside a closed ShadowRoot that the host page deliberately encapsulates;
- legacy browsers without Popover API support, where Mesurer uses the fixed fallback;
- injection blocked before Mesurer executes at all by the surrounding automation/security environment.

Within a normal same-document application on a modern browser, the contract is that ordinary CSS, stacking contexts, clipping, overlays, later popovers/fullscreen changes, and observable modal dialogs must not silently occlude Mesurer.

## Regression rule

Do not fix a host-specific occlusion report with a hostname check or a selector for that website.

Reduce the report to the browser primitive that caused it, add an adversarial regression for that primitive, and fix the public mount boundary so every host benefits.
