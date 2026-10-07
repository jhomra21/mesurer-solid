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
        Context plugin     Edit plugin      Capture plugins
             │               │              ├─ Screenshot
             │         Layout Guides        └─ Recording
             │
             └── optional Codex plugin ──► native host Bridge ──► Codex shared app-server
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
| `mesurer-solid/inject-script` | Classic Mesurer browser payload; raw evaluators load the separate MediaBunny vendor first |
| `mesurer-solid/mediabunny-vendor` | Separate MPL-2.0 MediaBunny classic runtime for Recording injection/extension use |
| `mesurer-solid/electron` | Preferred Electron main-process bootstrap for package-owned Recording capture |
| `mesurer-solid/plugins/codex/bridge` | Native Codex transport and Electron main-process host adapter |
| `mesurer-solid/plugins/codex/preload` | Bundle-friendly Electron preload adapter for the Codex host capability |
| `mesurer-solid/plugins/recording/bridge` | Advanced Electron Recording host adapter for custom sender/lifecycle policy |
| `mesurer-solid/plugins/recording/preload` | Advanced Electron Recording preload adapter |

The package also ships `mesurer-skill`, the portable `mesurer-ui` Agent Skill. Private workspace names and Solid runtime dependencies must not leak into public JavaScript or declarations.

Public first-party plugin factories use their feature name directly. Applications import `context`, `edit`, `layoutGuides`, `screenshot`, `recording`, `codex`, and explicit built-ins such as `select` or `typography` from `mesurer-solid/plugins`; `arrange()` remains a compatibility alias; redundant `*Plugin` public factory names and one-plugin-per-subpath exports are not part of the package contract.

`mountMesurer()` is the single application-facing construction seam. It owns host creation, renderer startup, built-in defaults, first-party plugin registration, persistence wiring, optional global agent exposure, and disposal. The returned handle is the lifecycle interface. `ready` resolves the live plugin host after startup and initial rendered stability, `service()` and `describe()` wait at that seam, and an optional `AbortSignal` can transfer cleanup ownership to an existing application lifecycle. Do not add a second create/configure factory that asks callers to assemble the same implementation in another form.

## Workspace ownership

### Core

`packages/mesurer-core` owns observable state, commands, history, plugin registration, state slices, tools, settings, overlays, hooks, services, capability introspection, serialization, and shared domain contracts. It does not import Solid, Electron, or browser globals.

Plugin registrations are owned and disposable. Commands may return JSON-safe `PluginValue` results, so generic automation can invoke one command path without losing useful output. Services remain opaque typed runtime capabilities; normal mounted consumers resolve them through `MountedMesurer.service<T>(id)` rather than reaching through the host registry.

Asynchronous setup is an in-flight load that can be cancelled. If cancellation happens while setup is awaiting, later registrations are disposed immediately rather than reviving resources after their owner is gone.

Cancellation is scoped to the load that started it. Code using a shared plugin host must not dispose unrelated plugins.

### DOM boundary

`packages/mesurer-dom` owns browser/document helpers, storage adapters, Electron-renderer detection, box-model inspection, selectors, fingerprints, DOM identity, and rich element inspection.

Select, Context rebinding, point inspection, and programmatic `select()` accept general DOM `Element` targets, including SVG. Edit movement and direct text editing narrow back to `HTMLElement` before they mutate presentation or text. Rebinding is conservative: weak structural position alone is not enough to transfer human intent to another element.

### Renderer

`packages/renderer` owns the isolated Solid 2 UI/lifecycle adapter and browser interaction runtime.

Within the renderer runtime, direct editing is grouped under `runtime/text-editing/` and shared Typography inspector code under `runtime/typography/`. Document mounts, scrolling, selection channels, presentation preferences, and workspace Context remain shared runtime code rather than being pulled into those feature folders.

Human-facing built-ins are Select, X-ray, Color Picker when supported, Rulers, Typography, Guides, Distance, and Settings. Typography retains the internal compatibility id `text-inspector`. Distance geometry is specified in [Measurements and distance geometry](./docs/MEASUREMENTS.md).

The toolbar has two top-level modes. Select owns selection-first inspection and capture tools such as X-ray, Color Picker, Typography, Screenshot, and Recording. Edit owns element movement and direct text/style editing. Rulers, ordinary Guides, and Layout Guides stay available in both modes; Context and Codex also stay visible in both modes. The mode switch follows the audited upstream grouped-toolbar design while Mesurer Solid keeps 150 ms motion. Compact presentation preserves the active mode and pinned tools. Dragging begins only after the pointer crosses the drag threshold, and menus, dialogs, form controls, editable regions, and sliders retain pointer ownership.

