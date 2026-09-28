# Queue Context feedback to Codex

Mesurer can queue human visual feedback into Codex threads that are already open on the same computer.

Codex is a first-party Mesurer plugin. It is enabled by default and can be turned off or back on from **Settings -> Plugins**.

## How it works

```text
Mesurer Context / saved notes
           |
           v
        codex()
           |
           | window.__MESURER_HOST__.codexBridge(request)
           v
  Codex Bridge in the native host process
           |
           +--> shared app-server adapter
           |      +--> thread/loaded/list
           |      +--> thread/list / thread/read
           |      +--> thread/queue/add
           |      +--> thread/turns/list
           |
           +--> inherited Desktop-current-thread adapter
                  +--> codex queue --thread <exact inherited thread>
                  +--> codex://threads/<same thread>
```

There is no Mesurer Codex server, loopback port, helper Electron process, Codex marketplace plugin, SessionStart hook, or SessionEnd hook.

The native **Codex Bridge** is part of the Codex plugin package surface at `mesurer-solid/plugins/codex/bridge`. It runs inside the application's native host process and owns Codex transport selection there. Shared sessions use Codex's local app-server; an exact inherited Desktop current thread can use the plugin-owned Desktop queue adapter described below. The bridge does not start another Mesurer service.

## Native host wiring

A browser renderer cannot safely open Codex's local Unix-domain socket or spawn the Codex relay itself. Electron and other native applications expose one narrow host capability.

In Electron main:

```ts
import { ipcMain } from "electron"
import { codexBridge } from "mesurer-solid/plugins/codex/bridge"

ipcMain.handle("mesurer:codex-bridge", (_event, request) =>
  codexBridge(request)
)
```

In preload:

```ts
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  codexBridge: (request) =>
    ipcRenderer.invoke("mesurer:codex-bridge", request),
})
```

If the application already exposes `window.__MESURER_HOST__` for Screenshot, add `codexBridge` to the same object.

This is application integration, not a user setup step. Once the host exposes it, the user does not install anything in Codex, run a bridge command, trust hooks, choose a port, or manage another process.

The Codex Bridge export is intentionally location-independent. It does not use `import.meta.url`, `process.execPath`, or package-relative runtime file lookup, so bundling Electron main to CommonJS does not require Mesurer to recover its own source path.

## Default availability

Codex is enabled by default with the other first-party Mesurer plugins.

The Settings switch still controls availability. Turning it off removes the Codex service, command, and toolbar action. Turning it back on restores them.

A short-lived beta made Codex opt-in. Mesurer's current plugin-persistence migration ignores that one beta availability value once so existing installations return to the normal default-on behavior. Choices made after that migration persist normally.

## Desktop and standalone runtimes

The Codex plugin has one API for Codex. Callers do not select a CLI or Desktop implementation.

The native bridge resolves the runtime behind that API. A reachable shared app-server is used as-is. If no shared server is running, the bridge can start one from an existing complete standalone Codex installation. It checks managed packages under `CODEX_HOME` before `PATH`. Mesurer never installs Codex.

Codex Desktop uses the same Mesurer API. If Desktop is attached to the shared app-server, Mesurer uses that transport normally. If the application host was launched from a Codex Desktop thread, Codex injects the exact `CODEX_THREAD_ID` into that execution environment. Desktop also supplies `CODEX_APP_TOOLS_PIPE_PATH`. Mesurer requires both signals before enabling its current-thread Desktop fallback.

That fallback does not connect to the private pipe. It uses the resolved Codex executable only to durably queue to the exact inherited thread, then opens `codex://threads/<id>` so Desktop wakes or resumes that same thread. The Desktop-bundled executable is never used to bootstrap the shared daemon.

If neither inherited ownership nor a shared app-server is available, Mesurer reports the private Desktop runtime as unavailable instead of guessing which Desktop thread is current.

Runtime choice stays inside the Codex plugin. Host applications expose only `codexBridge(request)`, and renderer code keeps using `codex:v1` for health, thread discovery, target selection, queueing, and delivery state.

