# Architecture

Mesurer Solid is organized as private implementation workspaces behind one public package: `@jhomra21/mesurer-solid`.

The reference UI renderer remains implemented in Solid 2 because that renderer already has the upstream visual/behavioral parity we want. Solid is an implementation detail of Mesurer itself, not a requirement imposed on host applications.

```text
host application
Solid 1 / Solid 2 / React / Vue / Svelte / vanilla / Electron renderer
                              │
                              ▼
                    @jhomra21/mesurer-solid
                    public npm package
       mount · /core · /inject · /inject-script · agent API
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
      framework-neutral runtime        isolated UI island
      state · history · plugins          Solid 2 renderer
               │                             │
               └───────────┬─────────────────┘
                           ▼
                  canonical DOM boundary
```

## Public distribution

Users install only:

```text
@jhomra21/mesurer-solid
```

The same npm package exposes four primary entry points:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

- root export: framework-agnostic browser mount, plugins, public types, built-in plugin factories, and agent harness;
- `/core`: framework-neutral plugin/runtime primitives for extension authors;
- `/inject`: self-contained ES-module side-effect injector for browser harnesses that can inject module scripts;
- `/inject-script`: self-contained classic-script payload for generic JavaScript evaluation APIs and coding agents.

No renderer-specific package is part of the public product surface.

## Internal workspaces

The repository keeps boundaries separated so they can evolve independently without becoming separate products.

### Framework-neutral core

The private core workspace owns:

- Mesurer domain types and defaults;
- command-side model state;
- observable snapshots;
- undo/redo;
- settings/workspace serialization;
- plugin host lifecycle;
- tools, commands, hooks, overlays, settings, and service registrations;
- plugin-owned state slices;
- scoped plugin history/persistence;
- runtime capability introspection through `describe()`.

It must not import Solid, React, Vue, another renderer, Electron, or browser globals.

Public extension-facing pieces are bundled into the `@jhomra21/mesurer-solid/core` subpath so users do not install the private workspace.

### DOM boundary

The private DOM workspace owns:

- owner window/document/portal helpers;
- browser storage adapters;
- Electron renderer detection without importing Electron;
- canonical element box-model inspection.

The visible Select tool and the agent harness use the same DOM inspection primitive. Agent measurements are therefore not a second competing interpretation of layout geometry.

### `packages/renderer`

This private workspace owns the Solid 2 UI renderer and lifecycle adapter.

`createMeasurerModel()` creates the framework-neutral command model and mirrors snapshots into Solid state for JSX. Imperative pointer/keyboard/history behavior reads the synchronous command snapshot rather than relying on a particular Solid scheduling boundary.

Built-in feature identities are registered through the same plugin architecture external extensions use:

- Select
- X-ray
- Color Picker
- Rulers
- Text Inspector
- Guides
- Distance
- Settings

Built-ins can be excluded, removed, or replaced without forking the renderer. The default distribution preserves the parity-proven UI.

The renderer also provides the opaque `runtime:solid` service after its bridge initializes. Renderer-aware plugins can obtain that service through the public plugin service registry and create Mesurer-owned extension DOM without importing the private renderer workspace.

The renderer workspace is `private: true` and must never be published directly.

### `packages/mesurer`

This is the only publishable workspace.

Its build bundles the private core/DOM/renderer implementation into self-contained public artifacts. The root and injector bundles contain Mesurer's private Solid 2 runtime; host applications therefore do not need to provide or share Solid with Mesurer.

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const instance = mountMeasurer({ agent: true });
await instance.ready;
```

This is the compatibility boundary for Solid 1, Solid 2, React, Vue, Svelte, vanilla browser applications, and Electron renderer pages.

The package build fails if public JS/declaration artifacts leak private workspace package names or leave Solid as an external runtime dependency.

## Agent/browser harness boundary

The coding-agent boundary is deliberately transport-neutral. Mesurer does not own browser navigation, clicking, typing, screenshots, tabs, authentication, or browser lifetime.

The preferred generic integration is the classic-script export:

```text
@jhomra21/mesurer-solid/inject-script
```

An outer harness resolves/reads that payload and evaluates it in the page with the JavaScript execution primitive it already owns. Harnesses that specifically support ES-module script injection may use `@jhomra21/mesurer-solid/inject` instead.

```text
agent edits UI
    ↓
user dev server / HMR
    ↓
existing browser harness
    ├── evaluate @jhomra21/mesurer-solid/inject-script
    ├── interact/navigate/screenshot with its own APIs
    └── window.__MESURER__
           ├── ready()/stable()
           ├── inspect()/inspectAll()/at()
           ├── distance()
           ├── viewport()
           ├── feedback()
           ├── describe()
           ├── command()
           └── state()
```

The structured bridge is JSON-safe so a harness can return exact measurements to an agent alongside screenshots. The injector exists only inside the page where it is loaded; it does not create a network listener or remote service.

Injection also exposes `window.__MESURER_INSTANCE__` for advanced plugin-host access. Reinjection disposes the previous injected instance first.

## Plugin ownership and disposal

Every registration belongs to the plugin that created it. Removing or replacing a plugin disposes its registrations, removes orphaned plugin state, and clears incompatible history.

Plugin state slices can opt into:

- `history: true` — command execution snapshots the slice for plugin undo/redo;
- `persist: true` — the browser adapter persists the slice beside the configured Mesurer persistence key.

Nested command dispatch is treated as one transaction so stable built-in command aliases can delegate to replacement plugins without creating duplicate undo checkpoints.

Renderer-aware plugins can request the `runtime:solid` service through the public plugin service API. The service is opaque: extension code does not import the private renderer workspace. Its implementation currently provides owner document/window, portal target, and `createInspectorMount()`.

## Solid 2 scheduler rule

The interaction layer must not depend on a particular Solid propagation timing detail.

- `model.current` is the synchronous framework-neutral command snapshot;
- `model.state` is the Solid reactive projection used for rendering.

This keeps pointer, keyboard, and history sequences deterministic while allowing the renderer to update reactively.

## Shadow DOM

The public mount creates an open isolated ShadowRoot by default. This keeps Mesurer's renderer/runtime and styles separate from the host framework while still allowing development tooling and automation to inspect the Mesurer island when needed.

Isolation can be disabled explicitly for specialized integrations.

## Electron

Electron renderer processes are browser/DOM hosts and can use the normal mount or injection boundary. Electron's main process is not a DOM host.

Mesurer does not import Electron. Privileged main-process functionality should be provided through narrowly scoped application APIs exposed from preload/contextBridge and consumed by optional plugins.

## Package staging and release invariant

Before npm packaging, the public workspace stages a sanitized `.publish` directory. The staged manifest strips workspace-only dependencies and scripts. Release checks fail if any private package name appears in the staged metadata, JavaScript, or declaration output.

The package-smoke workflow then packs that staged directory and installs the resulting `.tgz` into clean consumer applications. This is intentionally different from testing workspace aliases: it verifies the same artifact npm users will receive.

## Visual contract

The framework and extension boundaries are intentionally **not** design boundaries. The default renderer continues to track the pinned upstream Mesurer visual system and behavior.

The pinned React → Solid screenshot and exhaustive interaction workflows remain the regression gates while the architecture underneath becomes more composable and framework-independent.
