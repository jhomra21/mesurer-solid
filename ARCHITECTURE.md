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
             │               │
             │         Layout Guides plugin
             │
             └── optional Codex plugin ──► loopback companion ──► Codex queue
             │               │                 │
             └───────────────┼─────────────────┘
                             ▼
                    window.__MESURER__
                             │
                    existing browser controller
```

Solid 2 is a renderer implementation detail. Host applications do not need to provide Solid.

## Public package

Users install `mesurer-solid`.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, domain types, and agent API |
| `mesurer-solid/plugins` | All first-party plugin factories and plugin-specific contracts |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic injection helper |
| `mesurer-solid/inject-script` | Self-contained classic browser payload |

The package also ships `mesurer-skill`, the portable `mesurer-ui` Agent Skill, the optional `mesurer-codex` loopback companion, and `mesurer-solid/codex-host` for native-host bootstrap. Private workspace names and Solid runtime dependencies must not leak into public JavaScript or declarations.

Public first-party plugin factories use their feature name directly. Applications import `context`, `arrange`, `layoutGuides`, `screenshot`, `codex`, and explicit built-ins such as `select` or `typography` from `mesurer-solid/plugins`; redundant `*Plugin` public factory names and one-plugin-per-subpath exports are not part of the package contract.

`mountMesurer()` is the single application-facing construction seam. It owns host creation, renderer startup, built-in defaults, first-party plugin registration, persistence wiring, optional global agent exposure, and disposal. The returned handle is the lifecycle interface. `ready` resolves the live plugin host after startup and initial rendered stability, `service()` and `describe()` wait at that seam, and an optional `AbortSignal` can transfer cleanup ownership to an existing application lifecycle. Do not add a second create/configure factory that asks callers to assemble the same implementation in another form.

## Workspace ownership

### Core

`packages/mesurer-core` owns observable state, commands, history, plugin registration, state slices, tools, settings, overlays, hooks, services, capability introspection, serialization, and shared domain contracts. It does not import Solid, Electron, or browser globals.

Plugin registrations are owned and disposable. Commands may return JSON-safe `PluginValue` results, so generic automation can invoke one command path without losing useful output. Services remain opaque typed runtime capabilities; normal mounted consumers resolve them through `MountedMesurer.service<T>(id)` rather than reaching through the host registry.

Asynchronous setup is an in-flight load that can be cancelled. If cancellation happens while setup is awaiting, later registrations are disposed immediately rather than reviving resources after their owner is gone.

Cancellation is scoped to the load that started it. Code using a shared plugin host must not dispose unrelated plugins.

### DOM boundary

`packages/mesurer-dom` owns browser/document helpers, storage adapters, Electron-renderer detection, box-model inspection, selectors, fingerprints, DOM identity, and rich element inspection.

Select, Context rebinding, point inspection, and programmatic `select()` accept general DOM `Element` targets, including SVG. Arrange and direct text editing narrow back to `HTMLElement` before they mutate presentation or text. Rebinding is conservative: weak structural position alone is not enough to transfer human intent to another element.

### Renderer

`packages/renderer` owns the isolated Solid 2 UI/lifecycle adapter and browser interaction runtime.

Within the renderer runtime, direct editing is grouped under `runtime/text-editing/` and shared Typography inspector code under `runtime/typography/`. Document mounts, scrolling, selection channels, presentation preferences, and workspace Context remain shared runtime code rather than being pulled into those feature folders.

Human-facing built-ins are Select, X-ray, Color Picker when supported, Rulers, Typography, Guides, Distance, and Settings. Typography retains the internal compatibility id `text-inspector`. Distance geometry is specified in [Measurements and distance geometry](./docs/MEASUREMENTS.md).

The toolbar keeps one stable tool order. Compact presentation collapses inactive controls while preserving active tools and state. Dragging begins only after the pointer crosses the drag threshold. Menus, dialogs, form controls, editable regions, and sliders retain pointer ownership. Arrange remains a plugin contribution rather than a toolbar mode.

Plugin tools render through the same toolbar path as built-ins instead of maintaining a second renderer.

Page identity is a runtime seam, not a feature-specific URL check. The default route key uses pathname plus sorted query parameters and includes hash routes only for `#/` navigation. Page-owned workspace state uses that key; viewport/session chrome does not. In particular, toolbar placement lives in tab `sessionStorage` so route changes can swap page evidence without moving the user's global control surface.

