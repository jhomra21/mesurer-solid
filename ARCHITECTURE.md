# Architecture

`mesurer-solid` is a Solid 2-native port, not a React-hook transliteration.

```text
Solid 2 JSX / UI
      │
      ▼
command model + reactive projection
      │
      ├── pointer / keyboard / ruler behaviors
      ├── persistence / history
      └── derived overlays
              │
              ▼
framework-neutral Mesurer core/runtime
```

## Solid 2 scheduler rule

The current Solid 2 RC updates store values synchronously in the command contexts used here while downstream reactive propagation remains scheduled/batched. The interaction layer therefore does not rely on a specific propagation boundary.

`createMeasurerModel()` maintains a synchronous command-side snapshot (`model.current`) and mirrors each command into the Solid store (`model.state`). JSX subscribes to `state`; imperative pointer/history code computes from `current`. This keeps event sequences deterministic even if Solid's scheduler behavior evolves.

## Ownership boundaries

- `core/` contains geometry, DOM targeting, snapping, distance, colors and persistence contracts adapted from Mesurer.
- `runtime/` contains framework-neutral text inspection and style injection.
- `model/` owns Solid 2 state, action history, settings and serialization.
- `components/` are Solid 2 JSX only.
- `Measurer.tsx` owns browser lifecycle, portal integration, keyboard/pointer behaviors and persistence wiring.

## Visual boundary

The framework boundary is intentionally **not** a design boundary. The Solid port shares upstream Mesurer's visual system:

- upstream Tailwind v4 source, ink palette and light color scheme
- toolbar geometry/order, SVG iconography, tooltips and orientation menu
- settings-panel dimensions and controls
- rulers, color picker, measurement/distance overlays and text-inspector card styling

Solid-specific code adapts JSX attributes, state ownership and event/lifecycle mechanics only. It does not introduce a separate theme or redesign. Visual-contract integration tests guard the key dimensions, ordering and overlay conventions.

## Shadow DOM

Solid 2 RC's `<Portal>` currently requires an `Element` mount. The public API still accepts `ShadowRoot`; Mesurer creates and owns an internal `HTMLElement` host inside that root, then portals into that element. Styles are injected into the same root.

## Parity surface

The port covers upstream's current user-facing feature families: Select, Guides, Rulers, Text Inspector, X-ray, EyeDropper, Alt distances, history, settings, workspace persistence and custom portal/persistence adapters.
