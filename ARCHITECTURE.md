# Architecture

Mesurer is organized around a framework-neutral core with browser and renderer adapters. The Solid 2 implementation remains the reference UI renderer and retains upstream Mesurer's visual/behavioral contract, but Solid no longer owns the state/history or extension architecture.

```text
                         ┌─────────────────────────────┐
                         │ @jhomra21/mesurer-core      │
                         │ state · history · plugins   │
                         │ commands · hooks · domain   │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ @jhomra21/mesurer-dom       │
                         │ browser hosts · storage     │
                         │ canonical DOM measurements │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ @jhomra21/mesurer-solid     │
                         │ Solid 2 reactive projection │
                         │ parity UI / browser runtime │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │ @jhomra21/mesurer           │
                         │ private Solid 2 island      │
                         │ mount + agent harness       │
                         │ standalone /inject bundle   │
                         └─────────────────────────────┘
```

## `@jhomra21/mesurer-core`

Core has no Solid, React or renderer dependency. It owns:

- Mesurer domain types and defaults
- command-side model state
- observable snapshots
- undo/redo
- settings/workspace serialization
- plugin host lifecycle
- tools, commands, hooks, overlays and settings registrations
- plugin-owned state slices
- scoped plugin history/persistence
- runtime capability introspection through `describe()`

This is the stable extension boundary. New features should not need to import Solid internals to register behavior/state.

## `@jhomra21/mesurer-dom`

The DOM package is the browser-specific boundary. It owns:

- owner window/document/portal host helpers
- local-storage adapter
- Electron renderer detection without importing Electron
- canonical element box-model inspection

The visual Solid Select implementation and the universal agent harness both use the same DOM inspection primitive for border-box/padding/margin geometry. Agent measurement is therefore not a second competing interpretation of an element's box model.

## `@jhomra21/mesurer-solid`

The Solid package is a Solid 2 renderer and lifecycle adapter.

`createMeasurerModel()` creates the framework-neutral core model, then mirrors snapshots into a Solid store for JSX. Imperative interaction logic reads the core command snapshot, so its correctness does not depend on Solid's reactive scheduling boundary.

Built-in feature identities are registered through the public plugin architecture:

- Select
- X-ray
- Color Picker
- Rulers
- Text Inspector
- Guides
- Distance
- Settings

A caller can exclude, remove or replace built-ins and add third-party plugins without forking the renderer. The default plugin distribution preserves the original parity-proven UI.

## `@jhomra21/mesurer`

The universal package bundles a private Solid 2 runtime together with the Solid renderer. Host applications therefore do not share Mesurer's renderer runtime.

```ts
import { mountMeasurer } from "@jhomra21/mesurer";

const instance = mountMeasurer({ agent: true });
await instance.ready;
```

This is the compatibility boundary for:

- Solid 1
- Solid 2 when a framework-neutral mount is preferred
- React
- Vue
- Svelte
- vanilla browser apps
- Electron renderer pages

The package build fails if either universal bundle leaves `solid-js` or `@solidjs/web` as an external runtime import.

## Agent/browser harness boundary

`@jhomra21/mesurer/inject` is a self-contained development/test module intended for browser automation. It lets a coding agent instrument a running user application without editing that application's source code.

```text
agent edits UI
    ↓
user dev server / HMR
    ↓
Playwright/Cypress/browser harness
    ├── inject @jhomra21/mesurer/inject
    ├── screenshot page
    └── window.__MESURER__
           ├── stable()
           ├── inspect()/inspectAll()/at()
           ├── distance()
           ├── viewport()
           ├── feedback()
           ├── describe()
           ├── command()
           └── state()
```

The structured bridge is JSON-safe so a harness can return exact measurements to an agent alongside screenshots. The injected bridge is local to the browser page; it does not create a network listener or remote service.

See `AGENTS.md` and `packages/mesurer/README.md` for the harness contract.

## Plugin ownership and disposal

Every registration belongs to the plugin that created it. Removing or replacing a plugin disposes its registrations, cleans orphaned plugin state, and clears incompatible plugin history.

Plugin state slices may opt into:

- `history: true` — command execution snapshots the slice for plugin undo/redo
- `persist: true` — the Solid browser adapter persists the slice beside the configured Mesurer persistence key

Cmd/Ctrl+Z is offered to plugin history first, then falls through to native Mesurer history when no plugin action is available.

## Solid 2 scheduler rule

The interaction layer must not depend on a specific Solid propagation timing detail.

- `model.current` is the synchronous framework-neutral command snapshot.
- `model.state` is the Solid reactive projection used by JSX.

This keeps pointer/keyboard/history sequences deterministic while allowing the Solid renderer to update reactively.

## Shadow DOM

The native public API accepts `HTMLElement | ShadowRoot` portal targets. Where Solid's Portal requires an Element mount, the renderer creates an owned Element host inside the ShadowRoot and injects Mesurer styles into the same root.

The universal package creates an open isolated ShadowRoot by default so it does not inherit or conflict with a host framework's renderer/runtime. Isolation can be disabled explicitly when needed.

## Electron

Electron's renderer process is a browser/DOM host and can use the universal mount/inject boundary. Electron's main process is not a DOM host.

Mesurer does not import Electron. Privileged main-process capabilities should be supplied later through narrowly-scoped plugins and an application's preload/contextBridge boundary.

## Visual contract

The framework and extension boundaries are intentionally **not** design boundaries. The default Solid distribution continues to track the pinned upstream Mesurer visual system:

- Tailwind v4 source and ink palette
- toolbar geometry/order/iconography/tooltips
- guide orientation menu
- settings controls and dimensions
- rulers and guide behavior
- measurement/selection/distance overlays
- color picker
- text inspector

The pinned React→Solid visual and exhaustive interaction workflows remain the regression gates while the implementation underneath becomes more composable.
