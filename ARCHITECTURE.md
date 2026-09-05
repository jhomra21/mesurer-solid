# Architecture

Mesurer Solid publishes one framework-agnostic package backed by private core, DOM, and Solid 2 renderer workspaces. The browser extension packages the same runtime rather than maintaining a fork.

```text
host application / arbitrary browser page
Solid 1 / Solid 2 / React / Vue / Svelte / vanilla / Electron
                              │
                              ▼
                        mesurer-solid
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      framework-neutral     DOM boundary    Solid 2 renderer
      state + plugins       identity +      isolated UI island
                            inspection
             │                                 │
             ├───────────────┬─────────────────┤
             ▼               ▼                 ▼
        Context plugin   Arrange plugin   Screenshot plugin
             │               │                 │
             └───────────────┼─────────────────┘
                             ▼
                    window.__MESURER__
                             │
                    existing browser harness
```

Solid 2 is a renderer implementation detail. Host applications do not need to provide Solid.

## Public package

Users install:

```text
mesurer-solid
```

The package exposes:

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, Context plugin, public types, agent surface |
| `mesurer-solid/arrange` | First-party Arrange plugin |
| `mesurer-solid/screenshot` | First-party Screenshot plugin |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic injection helper |
| `mesurer-solid/inject-script` | Self-contained classic browser payload |

The package also ships the `mesurer-skill` installer and a portable `mesurer-ui` Agent Skill.

Private workspace package names and Solid runtime dependencies must not leak into public JavaScript or declarations.

## Framework-neutral core

`packages/mesurer-core` owns observable model state, commands, history, plugin registration, state slices, tools, settings, overlays, hooks, services, capability introspection, serialization, and shared domain contracts.

It does not import Solid, Electron, or browser globals.

Plugin registrations are owned and disposable. An asynchronous plugin setup is represented as an in-flight load that can be cancelled. If cancellation happens while setup is awaiting, later registrations are immediately disposed rather than resurrecting resources after the owner is gone.

Cancellation is scoped to the specific pending load. A component using an externally supplied/shared plugin host can cancel only the loads it started; unrelated plugins on that host remain alive.

## DOM boundary

`packages/mesurer-dom` owns browser/document helpers, storage adapters, Electron-renderer detection, box-model inspection, selectors, fingerprints, DOM identity, and rich element inspection.

Select, programmatic `select()`, Context rebinding, Arrange target identity, and direct text-edit rebinding share these rules. Weak structural position alone is not enough to transfer human intent to another element; rebinding must remain conservative and unique.

## Renderer

`packages/renderer` owns the isolated Solid 2 UI/lifecycle adapter and browser interaction runtime.

Human-facing built-ins are Select, X-ray, Color Picker when supported, Rulers, Typography, Guides, Distance, and Settings. Typography retains the internal compatibility id `text-inspector`.

The toolbar has one stable tool order. Compact presentation collapses inactive controls while preserving every active tool and its state. Expanding restores the same order. Arrange remains a normal plugin contribution rather than a toolbar mode.

Plugin tools render through the same `Toolbar` / `ToolbarButton` path as built-ins; plugins do not maintain a second toolbar renderer.

## Direct text editing

Direct editing is a renderer-runtime feature, not another top-level tool or public plugin entry.

```text
renderer bridge
    │
    └─ installTextEditing(...)
         ├─ direct-text targeting
         ├─ in-place editor
         ├─ typography controls + semantic presets
         ├─ contextual Typography card
         ├─ Before/Desired history
         ├─ ownership-aware preview
         ├─ state: mesurer.text-edit.intents
         └─ service: text-edit
```

The runtime activates from Select or Typography by double-click/double-tap. Arrange keeps Select active, so text editing can occur without leaving the Arrange workflow.

The target boundary follows browser editability semantics:

- native form controls stay native;
- descendants that inherit `contenteditable` stay under browser/application editing;
- a nested `contenteditable="false"` boundary ends that inherited region and can become a Mesurer direct-text target when the normal one-unambiguous-direct-text-node rule passes;
- ambiguous mixed/nested rich text is not converted into a generic rich-text editor.

The field-local formatting UI uses Mesurer's toolbar visual language but is not a registered global tool. B/I/U, Font, Size, Weight, rendered-page colors, and custom color are direct controls. A separate semantic popup contains Text and only Heading 1/2/3 levels actually rendered by the page.

