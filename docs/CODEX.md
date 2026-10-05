# Queue Context feedback to Codex

Mesurer can queue human visual feedback into Codex threads that are already open on the same computer.

This is Mesurer's own **Codex** integration in **Settings -> Plugins**. It is separate from the **Mesurer Solid** ChatGPT/Codex agent plugin. The Settings integration is available in browser and Electron hosts; only its transport changes.

## How it works

```text
Mesurer Context / saved notes
           |
           v
        codex:v1
           |
           +--> browser page
           |      |
           |      +--> 127.0.0.1:47365
           |             |
           |             +--> Mesurer Codex Bridge
           |                    +--> Codex shared app-server / CLI
           |                    +--> Codex Desktop queue + deep link
           |
           +--> Electron/native host
                  |
                  +--> window.__MESURER_HOST__.codexBridge(request)
                         |
                         +--> in-process native Codex Bridge
                                +--> Codex shared app-server / CLI
                                +--> inherited Desktop current thread
```

Browser pages cannot open Codex's local socket or spawn a process. They therefore use the optional local **Mesurer Codex Bridge** companion over loopback HTTP. Electron applications can avoid that helper and expose the in-process native bridge through preload.

Both transports implement the same `codex:v1` service and the same **Queue to Codex** UI. Callers do not select CLI versus Desktop or browser versus Electron.

The local Mesurer Codex Bridge helper is not the OpenAI Mesurer Solid agent plugin. Installing the agent plugin teaches ChatGPT/Codex how to operate Mesurer; installing/running the bridge helper lets Mesurer itself send Context into local Codex threads.

## Native host wiring

A sandboxed renderer cannot open Codex's local socket or spawn Codex. Electron applications install one narrow host capability during window setup.

In Electron main:

```ts
import { BrowserWindow, ipcMain } from "electron"
import { installMesurerCodexHost } from "mesurer-solid/plugins/codex/bridge"

const codexHost = installMesurerCodexHost({
  ipcMain,
  validateSender(event) {
    const window = BrowserWindow.fromWebContents(event.sender)

    return Boolean(window && !window.isDestroyed())
  },
})

// Call codexHost.dispose() when the application tears down this integration.
```

In preload:

```ts
import { contextBridge, ipcRenderer } from "electron"
import {
  createMesurerCodexPreloadBridge,
} from "mesurer-solid/plugins/codex/preload"

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  codexBridge: createMesurerCodexPreloadBridge(ipcRenderer),
})
```

Electron sandboxes preload scripts by default. A sandboxed preload cannot load arbitrary CommonJS dependencies at runtime, so bundle the preload when it imports `mesurer-solid/plugins/codex/preload`. Keep `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.

If the application already exposes `window.__MESURER_HOST__` for Screenshot, add `codexBridge` to that object.

`validateSender(event)` is required. The helper rejects subframes and any sender the application does not approve, binds each activation lease to the invoking `WebContents`, and releases that renderer's leases on navigation, renderer exit, or destruction.

This is application integration, not a user setup step. Once the host installs the capability, users do not run a Mesurer bridge command, choose a port, or manage another process.

The Codex Bridge export does not use `import.meta.url`, `process.execPath`, or package-relative runtime lookup. Electron main can bundle it to CommonJS without recovering Mesurer's source path.

## Settings lifecycle

Codex remains listed under **Settings -> Plugins** in both browser and Electron hosts.

Electron/native hosts with `window.__MESURER_HOST__.codexBridge` start Codex enabled. Enabling there is transactional: Mesurer acquires one renderer-scoped native lease and proves Codex readiness before the switch commits. Disabling waits for lease release.

Browser hosts start Codex off by default. When the user enables it, Mesurer keeps the plugin enabled and probes the local companion at `http://127.0.0.1:47365`. The browser verifies the helper's Mesurer identity, protocol version, and required capabilities before using it. A missing helper shows **Codex bridge not running**; an older helper shows **Update Codex Bridge**; an unrelated process on the port shows **Codex bridge conflict**. While the toggle remains on, Mesurer periodically rechecks and connects automatically when a compatible helper appears.

The browser helper is normally started or reused by the optional **Mesurer Codex Bridge** local Codex plugin when a Codex session starts. It can also be run directly with the packaged `mesurer-codex` / `mesurer-codex-connect` commands for diagnostics. Bridge compatibility is defined by the versioned protocol and required capabilities, not by an exact source hash, so compatible helpers from another checkout are reused. An incompatible helper may be replaced only when it advertises idle-safe shutdown and reports zero registered owners and zero queued/working deliveries.