Plugin tools render through the same toolbar path as built-ins instead of maintaining a second renderer.

The runtime owns page identity; feature code does not check specific URLs. The default route key uses pathname plus sorted query parameters and includes hash routes only for `#/` navigation. Page-owned workspace state uses that key, while viewport and session state do not. Toolbar placement lives in tab `sessionStorage`, so route changes can swap page evidence without moving the toolbar.

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

It activates only while Edit is active. Typography remains a read-only inspection tool in Select. The renderer exposes the current top-level toolbar mode to text-editing runtimes so direct editing cannot leak back into Select.

The target boundary follows browser editability semantics: form controls stay native; descendants that inherit `contenteditable` stay native; a nested `contenteditable="false"` boundary ends that inherited region; ambiguous mixed/nested rich text is not converted into a generic editor.

If Typography was already selected, the normal hover/pinned Typography UI is suppressed during the direct-edit session so the field has one live card.

Direct edit is also the single visible selection owner for its source. The ordinary selected MeasurementBox remains logically mounted so selection identity and measurement geometry survive, but its duplicate border is paint-suppressed while the edit ring is active. The selected dimensions pill remains available. When Typography is placed below the source, the runtime measures the rendered source-to-pill and pill-to-Typography gaps and keeps them symmetric without moving the native source-relative shell on pointer or scroll hot paths.

The selection-adjacent annotation trigger belongs to ordinary selection mode, not direct-edit mode. While a direct editor is active the transient trigger is suppressed and restored when editing ends; durable saved annotation markers, panels, and Context state are independent.

Typography keeps separate interaction and geometry ownership. The card is Mesurer UI for hit testing, but ordinary source-linked cards live in the same page-following geometry model as the edit ring and selected text. Pointer hover changes do not own Typography placement. Native document anchoring owns the source-relative shell, while the measured-spacing adapter can apply a small visual correction inside that shell without rewriting the scroll anchor.

Text and style previews are ownership-aware. Undo/redo can update a value Mesurer still owns. A host-authored change takes ownership and survives later history and cleanup.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Edit

Edit is a renderer-aware first-party plugin exposed canonically as `edit()` from `mesurer-solid/plugins`. The `arrange()` factory remains a compatibility alias, and existing Arrange state ids, service ids, persistence, and agent method names stay stable.

Edit owns movement state, snapping, drag preview, Before/Desired intent, persistence, and review. Entering Edit enables Select as its targeting prerequisite; leaving Edit keeps Select active, while turning Select off exits Edit. The legacy `Shift+A` shortcut still enters Edit for compatibility.

Edit movement previews an inline transform but records the previous value and priority as its baseline. Persisted movement still uses the existing Arrange schema. Nested movement state keeps descendant movement relative to the nearest moved ancestor while the public intent retains rendered Before and Desired geometry. A parent drag therefore carries nested targets without applying the same delta twice or pinning descendants to an older viewport position. Cleanup restores the transform baseline only while the current transform still matches Mesurer's preview. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Edit](./docs/EDIT.md) and [Arrange compatibility](./docs/ARRANGE.md).

## Layout guides

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

`window.__MESURER__` remains the shared browser-state boundary for ordinary coding-agent work. Context itself does not know about Codex, sessions, local processes, or transport. Edit movement and text-edit intent remain separate structured channels so they retain their own Before/Desired/Live semantics. The movement channel keeps its existing Arrange API names for compatibility.

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
   │ app-server control socket
   ▼
Codex transport adapters
   ├─ shared app-server
   │  ├─ thread/loaded/list
   │  ├─ thread/list / thread/read
   │  ├─ thread/queue/add
   │  └─ thread/turns/list
   └─ inherited Desktop current thread
      ├─ codex queue --thread <exact inherited id>
      └─ codex://threads/<same id>
```

Codex has two local transport implementations behind one renderer-facing `codex:v1` service. The Electron transport belongs to `packages/mesurer/src/plugins/codex/bridge.mjs` and is published as `mesurer-solid/plugins/codex/bridge`. Electron main installs `installMesurerCodexHost()`; a bundled preload exposes `createMesurerCodexPreloadBridge()`. The main adapter validates the caller and binds each activation lease to the invoking renderer.

Browser renderers cannot use native process/socket APIs, so they use the package-owned loopback companion under `packages/mesurer/codex/`, distributed through the optional `plugins/mesurer-codex` helper and npm companion commands. Codex SessionStart starts/reuses the helper and registers the local session; SessionEnd unregisters it. The companion binds only to loopback, validates browser origins, advertises a versioned capability contract on `/health`, and is distinct from the Mesurer Solid OpenAI agent plugin.

Behind either renderer transport, Codex delivery prefers exact inherited Desktop ownership when it is available and otherwise uses Codex's reachable shared app-server. Exact Desktop ownership uses one durable `queue` command and the native `codex://` wake; the private app-tools pipe is never opened. Shared delivery calls `thread/queue/add` and may start the shared daemon only from a complete standalone Codex installation.

