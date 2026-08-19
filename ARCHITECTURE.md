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

Solid 2 store/signal writes are staged. Interaction code therefore never relies on this pattern:

```ts
setValue(next);
readValue(); // do not assume this is next
```

`createMeasurerModel()` maintains a synchronous command-side snapshot (`model.current`) and publishes each command into the Solid store (`model.state`). JSX subscribes to `state`; imperative pointer/history code computes from `current`. `flush()` is reserved for tests or genuine imperative settle boundaries.

## Ownership boundaries

- `core/` contains geometry, DOM targeting, snapping, distance, colors and persistence contracts adapted from Mesurer.
- `runtime/` contains framework-neutral text inspection and style injection.
- `model/` owns Solid 2 state, action history, settings and serialization.
- `components/` are Solid 2 JSX only.
- `Measurer.tsx` owns browser lifecycle, portal integration, keyboard/pointer behaviors and persistence wiring.

## Shadow DOM

Solid 2 RC's `<Portal>` currently requires an `Element` mount. The public API still accepts `ShadowRoot`; Mesurer creates and owns an internal `HTMLElement` host inside that root, then portals into that element. Styles are injected into the same root.

## Parity surface

The port covers upstream's current user-facing feature families: Select, Guides, Rulers, Text Inspector, X-ray, EyeDropper, Alt distances, history, settings, workspace persistence and custom portal/persistence adapters.