Default local persistence stores settings once per persistence key and workspace snapshots by page key. Custom persistence can implement `setPageKey(pageKey)` to receive the same route transition. The renderer saves the old page before switching, clears transient page ownership, then restores the target page while retaining session-centric tool visibility/mode state.

## Direct text editing

Direct editing is a renderer-runtime feature, not a top-level plugin or package entry.

```text
renderer bridge
  └─ direct-text targeting
     ├─ in-place editor
     ├─ typography controls + semantic presets
     ├─ contextual Typography card
     ├─ selected/edit chrome ownership
     ├─ measured dimensions-pill clearance
     ├─ Before/Desired history
     ├─ ownership-aware preview
     ├─ state: mesurer.text-edit.intents
     └─ service: text-edit
```

It activates from Select or Typography by double-click/double-tap. Arrange keeps Select active, so text editing can occur without leaving the Arrange workflow.

The target boundary follows browser editability semantics: form controls stay native; descendants that inherit `contenteditable` stay native; a nested `contenteditable="false"` boundary ends that inherited region; ambiguous mixed/nested rich text is not converted into a generic editor.

If Typography was already selected, the normal hover/pinned Typography UI is suppressed during the direct-edit session so the field has one live card.

Direct edit is also the single visible selection owner for its source. The ordinary selected MeasurementBox remains logically mounted so selection identity and measurement geometry survive, but its duplicate border is paint-suppressed while the edit ring is active. The selected dimensions pill remains available. When Typography is placed below the source, the runtime measures the rendered source-to-pill and pill-to-Typography gaps and keeps them symmetric without moving the native source-relative shell on pointer or scroll hot paths.

The selection-adjacent annotation trigger belongs to ordinary selection mode, not direct-edit mode. While a direct editor is active the transient trigger is suppressed and restored when editing ends; durable saved annotation markers, panels, and Context state are independent.

Typography keeps separate interaction and geometry ownership. The card is Mesurer UI for hit testing, but ordinary source-linked cards live in the same page-following geometry model as the edit ring and selected text. Pointer hover changes do not own Typography placement. Native document anchoring owns the source-relative shell, while the measured-spacing adapter can apply a small visual correction inside that shell without rewriting the scroll anchor.

Text and style previews are ownership-aware. Undo/redo can update a value Mesurer still owns. A host-authored change takes ownership and survives later history and cleanup.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange is a renderer-aware first-party plugin exposed as `arrange()` from `mesurer-solid/plugins`.

It owns active state, `Shift+A`, snapping, drag preview, Before/Desired intent, persistence, and review. Activating Arrange enables Select; turning Arrange off leaves Select active; turning Select off exits Arrange.

Arrange previews movement with an inline transform but records the previous value and priority as its baseline. Nested Arrange state keeps descendant movement relative to the nearest arranged ancestor while the public intent retains rendered Before and Desired geometry. A parent drag therefore carries nested targets without applying the same delta twice or pinning descendants to an older viewport position. Cleanup restores the transform baseline only while the current transform still matches Mesurer's preview. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Arrange](./docs/ARRANGE.md).

## Layout Guides

`mesurer.layout-guides` is a first-party plugin exposed as `layoutGuides()` from `mesurer-solid/plugins`.

Its public interface is deliberately small: `MesurerLayoutGuidesService` lists guides and performs add/update/remove/clear operations. Mutations still execute the plugin's JSON-safe commands, so the same operation participates in plugin undo/redo and remains available to generic automation. The mounted package does not grow a parallel set of Layout Guide convenience methods; callers use `MountedMesurer.service<T>(MESURER_LAYOUT_GUIDES_SERVICE_ID)` when they need the typed runtime capability.

Pure guide normalization and layout geometry live in renderer core. The plugin owns page-scoped persisted guide state, the toolbar contribution, panel lifecycle, and evidence overlay. Columns, rows, and grids therefore remain removable without making renderer core depend on their UI.