## Thread discovery

For the shared transport, Codex's shared local app-server is the source of truth for sendable threads. The bridge asks for `thread/loaded/list`, reads bounded metadata through `thread/list`, and falls back to `thread/read` when needed.

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

On the shared-app-server path, the bridge verifies the destination with `thread/loaded/list`, calls `thread/queue/add` directly, keeps Codex's queued-submission id, and correlates lifecycle through bounded turn history on the same server.

On the inherited Desktop-current-thread path, the bridge accepts only the inherited thread, invokes `codex queue --thread <id> --message <text>`, keeps the queued-submission id, and opens `codex://threads/<id>`. The deep link is a wake step, not a second message submission. If the wake fails after persistence, Mesurer reports the wake diagnostic and does not requeue.

Desktop fallback delivery remains **Queued** unless Mesurer can prove later lifecycle state without crossing the private Desktop transport. It does not manufacture **Working** or **Finished** from UI assumptions.

## Delivery persistence

Mesurer keeps bounded correlation metadata under:

```text
$CODEX_HOME/mesurer/codex-deliveries.json
```

This file stores the Mesurer delivery id, destination thread, queued-submission id, prompt hash, and last known lifecycle state. It is not a second message queue. Codex's own queue remains the durable source of truth.

The renderer keeps the active delivery id, destination thread, lifecycle state, and exact annotation ids in per-tab `sessionStorage` while a delivery is active or reconcilable.

If history cannot be read or the exact queued prompt cannot be matched unambiguously, Mesurer leaves the delivery and annotations intact.

## Completed annotations

When a queued request contains saved Mesurer annotations, `codex()` remembers the exact annotation ids included in that message.

After the exact matched Codex turn reaches **Codex finished**, Mesurer removes only those delivered annotations. Notes created later, notes excluded from the message, and annotations from interrupted or failed work remain.

Automatic cleanup defaults on. To retain completed notes:

```ts
codex({ clearCompletedAnnotations: false })
```

Codex turn completion is transport state, not proof that the requested visual result is correct.

## Process lifetime

Mesurer no longer owns a long-running Codex bridge process.

Shared-transport requests open short-lived connections to Codex's app-server control socket and close them after each response. If that socket is unavailable, the bridge may use an existing complete standalone installation to start the shared daemon.

For an inherited Desktop-current-thread request, there is no Mesurer server and no socket attachment. The bridge may execute Codex's bundled command for the one durable queue operation and use the operating system's native `codex://` URL handler to wake that thread. It never starts a daemon from the Desktop-bundled executable.

Mesurer does not stop Codex's shared app-server daemon when a page closes or when the plugin is disabled.

Because there is no Mesurer bridge process, there is no bridge port, client lease, stale bridge replacement, shutdown hook, or extra Electron window to clean up.

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

The renderer does not receive filesystem, process, or socket access. It can only call the host's narrow `codexBridge(request)` capability.

Codex Bridge exposes bounded actions for health, loaded-thread listing and selection, queueing, delivery reads, and safe delivery restoration. Native process and socket access stay in the host process.

There is no localhost HTTP listener and no CORS surface.

## Browser-only hosts

A normal browser page cannot use the native Codex Bridge by itself. The Codex plugin can still be mounted, but live Codex delivery is unavailable unless the host provides `window.__MESURER_HOST__.codexBridge`.

There is no manual `mesurer-codex` command or standalone browser bridge.

## Requirements

Shared delivery requires Codex's local app-server and queued-thread API. Automatic daemon startup requires a complete standalone Codex installation. The Desktop-current-thread fallback additionally requires the host process to inherit the thread environment from Codex Desktop; a private Desktop stdio app-server by itself is still not enough to identify a current thread safely.

The current integration relies on:

- Codex's app-server control socket;
- `thread/loaded/list`;
- bounded `thread/list`, `thread/read`, and turn-history reads;
- `thread/queue/add`;
- `thread/queue/list` for safe delivery restoration.

Mesurer sends Context text through this path, not image attachments.
