# Send Context feedback to Codex

Mesurer can optionally queue human visual feedback into Codex threads.

This is a convenience transport for a human using Mesurer. It is **not** Mesurer's normal agent protocol: coding agents should continue to read the existing `window.__MESURER__` state through their browser harness.

## How it works

```text
saved Mesurer notes / current selection
              │
              ▼
          codex()
              │ HTTP on loopback
              ▼
        mesurer-codex
              │
              ▼
 codex queue --thread … --message …
              │
              ▼
 registered Codex CLI / Codex App thread
```

The local companion keeps a small registry of Codex threads that local Codex processes or the user explicitly register. Browser pages can send only to those registered threads. They cannot invent a destination thread by knowing that Codex is installed.

Codex itself owns the durable user-message queue. Mesurer never edits Codex persistence directly, takes a thread writer lock, or uses private Codex Desktop IPC.

## Requirements

Use a current Codex build whose CLI exposes:

```bash
codex queue --help
```

`codex queue` targets an existing session by UUID or exact session name. A newly-created thread therefore becomes a Mesurer destination after Codex has created it and registered it with the bridge; Mesurer does not fabricate Codex threads itself.

Current Codex tool commands expose the running thread as `CODEX_THREAD_ID`. `mesurer-codex` uses that automatically when it is started from Codex.

The current queue accepts text input. Mesurer therefore sends structured Context text in this integration, not image attachments.

## Start the bridge from the Codex thread you are working in

When Codex starts the bridge, no thread argument is needed:

```bash
bunx mesurer-codex
```

That command is for an installed `mesurer-solid` consumer. When testing from the Mesurer Solid monorepo checkout itself, the workspace root is private rather than the published package, so use the checked-in source command instead:

```bash
bun run mesurer-codex
```

Bridge arguments work the same way from the source checkout, for example:

```bash
bun run mesurer-codex --register-current
```

The bridge reads `CODEX_THREAD_ID`, registers that thread, and makes it the active Mesurer destination. That gives the useful default behavior: **Codex uses or starts Mesurer, and human feedback goes back to the same Codex thread.**

You can still start the bridge manually and pin the first thread explicitly:

```bash
bunx mesurer-codex --thread <SESSION>
```

The default endpoint is:

```text
http://127.0.0.1:47365
```

For a browser app running on localhost, no additional origin configuration is needed. To authorize another exact browser origin:

```bash
bunx mesurer-codex \
  --thread <SESSION> \
  --origin https://app.example.test
```

For an Electron or `file://` page whose browser Origin is `null`, opt into that origin explicitly:

```bash
bunx mesurer-codex --thread <SESSION> --origin null
```

The bridge binds only to `127.0.0.1`.

## Hand Mesurer to another or newly-created Codex thread

A different Codex thread can register itself with the already-running bridge:

```bash
bunx mesurer-codex --register-current
```

Run that from a Codex shell/tool command in the destination thread. It reads that thread's `CODEX_THREAD_ID`, registers it, and makes it the active Mesurer destination.

If you already know an existing session UUID or exact name, a normal local shell can register it explicitly:

```bash
bunx mesurer-codex --register <SESSION>
```

Use `--bridge <URL>` when the bridge is not on the default endpoint.

This is also the flow for a **new** Codex thread: create the thread in Codex first, then run `--register-current` from it. The browser never gets permission to create or register arbitrary Codex sessions on its own.

Registering another thread does not forget the previous one. The bridge keeps the registered set, so Mesurer can switch back or send one message to another registered thread without changing the default.

## Mount the plugins

Context owns the feedback. Codex delivery is a separate optional plugin that requires Context. All first-party plugin factories come from `mesurer-solid/plugins`:

```ts
import { mountMesurer } from "mesurer-solid"
import { codex, context } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  plugins: [
    context(),
    codex(),
  ],
})
```

The toolbar gets a **Send to Codex** action.

When clicked:

1. if saved Context annotations exist, Mesurer sends their human notes together with current target status, exact rendered geometry, relevant guides, measurements, distances, and inspection data;
2. otherwise it sends the current selection Context;
3. if there is no current selection, it falls back to workspace Context;
4. the bridge queues that text as a real Codex user message for the current registered destination thread.

The default instruction asks Codex to implement the feedback, preserve unrelated review state, and verify the result in the live page with Mesurer.

## Programmatic thread routing

The plugin provides `codex:v1`. Import its service type from the same plugin entry:

```ts
import type { MesurerCodexService } from "mesurer-solid/plugins"

const service = host.service.get<MesurerCodexService>("codex:v1")

const status = await service?.health()
// { thread: "current-thread", threads: ["current-thread", "other-thread"] }
```

Switch the default target to another thread that Codex already registered:

```ts
await service?.useThread("other-thread")
await service?.send()
```

Or send one Context message to a different registered thread without changing the current default:

```ts
await service?.send({
  thread: "other-thread",
})
```

Send only particular saved annotations:

```ts
await service?.send({
  annotationIds: ["annotation-1", "annotation-2"],
})
```

Or replace the instruction for one send:

```ts
await service?.send({
  instruction: "Implement these visual review notes, then verify them in Mesurer.",
})
```

A thread override that was never registered is rejected rather than silently routing feedback somewhere else.

## Failure behavior

Delivery is explicit. If the companion is not running, the Codex executable is missing, no thread has been registered, the requested thread is not in the bridge registry, the local origin is not authorized, or `codex queue` rejects the request, the send fails.

The toolbar action reports delivery failures to the browser console with a `[Mesurer] Failed to send feedback to Codex: …` diagnostic and still propagates the failure through the normal plugin error path. Programmatic `send()` calls reject with the same underlying error. A stopped or unreachable bridge is reported as unavailable at its configured endpoint instead of being swallowed silently.

The bridge does not resume or launch an unloaded existing thread. Current Codex behavior can persist queued input for an unloaded thread without starting it until another client resumes that thread, so interactive feedback should normally target a loaded Codex CLI/App thread.

## Security boundary

A web page must not gain arbitrary access to every Codex conversation merely because Codex is installed.

The integration therefore keeps two distinct capabilities:

- browser origins may send messages and switch only among **already registered** thread ids;
- registering a new destination is accepted only from a local non-browser process, such as `mesurer-codex --register-current` run by Codex itself or by the user.

Additional boundaries remain:

- the bridge listens on loopback only;
- no shell is used when invoking Codex;
- non-loopback browser origins are denied unless explicitly allowed;
- request bodies are size-limited;
- the browser cannot supply an executable or arbitrary command;
- Mesurer never creates a Codex thread behind the user's back.

Only start `mesurer-codex` when you explicitly want the current page to send feedback to registered Codex sessions.
