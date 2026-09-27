# Queue Context feedback to Codex

Mesurer can queue human visual feedback into Codex threads that are already open on the same computer.

This is an optional local transport for a person using Mesurer. It is separate from the browser-agent API exposed through `window.__MESURER__`.

## How it works

```text
Mesurer Context / saved notes
           |
           v
        codex()
           |
           | loopback HTTP
           v
  packaged Mesurer companion
           |
           +--> Codex shared local app-server
           |      thread/loaded/list
           |      thread/list
           |      turn history
           |
           +--> codex queue --thread ... --message ...
                  Codex native durable queue
```

There is no Codex marketplace plugin, SessionStart hook, SessionEnd hook, or separate Mesurer installation inside Codex.

The companion is part of `mesurer-solid`. It discovers currently loaded Codex threads from Codex's shared local app-server and only offers those threads as send targets. Queue delivery uses Codex's own durable queue; Mesurer does not use `turn/steer`, create a second message queue, or infer a live thread from stale registration state.

## Enable Codex once

Codex is off by default.

In **Settings -> Plugins**, the Codex row explains that enabling it starts Mesurer's local companion and connects to open Codex threads on the current computer. Turning the switch on loads `codex()`, starts or reuses the packaged companion through the native host when available, and stores the normal Mesurer plugin preference.

That preference survives reloads and later package updates. Mesurer does not ask the user to install a marketplace, trust hooks, or repeat a Codex-side setup step after each update.

Older releases enabled Codex by default. Their saved default-on state is intentionally not treated as a new opt-in. After upgrading to this model, the user makes one explicit Codex choice; that new choice is then persisted normally.

Turning Codex off removes the browser service, command, toolbar action, and that page's companion lease immediately.

## Native host bootstrap

A normal browser page cannot spawn a local process. Electron and other native hosts should expose one host capability that starts Mesurer's packaged companion.

The package exports the host helper from `mesurer-solid/codex-host`:

```ts
import { ensureMesurerCodexBridge } from "mesurer-solid/codex-host"
```

For Electron, keep process access in main/preload:

```ts
// main
import { ipcMain } from "electron"
import { ensureMesurerCodexBridge } from "mesurer-solid/codex-host"

ipcMain.handle("mesurer:start-codex-bridge", () =>
  ensureMesurerCodexBridge()
)
```

```ts
// preload
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("__MESURER_HOST__", {
  startCodexBridge: () => ipcRenderer.invoke("mesurer:start-codex-bridge"),
})
```

Applications that already expose `window.__MESURER_HOST__` for Screenshot can add `startCodexBridge` to that same object.

The helper:

- reuses the running bridge only when its protocol and packaged source hash match;
- shuts down and replaces an older self-identifying Mesurer bridge after an update;
- refuses to take over a port owned by an unrelated process;
- starts the sibling packaged bridge instead of depending on a repository checkout;
- uses Electron's `ELECTRON_RUN_AS_NODE` mode when called from Electron main;
- waits until the exact current bridge is healthy before returning.

This wiring is an application integration step, not an end-user installation flow. Once the host exposes it, the user only uses the Mesurer Settings switch.

## Browser-only hosts

A browser-only page has no process-spawn capability. It can use Codex delivery when a compatible companion is already running, but it cannot start one by itself.

For development or a deliberately browser-only integration, the packaged foreground command remains available:

```bash
bunx mesurer-codex
```

The default endpoint is:

```text
http://127.0.0.1:47365
```

Localhost origins are allowed by default. An exact additional origin can be passed with `--origin`. Electron or `file://` pages use the `null` origin and the package host helper starts the bridge with that origin enabled.

This manual command is not required for a native host that exposes `startCodexBridge`.

## Thread discovery

The bridge asks Codex's shared local app-server for `thread/loaded/list`. Those loaded thread ids are the authoritative sendable set.

It then reads bounded metadata from `thread/list` and, when needed, `thread/read` to obtain display names and working-directory metadata. A recent but unloaded thread is not presented as connected merely because it exists in history.

The destination picker is bounded to ten loaded threads. It uses the Codex thread name when available, then the preview, then a shortened id.

One Mesurer page keeps its chosen thread in per-tab `sessionStorage`. On reload:

- if that thread is still loaded, Mesurer keeps it;
- if exactly one loaded thread exists, Mesurer can bind to it;
- if multiple loaded threads exist and there is no valid saved choice, the toolbar requires a human choice;
- if the saved thread is no longer loaded, Mesurer does not silently queue into another thread.