Turning the Mesurer Codex plugin off removes that page's service, toolbar registration, polling, and delivery timers. Browser pages do not own the shared companion, so toggle-off does not unregister Codex sessions or stop the helper. Electron toggle-off releases that renderer's native lease before plugin removal. Neither path stops Codex's shared app-server.

## Desktop and standalone runtimes

The Codex plugin has one API for Codex. Callers do not select a CLI or Desktop implementation.

The native bridge resolves the runtime behind that API. A reachable shared app-server is used as-is. If no shared server is running, the bridge can start one from an existing complete standalone Codex installation. It checks managed packages under `CODEX_HOME` before `PATH`. Mesurer never installs Codex.

Codex Desktop uses the same Mesurer API. If Desktop is attached to the shared app-server, Mesurer uses that transport normally. If the application host was launched from a Codex Desktop thread, Codex injects the exact `CODEX_THREAD_ID` into that execution environment. Desktop also supplies `CODEX_APP_TOOLS_PIPE_PATH`. Mesurer requires both signals before enabling its current-thread Desktop fallback.

That fallback does not connect to the private pipe. It uses the resolved Codex executable only to durably queue to the exact inherited thread, then opens `codex://threads/<id>` so Desktop wakes or resumes that same thread. The Desktop-bundled executable is never used to bootstrap the shared daemon.

If neither inherited ownership nor a shared app-server is available, Mesurer reports the private Desktop runtime as unavailable instead of guessing which Desktop thread is current.

Runtime choice stays inside the Codex plugin. Host applications expose only `codexBridge(request)`, and renderer code keeps using `codex:v1` for health, thread discovery, target selection, queueing, and delivery state.

## Thread discovery

For the shared transport, Codex's shared local app-server defines which threads are sendable. The bridge asks for `thread/loaded/list`, reads bounded metadata through `thread/list`, and falls back to `thread/read` when needed.

For the inherited Desktop-current-thread transport, the only sendable destination is the exact inherited `CODEX_THREAD_ID`. Mesurer does not scan writer-lock files, infer focus from recency, or accept an arbitrary Desktop thread id.

The destination picker is bounded to ten loaded threads. It uses the thread name when available, then the preview, then a shortened id.

One Mesurer page keeps its chosen thread in per-tab `sessionStorage`. On reload:

- if that thread is still loaded, Mesurer keeps it;
- if exactly one loaded thread exists, Mesurer can use it;
- if several loaded threads exist with no valid saved choice, the toolbar requires a human choice;
- if the saved thread is no longer loaded, Mesurer does not silently queue into another thread.

Mesurer never creates a Codex thread. Open or create the thread in Codex first.

## Queue delivery

Mesurer implements **Queue**, not **Steer**.

When the user presses **Queue to Codex**, Mesurer queues exactly once through the active internal adapter.

On the shared-app-server path, the bridge verifies the destination with `thread/loaded/list`, calls `thread/queue/add` directly, keeps Codex's queued-submission id and client user-message id, and correlates lifecycle through bounded turn history on the same server.

On the inherited Desktop-current-thread path, the bridge accepts only the inherited thread, invokes `codex queue --thread <id> --message <text>`, keeps the queued-submission id, and opens `codex://threads/<id>`. The deep link is a wake step, not a second message submission. If the wake fails after persistence, Mesurer reports the wake diagnostic and does not requeue.

Desktop fallback delivery remains **Queued** unless Mesurer can prove a later lifecycle state without crossing the private Desktop transport. The toolbar keeps that durable queue receipt visible and shows the queued-submission id in the destination menu. The receipt does not block a later queue action. Mesurer does not report **Working** or **Finished** from UI assumptions.

## Delivery persistence

Mesurer keeps bounded correlation metadata under:

```text
$CODEX_HOME/mesurer/codex-deliveries.json
```

This file stores the Mesurer delivery id, destination thread, queued-submission id, Codex client user-message id when available, prompt hash, and last known lifecycle state. It is not a second message queue. Codex's queue remains the durable queue.

The renderer keeps the active delivery id, destination thread, lifecycle state, exact annotation ids, and available Codex correlation ids in per-tab `sessionStorage` while a delivery is active or reconcilable. A tracked **Queue failed** state remains recoverable; retry attempts restoration before Mesurer can submit another message.

A queued submission disappears from `thread/queue/list` after Codex consumes it. Recovery therefore checks the exact queue receipt first, then bounded turn history. New deliveries correlate by Codex's client user-message id. Older persisted UI state that predates that field may rebuild the exact Mesurer feedback from its still-saved annotation ids and recover only when exactly one history user message has the same text. Mesurer never requeues during restoration.

