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
             │
             └── optional Codex plugin ──► loopback companion ──► Codex queue
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
| `mesurer-solid` | Mount API, domain types, and agent surface |
| `mesurer-solid/plugins` | All first-party plugin factories and plugin-specific contracts |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic injection helper |
| `mesurer-solid/inject-script` | Self-contained classic browser payload |

The package also ships `mesurer-skill`, the portable `mesurer-ui` Agent Skill, the optional `mesurer-codex` loopback companion, and `mesurer-codex-connect` for trusted session bootstrap. Private workspace names and Solid runtime dependencies must not leak into public JavaScript or declarations.

Public first-party plugin factories use their feature name directly. Applications import `context`, `arrange`, `screenshot`, `codex`, and explicit built-ins such as `select` or `typography` from `mesurer-solid/plugins`; redundant `*Plugin` public factory names and one-plugin-per-subpath exports are not part of the package contract.

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
     ├─ selected/edit chrome ownership
     ├─ measured dimensions-pill clearance
     ├─ Before/Desired history
     ├─ ownership-aware preview
     ├─ state: mesurer.text-edit.intents
     └─ service: text-edit
```

It activates from Select or Typography by double-click/double-tap. Arrange keeps Select active, so text editing can occur without leaving the Arrange workflow.

The target boundary follows browser editability semantics: form controls stay native; descendants that inherit `contenteditable` stay native; a nested `contenteditable="false"` boundary ends that inherited region; ambiguous mixed/nested rich text is not converted into a generic editor.

If Typography was already selected, the normal hover/pinned surface is suppressed during the direct-edit session so the field has one live card.

Direct edit is also the single visible selection owner for its source. The ordinary selected MeasurementBox remains logically mounted so selection identity and measurement geometry survive, but its duplicate border is paint-suppressed while the edit ring is active. The selected dimensions pill remains available. When Typography is placed below the source, the runtime measures the rendered source → pill and pill → Typography gaps and keeps them symmetric without moving the native source-relative shell on pointer or scroll hot paths.

The selection-adjacent annotation trigger belongs to ordinary selection mode, not direct-edit mode. While a direct editor is active the transient trigger is suppressed and restored when editing ends; durable saved annotation markers, panels, and Context state are independent.

Typography keeps separate interaction and geometry ownership. The card is Mesurer UI for hit testing, but ordinary source-linked cards live in the same page-following geometry model as the edit ring and selected text. Pointer hover changes do not own Typography placement. Native document anchoring owns the source-relative shell, while the measured-spacing adapter can apply a small visual correction inside that shell without rewriting the scroll anchor.

Text and style previews are ownership-aware. Undo/redo can update a value Mesurer still owns. A host-authored change takes ownership and survives later history and cleanup.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange is a renderer-aware first-party plugin exposed as `arrange()` from `mesurer-solid/plugins`.

It owns active state, `Shift+A`, snapping, drag preview, Before/Desired intent, persistence, and review. Activating Arrange enables Select; turning Arrange off leaves Select active; turning Select off exits Arrange.

Arrange previews movement with an inline transform but records the previous value and priority as its baseline. Cleanup restores that baseline only while the current transform still matches Mesurer's preview. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Arrange](./docs/ARRANGE.md).

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

`mesurer.codex` is an optional first-party transport plugin exposed as `codex()` from `mesurer-solid/plugins`. It depends on the Context service rather than duplicating annotation or inspection state.

```text
context:v1
   │
   ▼
codex()
   ├─ Queue to Codex tool / command
   ├─ service: codex:v1
   └─ browser HTTP only after send / chooser / explicit service call
                  │
                  ▼
          loopback companion
             │          │
             │          └─ codex app-server thread/list
             │                 │
             │                 └─ recent threads scoped to trusted cwd
             │
             ├─ trusted local registration
             │      ▲
             │      └─ SessionStart / mesurer-codex-connect
             │          session id + project cwd
             │
             ├─ delivery lifecycle
             │      ▲
             │      └─ UserPromptSubmit / Stop / Interrupt
             │          exact queued turn state
             │
             └─ codex queue --thread … --message …
```

The companion is outside the browser because a framework-agnostic web package cannot spawn the local Codex executable. It binds to `127.0.0.1`, limits request size and browser origins, and invokes Codex without a shell. `mesurer-codex-connect` is the normal Codex-controlled lifecycle: it reuses or starts the companion and registers the trusted session id plus project directory. The low-level `mesurer-codex` foreground command remains available for diagnostics and explicit ownership.

The browser plugin performs no loopback request merely because it is mounted. The first send or **Choose Codex thread…** action establishes availability. A failed first contact becomes **Codex unavailable** with explicit retry rather than generating periodic CSP/network errors. After one successful contact, the page may health-check that known companion so a later outage disables the action and a restart restores it automatically.

The first unambiguous healthy thread observed by a page becomes that page's origin. The browser persists that origin and any explicit page-local override in per-tab `sessionStorage`, keyed by bridge endpoint plus page origin/pathname, so reloads preserve routing without creating a global browser preference. Later local registrations update the shared companion without silently retargeting the page. If no persisted affinity exists and multiple threads are registered, the browser requires an explicit choice rather than inheriting the bridge-wide active thread. The bridge uses Codex app-server `thread/list` with the trusted project directory to expose at most ten recent same-project threads, while the page picker starts with five and can expand once to ten.

Thread registration remains a local-process capability. Browser code cannot register an arbitrary thread id, choose an arbitrary discovery directory, or widen the bridge to account-wide history. It may send to a locally registered thread or to a same-project recent thread that the bridge already discovered. The `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, and `send({ thread })`.