Electron hosts with the native bridge start Codex enabled and use transactional renderer leases. Browser hosts keep Codex registered in Settings but default it off; enabling verifies the loopback companion's identity/protocol/capabilities and self-heals when a compatible helper appears. Missing, outdated, and conflicting helpers remain explicit fail-closed states. Disabling removes page-owned Codex service/UI/timers; it never unregisters Codex-owned sessions or stops a shared companion. A companion can be replaced or shut down only when it has no registered owners and no queued/working delivery.

One page keeps its selected destination in per-tab `sessionStorage`. A saved target remains valid only while Codex reports it as loaded. If no valid target exists and several loaded threads are available, Mesurer requires an explicit human choice.

The `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and canonical `queue(request?)`. `send(request?)` remains a compatibility alias. Mesurer does not create threads and never invokes `turn/steer`.

Codex's native queued-user-message store is the durable source of truth. Mesurer retains only bounded correlation metadata in `$CODEX_HOME/mesurer/codex-deliveries.json`. Shared delivery can reconcile lifecycle from the same daemon. Desktop-current-thread delivery remains queued when lifecycle cannot be proven without crossing Desktop's private transport. Mesurer keeps the durable queue receipt visible and never requeues only to obtain status. Completion may retire only the annotation ids included in a delivery whose exact completion is known.

This transport remains separate from `window.__MESURER__`. Coding agents consume Context through the browser controller; Codex delivery is the inverse human action of sending live-page review intent into an already open Codex thread.

## Screenshot

`mesurer.screenshot` is an optional first-party plugin exposed as `screenshot()` from `mesurer-solid/plugins`.

It owns camera activation, region selection, host capture selection, HiDPI crop logic, output preferences, status, thumbnail/viewer UI, commands, service, and cleanup. Screenshot resolves one private capture adapter for each window. It checks `window.__MESURER_HOST__.captureScreenshot`, then the first-party extension adapter, then `getDisplayMedia()`. Electron preload/main can back the host capability with `webContents.capturePage()`. Mesurer does not import Electron or own the application's IPC channels.

The native host contract accepts PNG `Blob`, `ArrayBuffer`, `Uint8Array`, or an object with a `png` field. Screenshot normalizes the result at the adapter boundary and performs region cropping itself. Native PNGs with alpha are flattened against an opaque renderer backdrop before region output so macOS vibrancy/transparency does not leak into the thumbnail, clipboard image, or saved file. The built-in Color Picker also uses this host capability when present. It waits for a renderer-local pixel selection, hides Mesurer UI, captures once, maps CSS coordinates to the PNG dimensions, and reads that pixel. Browser hosts without native capture keep the operational `EyeDropper` path. If a selected native or extension Screenshot path fails, the operation reports that failure instead of changing to another capture permission model. Normal callers configure only `screenshot()`; the older provider hook remains for published-package compatibility.

Screenshot bytes are not part of `MesurerContextV1`. Human camera capture and coding-agent screenshot evidence remain separate paths.

See [Screenshots](./docs/SCREENSHOTS.md).

## Recording

`mesurer.recording` is a first-party plugin exposed as `recording()` from `mesurer-solid/plugins`.

Recording deliberately separates acquisition from encoded media:

```text
browser getDisplayMedia ─────┐
extension tabCapture id ──────┼─ live video source ─> selected-region canvas ─> MediaBunny
Electron WebContents stream id┘                                      │
                                                                     ├─ encode
                                                                     ├─ inspect
                                                                     ├─ trim
                                                                     ├─ resize
                                                                     └─ WebM / MP4 export
