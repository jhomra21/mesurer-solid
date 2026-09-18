# Mesurer Codex plugin

This repo-local Codex plugin keeps Mesurer's local Codex companion ready for the current Codex session.

Its `SessionStart` hook runs for `startup`, `resume`, and `clear`. The hook reads Codex's `session_id` from stdin, starts or reuses the loopback bridge at `127.0.0.1:47365`, and registers that session as the active **Queue to Codex** destination. Successful startup is silent, so the hook does not add developer context to the Codex session.

The plugin also installs asynchronous `UserPromptSubmit`, `Stop`, and `Interrupt` hooks. They report the exact queued turn lifecycle to the local bridge so Mesurer can show Queued/Working/Finished state and retire only completed annotation ids. They are best-effort observers: they print no prompt context and do not block Codex when the Mesurer bridge is absent.

## Install from this checkout

From the repository root:

```bash
codex plugin marketplace add .
codex plugin add mesurer-codex@mesurer-local
```

Start a new Codex thread after installation. Codex does not trust installed plugin hooks automatically. Open `/hooks`, review the Mesurer `SessionStart`, `UserPromptSubmit`, `Stop`, and `Interrupt` hooks, and trust the current definitions. If the first session started before the hooks were trusted, start another new thread after trusting them.

After trust, new, resumed, and cleared Codex sessions start or reuse the bridge automatically. The browser-side Mesurer Codex toggle still controls only the browser plugin. Turning it off removes **Queue to Codex** from that page but does not kill the shared local bridge.

## Verify

With a Codex session running after the hook has been trusted:

```bash
curl http://127.0.0.1:47365/health
```

The response should report the current Codex session as `thread` and include it in `threads`.

Then enable Codex in Mesurer Settings and use **Queue to Codex**. No separate `mesurer-codex` terminal should be needed. In Codex Desktop, SessionStart registers the app-tools pipe with the bridge. Mesurer stores the feedback locally, waits while the destination is active, then uses Desktop's own `codex_app` transport after the thread reports idle/not-loaded. It does not start the standalone app-server daemon for Desktop. If the bridge restarts, the local Desktop queue is reloaded automatically.

CLI/TUI shared-daemon environments keep Codex's native `codex queue` transport. Desktop currently has no atomic queue-only cross-thread app-tool call, so the idle check/send is best-effort; Mesurer avoids knowingly steering, never blindly retries an uncertain send, and shows blocked delivery rather than encouraging a duplicate.

While a tracked request is outstanding, Mesurer disables repeat queue submissions and visibly moves from Queueing to Queued to Working. A normal Stop briefly shows Finished and removes only the annotations included in that delivery. Interruptions keep those notes for retry.

The low-level bridge and connector remain available for diagnostics:

```bash
bun run mesurer-codex
bun run mesurer-codex-connect
```