Mesurer does not create a Codex thread. New threads are created or opened in Codex, whose trusted `SessionStart` path registers the destination and its execution owner.

Codex's native queued-user-message store is the durable source of truth for every Mesurer delivery. The bridge retains Codex's queued-submission id and keeps only bounded tracking state in `$CODEX_HOME/mesurer/codex-deliveries.json` so a bridge restart can resume lifecycle correlation without creating another message.

When `SessionStart` marks a destination as Codex Desktop-owned, Mesurer does not use the app-tools pipe as the delivery channel. It opens the existing thread through `codex://threads/<threadId>`, the same Desktop deep link used by Codex itself. Desktop loads or resumes that thread; Codex's queue extension watches durable external queue changes for loaded threads, and a cold resume starts the persisted queued message. Active threads leave queued input pending until Codex can accept it. The existing queued-submission id is preserved rather than deleted and resent.

For CLI/TUI shared-daemon sessions, the same native Codex queue remains authoritative. A `notLoaded` destination may be resumed through the shared daemon so Codex drains its own queue. Mesurer does not bootstrap or require that standalone daemon for Desktop.

Queue and Steer remain separate Codex operations. Mesurer never invokes `turn/steer`; Desktop wake only opens the existing thread and leaves scheduling to Codex's queue lifecycle.

This path is deliberately **not** part of `window.__MESURER__` and is not required for coding agents to use Mesurer. Agents continue to consume Context through their existing browser harness. Codex delivery exists for the inverse human action: a person reviews the live page in Mesurer and asks a known Codex thread to act on that feedback.

Each queue request has a bounded bridge delivery record. The browser enters a busy state before the request starts, so repeat clicks cannot create duplicate submissions. The bridge correlates the exact queued prompt to `UserPromptSubmit`, then records matching `Stop` or `Interrupt` by thread and turn id. Out-of-order terminal hook delivery is tolerated. Browser polling reads only that delivery record. While a delivery is queued or working, the browser also persists the delivery id, destination, state, and exact annotation ids in per-tab `sessionStorage`; a reload resumes polling that same record instead of forgetting completion cleanup.

Context exposes an internal first-party `removeAnnotation(id)` service operation for completion cleanup. It is not added to the generic `window.__MESURER__` agent harness. On a completed tracked delivery, Codex removes only the annotation ids that were serialized into that request; interruption/failure preserves them. Applications may disable this cleanup with `clearCompletedAnnotations: false`. A Stop event is treated as workflow completion, not as independent proof that the requested visual change is semantically correct.

See [Queue Context feedback to Codex](./docs/CODEX.md).
## Screenshot

`mesurer.screenshot` is an optional first-party plugin exposed as `screenshot()` from `mesurer-solid/plugins`.

It owns camera activation, region selection, capture provider, HiDPI crop logic, output preferences, status, thumbnail/viewer UI, commands, service, and cleanup. Normal browser hosts use `getDisplayMedia()`; the Chromium extension uses `chrome.tabs.captureVisibleTab()` through an isolated-world bridge and the existing `activeTab` grant.

Screenshot bytes are not part of `MesurerContextV1`. Human camera capture and coding-agent screenshot evidence remain separate paths.

See [Screenshots](./docs/SCREENSHOTS.md).

## Browser boundary

The default and injected renderer uses a hardened outer host, browser top-layer promotion when available, and an isolated ShadowRoot for its protected viewport UI. Source-mounted `isolate: false` hosts are also supported; they use the same ownership rules without relying on Shadow DOM isolation.

Mesurer deliberately has two managed paint domains. Viewport-owned controls such as the toolbar, Settings, and other global inspector chrome stay in the protected host/top-layer path. Source-linked inspector UI may use the managed document inspector mount so browser scrolling, clipping, and target geometry stay native to the page. Context annotations and ordinary source-linked Typography are examples of document-backed UI.

Document-backed does not mean arbitrary host-page DOM. Those nodes are still Mesurer inspector UI, use the runtime's managed mount and hit-test boundary, and clean up with their owner. When a document-backed inspector must occlude page selection evidence, the related Select paint is moved into the lower document evidence layer too. Leaving Select paint in the browser top layer while its inspector card lives in the document is invalid because browser top-layer ordering beats any ordinary document `z-index`.

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

The optional Codex transport does not invert that ownership model for agents. It is a separate explicit human action that serializes Context evidence and queues it into the active registered Codex destination (or another explicitly registered destination for a one-off send).

Temporary Mesurer presentation expresses intent or evidence; it is not proof that source was updated.

## Distribution and release

The public package bundles the private workspaces into self-contained artifacts and is validated as an exact packed npm candidate across clean React, Solid 1, and Solid 2 consumers.

Release validation also covers browser contracts, host isolation, screenshots, the unified public plugins entry and declarations, Agent Skill packaging, visual parity, and source-first upstream decisions. Optional Codex delivery additionally validates the packaged companion binary, loopback boundary, registered-thread routing, and exact `codex queue` argument contract before release.

See [Releasing](./RELEASING.md) and [Upstream parity](./docs/UPSTREAM_PARITY.md).