If Typography is already explicitly selected when editing begins, the normal hover/pinned Typography surface is temporarily suppressed so the field has one live card. Ending the session restores the normal surface without deselecting Typography.

Text and style previews are ownership-aware. If the DOM still matches Mesurer's previously applied value, undo/redo can transition it to the restored Desired value. If the host application changes the text or inline style itself, Mesurer relinquishes ownership and preserves the host value through later history and cleanup.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange is a renderer-aware first-party plugin exported from `mesurer-solid/arrange`.

It owns its active state, `Shift+A`, settings, snapping, transient drag preview, Before/Desired intent, persistence, and review service. Activating Arrange automatically enables Select. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Arrange previews movement with an inline transform but does not treat that transform as production source. It records both the previous inline transform and the exact value/priority Mesurer applies. Cleanup restores the previous transform only while the current value and priority still match Mesurer's owned preview. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

Repeated refresh/reapplication starts from the current owned state rather than accumulating stale preview offsets.

See [Arrange](./docs/ARRANGE.md).

## Context

The removable `mesurer.context` plugin owns annotations and the human/agent context workflow:

```text
contextPlugin()
  ├─ Copy Context / Copy Selection / Add Note
  ├─ annotation state + conservative rebinding
  ├─ context/select/review/capture-plan operations
  └─ service: context:v1
```

Injection enables Context by default. Source-mounted applications opt in with `contextPlugin()`.

There is no Send-to-agent transport. `window.__MESURER__` is the shared browser-state boundary. Arrange and text-edit intent remain separate structured channels so they retain their own Before/Desired/Live semantics.

A broad agent request inventories selection, workspace Context, annotations, Arrange intents, and text-edit intents before editing source.

See [Context workflow](./docs/CONTEXT_WORKFLOW.md) and [Agent integration](./packages/mesurer/AGENT_INTEGRATION.md).

## Screenshot

`mesurer.screenshot` is an optional first-party plugin exported from `mesurer-solid/screenshot`.

It owns camera activation, region selection, capture provider, HiDPI crop logic, output preferences, status, thumbnail/viewer UI, commands, service, and cleanup. Normal browser hosts use `getDisplayMedia()`; the Chromium extension uses `chrome.tabs.captureVisibleTab()` through an isolated-world bridge and the existing `activeTab` grant.

Screenshot bytes are not part of `MesurerContextV1`. Human camera capture and coding-agent screenshot evidence remain separate paths.

See [Screenshots](./docs/SCREENSHOTS.md).

## Host isolation and Trusted Types

Mesurer's visible renderer mounts in a ShadowRoot for style isolation and uses a hardened outer host/top-layer strategy for stacking, clipping, later popovers, and modal dialogs. Renderer-aware plugin and transient editor surfaces remain inside the same ownership boundary.

The renderer compiles through Solid's universal runtime and constructs DOM nodes directly rather than requiring HTML-string template sinks. This keeps the packed artifact compatible with strict Trusted Types pages without weakening host CSP.

See [Host isolation](./docs/HOST_ISOLATION.md) and [Trusted Types](./docs/TRUSTED_TYPES.md).

## Agent boundary

The page is shared state between the human reviewer and coding agent:

```text
human selection / notes / Arrange / text Desired
                       │
                       ▼
                 live Mesurer state
                       │
                       ▼
                window.__MESURER__
                       │
                       ▼
               existing browser harness
```

Agent attachment must reuse an existing instance when present. A live instance can contain unsaved selection, measurements, guides, plugin state, annotations, Arrange intent, text/style intent, or screenshot review state.

After source changes, verification uses the real Live page: Arrange preview removed, text Desired preview inactive, and fresh Context/measurements/review. Temporary Mesurer presentation is intent/evidence, not proof that source was updated.

## Distribution and release invariants

The public package bundles private workspaces into self-contained artifacts and is exercised as an exact packed npm candidate across clean React, Solid 1, and Solid 2 consumers.

Release validation also protects host isolation, browser contracts, screenshots, historical/current visual parity, public subpaths, declarations, Agent Skill packaging, and source-first upstream decisions.

See [Releasing](./RELEASING.md) and [Upstream parity](./docs/UPSTREAM_PARITY.md).