Context does not declare Layout Guides as a hard requirement. At capture time it resolves `layout-guides:v1` if present and serializes the current page's saved guides into `visualContext.layoutGuides`, including each guide's `visible` flag. This keeps plugin load order and availability independent while preserving the saved layout intent for agents.

## Context

The removable `mesurer.context` plugin owns annotations and the human/agent context workflow:

```text
context()
  ├─ Copy Context / Copy Selection / Add Note
  ├─ session-scoped annotation state + conservative rebinding
  ├─ context/select/review/capture-plan operations
  └─ service: context:v1
```

Injection enables Context by default. Source-mounted applications opt in with `context()` from `mesurer-solid/plugins`.

`window.__MESURER__` remains the shared browser-state boundary for ordinary coding-agent work. Context itself does not know about Codex, sessions, local processes, or transport. Arrange and text-edit intent remain separate structured channels so they retain their own Before/Desired/Live semantics.

The selection Add Note button is only transient UI. Its temporary suppression during direct editing does not disable Context or remove saved annotations.

Context's owning workspace may opt into session-scoped annotation persistence. The first-party Context plugin does so using a page-scoped namespace. Reload restores serialized annotation records before presentation mounts, then the runtime applies the same conservative selector/fingerprint rebind used for ordinary DOM replacement. Other workspace runtimes remain ephemeral unless their owner explicitly supplies a persistence namespace.

Page-linked Context UI uses one managed document inspector mount. The Add Note trigger, composer, saved markers, open panel, and ownership edge use document coordinates for ordinary window scrolling, so the browser moves them with their source in the same frame. Nested overflow boundaries use cached scroll compensation. Saved panels keep a stable target-relative page point instead of re-clamping to the viewport, and repeated notes use a nearby marker layout that keeps each marker separate.

Context also owns the page-evidence stacking rule while that document mount exists. Select hover evidence is portaled into the lower document evidence layer, including when a source-mounted renderer uses `isolate: false` with browser top-layer promotion. This prevents top-layer Select paint from outranking ordinary document annotation cards. The create-note composer and saved panels remain opaque inspector UI above page evidence, while the toolbar remains protected viewport chrome above page-owned boundaries.

See [Context](./docs/CONTEXT_WORKFLOW.md) and [Agent integration](./packages/mesurer/AGENT_INTEGRATION.md).

## Codex delivery

`mesurer.codex` is a first-party transport plugin exposed as `codex()` from `mesurer-solid/plugins`. It depends on Context rather than duplicating annotation or inspection state.

```text
context:v1
   │
   ▼
codex() in renderer
   │
   │ window.__MESURER_HOST__.codexBridge(request)
   ▼
Codex Bridge in native host
   │
   │ codex stdio-to-uds
   ▼
Codex shared local app-server
   ├─ thread/loaded/list
   ├─ thread/list / thread/read
   ├─ thread/queue/add
   └─ thread/turns/list
```

Codex Bridge belongs to the Codex plugin at `packages/mesurer/src/plugins/codex/bridge.mjs` and is published as `mesurer-solid/plugins/codex/bridge`. There is no separate Mesurer Codex process, HTTP listener, port, marketplace package, lifecycle hook, or generated copy.

The renderer receives only a narrow host capability. Electron main/preload can back it with the in-process `codexBridge()` helper. That helper uses Codex's `stdio-to-uds` relay to reach the shared app-server control socket and calls `thread/queue/add` directly. It does not shell through `codex queue`, start a parallel app-server, or locate a sibling runtime file.

Codex is enabled by default with the first-party catalog and remains toggleable in Settings. The plugin's availability persistence treats the temporary beta default-off state as a one-time migration rather than a permanent opt-out.

One page keeps its selected destination in per-tab `sessionStorage`. A saved target remains valid only while Codex reports it as loaded. If no valid target exists and several loaded threads are available, Mesurer requires an explicit human choice.

