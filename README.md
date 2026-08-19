# mesurer-solid

A Solid 2-native port of [Mesurer](https://github.com/ibelick/mesurer), focused on keeping Mesurer's framework-neutral measurement logic while rebuilding the reactive and rendering layers around Solid 2.

> Status: foundation / first vertical slice. The current scaffold can toggle measurement mode, hover DOM elements, select an element, and render its bounds + dimensions. The rest of Mesurer's feature set is tracked in the roadmap below.

## Why this exists

Mesurer is a lightweight measurement and alignment overlay built for React. This project ports the idea to Solid without preserving React's component lifecycle and hook architecture.

The Solid layer is designed around Solid 2 behavior from the start:

- `solid-js@2.0.0-rc.0`
- `@solidjs/web@2.0.0-rc.0`
- `@solidjs/vite-plugin`
- staged writes / microtask batching
- draft-first stores
- split `createEffect` semantics
- `onSettled` lifecycle
- Solid 2 JSX (`jsxImportSource: @solidjs/web`)

## Current usage

```tsx
import { render } from "@solidjs/web";
import { Measurer } from "@jhomra21/mesurer-solid";
import "@jhomra21/mesurer-solid/styles.css";

render(
  () => (
    <>
      <App />
      <Measurer />
    </>
  ),
  document.getElementById("root")!,
);
```

### Current shortcuts

- `M` — toggle Mesurer
- `S` — toggle Select mode
- `Escape` — clear the current selection

When Select mode is active, moving the pointer previews the element under the cursor and clicking pins it.

## Architecture

```text
packages/mesurer-solid/src/
├── core/             framework-neutral Mesurer-derived logic
├── model/            Solid 2 reactive model and commands
├── components/       Solid 2 rendering primitives
├── Measurer.tsx      browser integration + event lifecycle
├── index.ts
└── styles.css
```

The main rule is that browser events calculate their next values directly and then stage reactive state. We do not rely on "set then immediately read" behavior, because Solid 2 batches writes and exposes them after the batch flushes.

## Roadmap

### Phase 1 — foundation (started)

- [x] Solid 2 RC package/build setup
- [x] Solid 2 JSX configuration
- [x] Solid model based on draft-first `createStore`
- [x] DOM hover + click selection vertical slice
- [x] Portal-based overlay
- [x] keyboard lifecycle using `onSettled`
- [x] upstream MIT attribution
- [x] GitHub Actions CI definition

### Phase 2 — selection parity

- [ ] multi-select measurements
- [ ] drag-to-measure
- [ ] snapping to nearby DOM targets
- [ ] resize / scroll live tracking parity
- [ ] padding + margin overlays
- [ ] edge visibility calculations
- [ ] option/Alt distance overlays
- [ ] undo / redo history

### Phase 3 — guides + rulers

- [ ] guide model
- [ ] guide placement
- [ ] guide drag / pointer capture
- [ ] guide-to-guide snapping
- [ ] rulers
- [ ] guide selection and deletion

### Phase 4 — inspection tools

- [ ] text inspector
- [ ] x-ray mode
- [ ] color picker
- [ ] settings UI
- [ ] persistence adapter

### Phase 5 — host integration

- [ ] plain Solid CSR fixture
- [ ] Solid SSR/hydration fixture
- [ ] custom `portalTarget`
- [ ] ShadowRoot fixture
- [ ] multiple Mesurer instances

## Development

This repository uses Bun workspaces and targets Bun 1.3.14.

```bash
bun install
bun run dev
```

Build the library:

```bash
bun run build
```

## Attribution

This project contains portions adapted from `ibelick/mesurer`, Copyright (c) 2026 Julien Thibeaut, under the MIT License. See `THIRD_PARTY_LICENSES.md`.