If history cannot be read or the exact client/message identity cannot be matched uniquely, Mesurer leaves the delivery and annotations intact and fails closed.

## Completed annotations

When a queued request contains saved Mesurer annotations, `codex()` remembers the exact annotation ids included in that message.

After the exact matched Codex turn reaches **Codex finished**, Mesurer removes only those delivered annotations. Notes created later, notes excluded from the message, and annotations from interrupted or failed work remain.

Automatic cleanup defaults on. To retain completed notes:

```ts
codex({ clearCompletedAnnotations: false })
```

Codex turn completion is transport state, not proof that the requested visual result is correct.

## Process lifetime

The two transports have different ownership.

The Electron/native bridge runs in the application host process. It opens short-lived connections to Codex's shared app-server and holds only renderer-scoped Mesurer leases. Mesurer never stops Codex's shared daemon.

Browser pages use the local **Mesurer Codex Bridge** companion on loopback. The helper may outlive one Mesurer page because multiple pages or Codex sessions can reuse it. Codex's SessionStart integration starts or reuses the helper and registers the current session; SessionEnd unregisters that session. If a Desktop owner disappears before SessionEnd can run, the companion also reaps registrations whose ownership anchor disappeared.

The companion shuts itself down only after the last registered Codex owner is gone **and** no queued/working Mesurer delivery remains. Explicit local shutdown is rejected while either condition is still active. This lets a pending receipt finish and remain recoverable even after the originating Codex session begins teardown.

The companion is local-only. It is not a hosted relay and is not part of the OpenAI Mesurer Solid agent plugin.

## Public service

`codex()` exposes `codex:v1`:

```ts
type MesurerCodexService = {
  health(): Promise<MesurerCodexHealth>
  listThreads(options?: MesurerCodexThreadListOptions): Promise<MesurerCodexThreadList>
  useThread(thread: string): Promise<MesurerCodexHealth>
  delivery(deliveryId: string): Promise<MesurerCodexDelivery>
  queue(request?: MesurerCodexQueueRequest): Promise<MesurerCodexQueueResult>
  send(request?: MesurerCodexQueueRequest): Promise<MesurerCodexQueueResult>
}
```

`queue()` is canonical. `send()` remains a compatibility alias.

Context owns the human evidence, so Codex delivery requires `context()`.

Runtime diagnostics stay on the native bridge. The public `codex:v1` service does not report or accept a CLI/Desktop runtime choice, so callers use the same health, thread, queue, and delivery methods in every supported Codex environment.

## Security and privacy

Electron renderers do not receive filesystem, process, or socket access. They call only the narrow `window.__MESURER_HOST__.codexBridge(request)` capability. Native leases are bound to the invoking renderer and require application sender validation.

Browser pages use a loopback-only HTTP companion because ordinary web code cannot access Codex's local process/socket APIs. The companion validates browser origins and exposes only bounded Codex operations for health, thread discovery/selection, queueing, delivery reads, and restoration. It must never bind a public network interface or become a remote relay.

Neither transport connects to Codex Desktop's private app-tools pipe. Desktop ownership signals remain ownership signals only.

## Browser-only hosts

A normal browser page keeps the Codex row in Settings. The user can enable it without an Electron preload.

Once enabled, Mesurer probes the local companion. If a compatible helper is running, Mesurer discovers the available Codex threads and **Queue to Codex** works normally. If it is absent, stale, or the port belongs to another service, the plugin remains enabled but fail-closed with an explicit diagnostic. It never sends to an unverified local service, and it automatically retries compatibility/availability while the toggle remains on.

The optional helper can be installed from this repository as **Mesurer Codex Bridge**. It is deliberately separate from **Mesurer Solid**, the OpenAI agent plugin.

For npm-installed workflows the package also exposes:

```bash
mesurer-codex
mesurer-codex-connect
```

These commands are local diagnostics/connection helpers, not hosted services.

## Requirements

Browser delivery requires the local Mesurer Codex Bridge companion to be reachable on loopback. The helper in turn needs a supported local Codex installation/session. Electron delivery can use the in-process native bridge directly and does not require the loopback companion.

Shared delivery relies on Codex's local app-server and queued-thread APIs. The current integration uses `thread/loaded/list`, bounded thread metadata/history reads, `thread/queue/add`, and `thread/queue/list` for safe restoration. Desktop-current-thread delivery may use Codex's durable queue command plus the native `codex://threads/<id>` wake path when exact ownership is known.

Mesurer sends Context text through this path, not image attachments.