The `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and canonical `queue(request?)`. `send(request?)` remains a compatibility alias. Mesurer does not create threads and never invokes `turn/steer`.

Codex's native queued-user-message store is the durable source of truth. Mesurer retains only bounded correlation metadata in `$CODEX_HOME/mesurer/codex-deliveries.json` and reads bounded turn history from the same shared daemon. Completion may retire only the annotation ids included in that delivery.

This transport remains separate from `window.__MESURER__`. Coding agents consume Context through the browser controller; Codex delivery is the inverse human action of sending live-page review intent into an already open Codex thread.

## Screenshot

`mesurer.screenshot` is an optional first-party plugin exposed as `screenshot()` from `mesurer-solid/plugins`.

It owns camera activation, region selection, host capture selection, HiDPI crop logic, output preferences, status, thumbnail/viewer UI, commands, service, and cleanup. Screenshot resolves one private capture adapter for each window. It checks `window.__MESURER_HOST__.captureScreenshot`, then the first-party extension adapter, then `getDisplayMedia()`. Electron preload/main can back the host capability with `webContents.capturePage()`. Mesurer does not import Electron or own the application's IPC channels.

The native host contract accepts PNG `Blob`, `ArrayBuffer`, `Uint8Array`, or an object with a `png` field. Screenshot normalizes the result at the adapter boundary and performs region cropping itself. The built-in Color Picker also uses this host capability when present. It waits for a renderer-local pixel selection, hides Mesurer UI, captures once, maps CSS coordinates to the PNG dimensions, and reads that pixel. Browser hosts without native capture keep the operational `EyeDropper` path. If a selected native or extension Screenshot path fails, the operation reports that failure instead of changing to another capture permission model. Normal callers configure only `screenshot()`; the older provider hook remains for published-package compatibility.

Screenshot bytes are not part of `MesurerContextV1`. Human camera capture and coding-agent screenshot evidence remain separate paths.

See [Screenshots](./docs/SCREENSHOTS.md).

## Browser boundary

The default and injected renderer uses a hardened outer host, browser top-layer promotion when available, and an isolated ShadowRoot for its protected viewport UI. Source-mounted `isolate: false` hosts are also supported; they use the same ownership rules without relying on Shadow DOM isolation.

Mesurer deliberately has two managed paint domains. Viewport-owned controls such as the toolbar, Settings, and other global inspector chrome stay in the protected host/top-layer path. Source-linked inspector UI may use the managed document inspector mount so browser scrolling, clipping, and target geometry stay native to the page. Context annotations and ordinary source-linked Typography are examples of document-backed UI.

Document-backed does not mean arbitrary host-page DOM. Those nodes are still Mesurer inspector UI, use the runtime's managed mount and hit-test boundary, and clean up with their owner. When a document-backed inspector must occlude page selection evidence, the related Select paint is moved into the lower document evidence layer too. Leaving Select paint in the browser top layer while its inspector card lives in the document is invalid because browser top-layer ordering beats any ordinary document `z-index`.

The renderer uses Solid's universal runtime and constructs DOM nodes directly rather than depending on HTML-string template sinks, keeping the packed artifact compatible with strict Trusted Types pages without weakening host CSP.

The Chromium extension owns only injection lifecycle and extension-only capabilities. It records explicitly opened tab ids in `chrome.storage.session` and can restore a missing injection after reload or eligible navigation. Its injected session also opts into disconnected-host recovery, so page DOM replacement remounts Mesurer without moving that behavior into renderer core. It keeps the `activeTab` permission model instead of requesting persistent host access; when a navigation revokes that temporary grant, recovery stops until the user explicitly clicks the action again.

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
               existing browser controller
```

Agent attachment reuses an existing Mesurer instance when present. After source changes, verification uses the real Live page: Arrange preview removed, text Desired preview inactive, and fresh Context/measurement/review evidence.

The optional Codex transport does not invert that ownership model for agents. It is a separate explicit human action that serializes Context evidence and queues it into the active registered Codex destination (or another explicitly registered destination for a one-off send).

Temporary Mesurer presentation expresses intent or evidence; it is not proof that source was updated.

## Distribution and release

The public package bundles the private workspaces into self-contained artifacts. Before publication, the exact packed npm artifact is validated across clean React, Solid 1, and Solid 2 consumers.

Release validation also covers browser contracts, host isolation, screenshots, the unified public plugins entry and declarations, Agent Skill packaging, visual parity, and source-first upstream decisions. Optional Codex delivery also validates the packaged companion binary, loopback boundary, registered-thread routing, and exact `codex queue` argument contract before release.

See [Releasing](./RELEASING.md) and [Upstream parity](./docs/UPSTREAM_PARITY.md).