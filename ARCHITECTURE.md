# Architecture

Mesurer Solid publishes one framework-agnostic package backed by private core, DOM, and Solid 2 renderer workspaces. The browser extension packages the same runtime instead of maintaining a fork.

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

Users install `mesurer-solid`.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, Context plugin, public types, agent surface |
| `mesurer-solid/arrange` | First-party Arrange plugin |
| `mesurer-solid/screenshot` | First-party Screenshot plugin |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic injection helper |
| `mesurer-solid/inject-script` | Self-contained classic browser payload |

The package also ships `mesurer-skill` and the portable `mesurer-ui` Agent Skill. Private workspace names and Solid runtime dependencies must not leak into public JavaScript or declarations.

## Workspace ownership

### Core

`packages/mesurer-core` owns observable state, commands, history, plugin registration, state slices, tools, settings, overlays, hooks, services, capability introspection, serialization, and shared domain contracts. It does not import Solid, Electron, or browser globals.

Plugin registrations are owned and disposable. Asynchronous setup is an in-flight load that can be cancelled. If cancellation happens while setup is awaiting, later registrations are disposed immediately rather than reviving resources after their owner is gone.

Cancellation is scoped to the load that started it. Code using a shared plugin host must not dispose unrelated plugins.

### DOM boundary

`packages/mesurer-dom` owns browser/document helpers, storage adapters, Electron-renderer detection, box-model inspection, selectors, fingerprints, DOM identity, and rich element inspection.

Select, Context rebinding, Arrange targets, direct text-edit targets, and programmatic `select()` share these rules. Rebinding is conservative: weak structural position alone is not enough to transfer human intent to another element.

### Renderer

`packages/renderer` owns the isolated Solid 2 UI/lifecycle adapter and browser interaction runtime.

Human-facing built-ins are Select, X-ray, Color Picker when supported, Rulers, Typography, Guides, Distance, and Settings. Typography retains the internal compatibility id `text-inspector`.

The toolbar keeps one stable tool order. Compact presentation collapses inactive controls while preserving active tools and state. Arrange remains a plugin contribution rather than a toolbar mode.

Plugin tools render through the same toolbar path as built-ins instead of maintaining a second renderer.

## Direct text editing

Direct editing is a renderer-runtime feature, not a top-level plugin or package entry.

```text
renderer bridge
  └─ direct-text targeting
     ├─ in-place editor
     ├─ typography controls + semantic presets
     ├─ contextual Typography card
     ├─ Before/Desired history
     ├─ ownership-aware preview
     ├─ state: mesurer.text-edit.intents
     └─ service: text-edit
```

It activates from Select or Typography by double-click/double-tap. Arrange keeps Select active, so text editing can occur without leaving the Arrange workflow.

The target boundary follows browser editability semantics: form controls stay native; descendants that inherit `contenteditable` stay native; a nested `contenteditable="false"` boundary ends that inherited region; ambiguous mixed/nested rich text is not converted into a generic editor.

If Typography was already selected, the normal hover/pinned surface is suppressed during the direct-edit session so the field has one live card.

Text and style previews are ownership-aware. Undo/redo can update a value Mesurer still owns. A host-authored change takes ownership and survives later history and cleanup.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange is a renderer-aware first-party plugin exported from `mesurer-solid/arrange`.

It owns active state, `Shift+A`, snapping, drag preview, Before/Desired intent, persistence, and review. Activating Arrange enables Select; turning Arrange off leaves Select active; turning Select off exits Arrange.

Arrange previews movement with an inline transform but records the previous value and priority as its baseline. Cleanup restores that baseline only while the current transform still matches Mesurer's preview. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

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

`window.__MESURER__` is the shared browser-state boundary; there is no Send-to-agent transport. Arrange and text-edit intent remain separate structured channels so they retain their own Before/Desired/Live semantics.

See [Context](./docs/CONTEXT_WORKFLOW.md) and [Agent integration](./packages/mesurer/AGENT_INTEGRATION.md).

## Screenshot

`mesurer.screenshot` is an optional first-party plugin exported from `mesurer-solid/screenshot`.

It owns camera activation, region selection, capture provider, HiDPI crop logic, output preferences, status, thumbnail/viewer UI, commands, service, and cleanup. Normal browser hosts use `getDisplayMedia()`; the Chromium extension uses `chrome.tabs.captureVisibleTab()` through an isolated-world bridge and the existing `activeTab` grant.

Screenshot bytes are not part of `MesurerContextV1`. Human camera capture and coding-agent screenshot evidence remain separate paths.

See [Screenshots](./docs/SCREENSHOTS.md).

## Browser boundary

The visible renderer mounts in a ShadowRoot and uses a hardened outer host/top-layer strategy for stacking, clipping, later popovers, and modal dialogs. Renderer-aware plugins and transient editor surfaces stay inside the same ownership boundary.

The renderer uses Solid's universal runtime and constructs DOM nodes directly rather than depending on HTML-string template sinks, keeping the packed artifact compatible with strict Trusted Types pages without weakening host CSP.

See [Host isolation](./docs/HOST_ISOLATION.md) and [Trusted Types](./docs/TRUSTED_TYPES.md).

## Human/agent boundary

The page is shared state:

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

Agent attachment reuses an existing Mesurer instance when present. After source changes, verification uses the real Live page: Arrange preview removed, text Desired preview inactive, and fresh Context/measurement/review evidence.

Temporary Mesurer presentation expresses intent or evidence; it is not proof that source was updated.

## Distribution and release

The public package bundles the private workspaces into self-contained artifacts and is validated as an exact packed npm candidate across clean React, Solid 1, and Solid 2 consumers.

Release validation also covers browser contracts, host isolation, screenshots, public subpaths and declarations, Agent Skill packaging, visual parity, and source-first upstream decisions.

See [Releasing](./RELEASING.md) and [Upstream parity](./docs/UPSTREAM_PARITY.md).
