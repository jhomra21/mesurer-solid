# Mesurer Codex plugin

This repo-local Codex plugin keeps Mesurer's local Codex companion ready for the current Codex session.

Its `SessionStart` hook runs for `startup`, `resume`, and `clear`. The hook reads Codex's `session_id` from stdin, starts or reuses the matching loopback bridge at `127.0.0.1:47365`, and registers that session as the active **Queue to Codex** destination. Reuse is source-identity checked so an older healthy bridge cannot silently take lifecycle ownership. Successful startup is silent, so the hook does not add developer context to the Codex session.

Mesurer does not install separate turn-lifecycle hooks. The bridge reads bounded Codex turn history and correlates the exact queued Mesurer prompt before reporting Working, Finished, or Interrupted. This keeps lifecycle correctness independent of extra hook trust while preserving the existing `/lifecycle` compatibility endpoint for older installs.

## Install from this checkout

From the repository root:

```bash
codex plugin marketplace add .
codex plugin add mesurer-codex@mesurer-local
```

Start a new Codex thread after installation. Codex does not trust installed plugin hooks automatically. Open `/hooks`, review the Mesurer `SessionStart` hook, and trust that definition. If the first session started before it was trusted, start another new thread afterward.

After that one hook is trusted, new, resumed, and cleared Codex sessions start or reuse the matching bridge automatically. A stale self-identifying bridge is replaced; a pre-identity legacy bridge is rejected until it is stopped once. The browser-side Mesurer Codex toggle still controls only the browser plugin. Turning it off removes **Queue to Codex** from that page but does not kill the shared local bridge.

## Verify

With a Codex session running after the hook has been trusted:

```bash
curl http://127.0.0.1:47365/health
```

The response should report the current Codex session as `thread` and include it in `threads`.

Then enable Codex in Mesurer Settings and use **Queue to Codex**. No separate `mesurer-codex` terminal should be needed. Desktop delivery uses Codex's native durable queue, not the app-tools pipe: Mesurer queues once, retains the queued-submission id, then opens the existing thread through `codex://threads/<threadId>`. Desktop loads or resumes the thread and Codex's queue watcher runs the item when safe.

CLI/TUI shared-daemon environments use the same native queue. Mesurer does not start the standalone daemon for Desktop, does not delete an existing queued item during recovery, and never invokes `turn/steer`.

While a tracked request is outstanding, Mesurer disables repeat queue submissions and visibly moves from Queueing to Queued to Working. A matched `completed` turn briefly shows Finished and removes only the annotations included in that delivery. `interrupted` or failed turns keep those notes for retry.

The low-level bridge and connector remain available for diagnostics:

```bash
bun run mesurer-codex
bun run mesurer-codex-connect
```
