# Mesurer Codex plugin

This repo-local Codex plugin keeps Mesurer's local Codex companion ready for the current Codex session.

Its `SessionStart` hook runs for `startup`, `resume`, and `clear`. The hook reads Codex's `session_id` from stdin, starts or reuses the loopback bridge at `127.0.0.1:47365`, and registers that session as the active **Queue to Codex** destination. Successful startup is silent, so the hook does not add developer context to the Codex session.

## Install from this checkout

From the repository root:

```bash
codex plugin marketplace add .
codex plugin add mesurer-codex@mesurer-local
```

Start a new Codex thread after installation. Codex does not trust installed plugin hooks automatically. Open `/hooks`, review the Mesurer `SessionStart` hook, and trust the current definition. If the first session started before the hook was trusted, start another new thread after trusting it.

After trust, new, resumed, and cleared Codex sessions start or reuse the bridge automatically. The browser-side Mesurer Codex toggle still controls only the browser plugin. Turning it off removes **Queue to Codex** from that page but does not kill the shared local bridge.

## Verify

With a Codex session running after the hook has been trusted:

```bash
curl http://127.0.0.1:47365/health
```

The response should report the current Codex session as `thread` and include it in `threads`.

Then enable Codex in Mesurer Settings and use **Queue to Codex**. No separate `mesurer-codex` terminal should be needed. Queue adds a follow-up without interrupting an active turn; Codex's **Steer** control is a separate in-flight action.

The low-level bridge and connector remain available for diagnostics:

```bash
bun run mesurer-codex
bun run mesurer-codex-connect
```