Mesurer never creates a Codex thread. Open or create the thread in Codex first; once Codex reports it as loaded, Mesurer can target it.

## Queue delivery

Mesurer implements **Queue**, not **Steer**.

When the user presses **Queue to Codex**:

1. Mesurer enters **Queueing to Codex…** before the network request, disabling duplicate submission.
2. The companion verifies that the destination is still loaded.
3. The companion runs `codex queue --thread <id> --message <text>`.
4. Codex returns the durable queued-submission id.
5. Mesurer shows **Queued for Codex** while Codex owns scheduling.
6. Mesurer reads bounded turn history from the same shared app-server and correlates the exact queued message.
7. A matching in-progress turn becomes **Codex working…**.
8. A matching completed turn becomes **Codex finished**.
9. An interrupted or failed matched turn becomes **Codex interrupted** and keeps the review state available for retry.

Mesurer does not open a second Codex app-server for delivery and does not use a Desktop-specific deep-link send path. The shared Codex daemon is the source of live-thread and lifecycle state.

## Delivery persistence

The companion keeps bounded delivery metadata under:

```text
$CODEX_HOME/mesurer/codex-deliveries.json
```

This file stores Mesurer correlation state such as the delivery id, destination thread, queued-submission id, prompt hash, and last known lifecycle state. It is not a second message queue. The actual follow-up remains in Codex's native queue.

The browser keeps the active delivery id, destination thread, lifecycle state, and exact annotation ids in per-tab `sessionStorage` while a delivery is active or reconcilable.

If history cannot be read or the exact queued prompt cannot be matched unambiguously, Mesurer leaves the delivery and annotations intact. It never treats a missing queue item or an unrelated newer turn as proof of completion.

## Completed annotations

When a queued request contains saved Mesurer annotations, `codex()` remembers the exact annotation ids included in that message.

After the exact matched Codex turn reaches **Codex finished**, Mesurer removes only those delivered annotations. Notes created later, notes excluded from the message, and annotations from interrupted or failed work remain.

Automatic cleanup defaults on:

```ts
codex({ clearCompletedAnnotations: false })
```

disables it when review history should remain.

Codex turn completion is transport state, not proof that the requested visual result is correct. The default instruction still asks Codex to verify the affected UI before claiming completion.

## Companion lifetime and cleanup

The companion belongs to active Mesurer clients, not to Codex threads.

When `codex()` becomes active, the page acquires a short local lease and heartbeats it. When the plugin is disabled or the mount is disposed, that page releases its lease.

Multiple Mesurer pages or windows can share the same companion. Closing one does not interrupt another. After the last client releases its lease, the bridge exits. If a renderer crashes and cannot release cleanly, its lease expires and the otherwise unused bridge exits automatically.

A newly started bridge also exits if no Mesurer client acquires it within a short startup grace period.

Bridge shutdown:

- closes its loopback server;
- clears its timers;
- terminates helper processes that the bridge started for the current operation;
- does not kill Codex's shared app-server daemon.

This lease model is why Mesurer does not need Codex SessionEnd hooks for cleanup.

## Updates and stale bridges

The native host helper compares the running bridge's source hash with the bridge packaged in the installed `mesurer-solid` version.

If they match, it reuses the process. If an older Mesurer bridge is running, it asks that bridge to shut down, waits for the port to clear, and starts the current packaged copy. An unidentified or unrelated service on the configured port fails closed.

Users do not reinstall anything in Codex after a Mesurer update.

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

## Security and privacy

The bridge binds only to `127.0.0.1`.

Browser access is origin-checked. Localhost origins are accepted by default; additional exact origins must be configured by the local host. Shutdown remains local-process-only rather than browser-callable.

Mesurer does not expose Codex account browsing to arbitrary pages. The browser receives only bounded metadata for currently loaded local threads and the delivery state required for the selected queue operation.

There is no Codex permission prompt for these local app-server reads. Mesurer therefore does not present a fake permission dialog. The Settings row states what enabling Codex does before the user turns it on.

If a host page uses Content Security Policy, browser-side Codex delivery still needs `connect-src` access to the configured loopback endpoint.

## Requirements

Use a current Codex build whose CLI exposes the shared local app-server and queue command:

```bash
codex queue --help
codex app-server --help
```

The current integration relies on Codex's local daemon transport, `thread/loaded/list`, bounded thread metadata/history reads, and `codex queue`.

Mesurer sends Context text through this path, not image attachments.