```

Browser, extension, and native-host APIs only acquire a video stream. There is no `MediaRecorder` path and no offscreen recording service. A one-use extension tab stream is consumed in the page when possible. In Electron, `mesurer-solid/electron` owns the native bridge: it registers a private main-frame preload with each Electron session and uses `WebContents.getMediaSourceId(requestWebContents)` to issue a short-lived source id bound to the requesting renderer. Applications do not need Recording IPC or preload code. The older explicit host/preload helpers remain compatibility surfaces for custom sender policy. When no native or extension source exists, Recording uses the browser display picker. Region Capture is used when available, with a geometry-correct canvas fallback for HiDPI and letterboxed streams.

The plugin owns `recording:v1`, selection, lifecycle state, preview/editor UI, backpressure, and cleanup. MediaBunny owns every encoded-media operation. The public Recording types do not expose MediaBunny classes.

MediaBunny is MPL-2.0 and stays on a separate distribution boundary. Public ESM artifacts leave exact `mediabunny@1.59.0` external. Raw classic injection and the extension load the separate `mediabunny-vendor.js` file before Mesurer. Mesurer's MIT-generated bundles must not absorb that vendor implementation.

See [Recording](./docs/RECORDING.md).

## Browser boundary

The default and injected renderer uses a hardened outer host, browser top-layer promotion when available, and an isolated ShadowRoot for its protected viewport UI. Source-mounted `isolate: false` hosts are also supported; they use the same ownership rules without relying on Shadow DOM isolation.

Mesurer deliberately has two managed paint domains. Viewport-owned controls such as the toolbar, Settings, and other global inspector chrome stay in the protected host/top-layer path. Source-linked inspector UI may use the managed document inspector mount so browser scrolling, clipping, and target geometry stay native to the page. Context annotations and ordinary source-linked Typography are examples of document-backed UI.

Document-backed does not mean arbitrary host-page DOM. Those nodes are still Mesurer inspector UI, use the runtime's managed mount and hit-test boundary, and clean up with their owner. When a document-backed inspector must occlude page selection evidence, the related Select paint is moved into the lower document evidence layer too. Leaving Select paint in the browser top layer while its inspector card lives in the document is invalid because browser top-layer ordering beats any ordinary document `z-index`.

The renderer uses Solid's universal runtime and constructs DOM nodes directly rather than depending on HTML-string template sinks, keeping the packed artifact compatible with strict Trusted Types pages without weakening host CSP.

The Chromium extension owns injection lifecycle and private extension-only capture capabilities. Screenshot uses `captureVisibleTab`; Recording uses `tabCapture` only to acquire the current-tab stream. It records explicitly opened tab ids in `chrome.storage.session` and can restore a missing injection after reload or eligible navigation. Its injected session also opts into disconnected-host recovery, so page DOM replacement remounts Mesurer without moving that behavior into renderer core. It keeps the `activeTab` permission model instead of requesting persistent host access; when a navigation revokes that temporary grant, recovery stops until the user explicitly clicks the action again.

See [Host isolation](./docs/HOST_ISOLATION.md) and [Trusted Types](./docs/TRUSTED_TYPES.md).

## Local ChatGPT/Codex plugin boundary

The repository can also act as a local Agent Plugins package. This is integration tooling around the existing browser boundary, not another renderer architecture.

```text
ChatGPT Desktop / Codex / local coding harness
                  │
          browser/computer use
                  │
                  ▼
             Mesurer UI
                  │
                  ├── window.__MESURER__ structured browser API
                  │
                  └── optional local stdio MCP shortcuts
```

The browser UI remains sufficient on its own. The optional MCP server launches an isolated fallback browser only when no browser harness already exists; it does not take over an agent's active browser session. It reuses the same injection artifact and agent API and introduces no page daemon, hosted relay, Electron IPC namespace, or separate source-editing agent.

See [ChatGPT and Codex plugin](./docs/CHATGPT_CODEX_PLUGIN.md).

## Human/agent boundary

The page is shared state:

```text
human selection / notes / Edit movement / text Desired
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

Agent attachment reuses an existing Mesurer instance when present. After source changes, verification uses the real Live page: Edit movement preview removed, text Desired preview inactive, and fresh Context/measurement/review evidence.

The optional Codex transport does not invert that ownership model for agents. It is a separate explicit human action that serializes Context evidence and queues it into the active registered Codex destination (or another explicitly registered destination for a one-off send).

Temporary Mesurer presentation expresses intent or evidence; it is not proof that source was updated.

## Distribution and release

The public package bundles the private Mesurer workspaces into self-contained artifacts while keeping MediaBunny external as an exact runtime dependency. Before publication, the exact packed npm artifact is validated across clean React, Solid 1, and Solid 2 consumers.

Release validation also covers browser contracts, host isolation, screenshots, Recording with real changing-frame MediaBunny output, the MediaBunny MPL/package boundary, the unified public plugins entry and declarations, Agent Skill packaging, visual parity, and source-first upstream decisions. Optional Codex delivery validates shared-daemon routing, activation leases, exact Desktop queue arguments, native deep-link wake, no private-pipe connection, and bundled Electron main and preload adapters.

See [Releasing](./RELEASING.md) and [Upstream parity](./docs/UPSTREAM_PARITY.md).