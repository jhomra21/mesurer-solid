# Send Context feedback to Codex

Mesurer can optionally queue human visual feedback into an already-open Codex session.

This is a convenience transport for a human using Mesurer. It is **not** Mesurer's normal agent protocol: coding agents should continue to read the existing `window.__MESURER__` state through their browser harness.

## How it works

```text
saved Mesurer notes / current selection
              │
              ▼
       mesurer.codex plugin
              │ HTTP on loopback
              ▼
        mesurer-codex
              │
              ▼
 codex queue --thread … --message …
              │
              ▼
 already-open Codex CLI or Codex App thread
```

The local companion is deliberately small. It is pinned to one Codex session when it starts and accepts only message text from allowed browser origins. It never resumes the target thread, takes its writer lock, edits Codex state directly, or uses private Codex Desktop IPC.

Codex itself owns the durable user-message queue. When the target session is loaded, its owning Codex process observes the queued input and starts it when the thread is idle.

## Requirements

Use a current Codex build whose CLI exposes:

```bash
codex queue --help
```

The target should already be open/loaded in Codex CLI or the Codex App for this first integration. A message can be durably queued for another normal session, but this integration does not try to launch or resume an unloaded Codex thread.

The current Codex queue accepts text input. Mesurer therefore sends structured Context text in this first version, not image attachments.

## Start the bridge

Use the Codex session UUID or its exact session name:

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

The bridge binds only to `127.0.0.1`. The browser cannot choose a different Codex thread: the target is fixed by the person who launched the bridge.

## Mount the plugin

Context owns the feedback. Codex delivery is a separate optional plugin that requires Context:

```ts
import { contextPlugin, mountMesurer } from "mesurer-solid"
import { codexPlugin } from "mesurer-solid/codex"

const mesurer = mountMesurer({
  plugins: [
    contextPlugin(),
    codexPlugin(),
  ],
})
```

The toolbar gets a **Send to Codex** action.

When clicked:

1. if saved Context annotations exist, Mesurer sends their human notes together with current target status, exact rendered geometry, relevant guides, measurements, distances, and inspection data;
2. otherwise it sends the current selection Context;
3. if there is no current selection, it falls back to workspace Context;
4. the bridge queues that text as a real Codex user message for the pinned session.

The default instruction asks Codex to implement the feedback, preserve unrelated review state, and verify the result in the live page with Mesurer.

## Programmatic send

The plugin provides `codex:v1`:

```ts
const service = host.service.get<MesurerCodexService>("codex:v1")

await service?.health()
await service?.send()
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

## Failure behavior

Delivery is explicit. If the companion is not running, the Codex executable is missing, the target cannot be resolved, the local origin is not authorized, or `codex queue` rejects the request, the send fails instead of silently creating another Codex process or taking over the thread.

A busy loaded thread keeps the user input queued until it can start. Expect a short delay before externally queued input appears because Codex watches its shared queue for changes.

## Security boundary

A web page must not gain arbitrary access to every Codex conversation merely because Codex is installed.

The first integration therefore keeps the boundary narrow:

- the bridge listens on loopback only;
- one bridge process is pinned to one target thread;
- no shell is used when invoking Codex;
- non-loopback browser origins are denied unless explicitly allowed;
- request bodies are size-limited;
- the browser can send message text but cannot supply a command, executable path, or destination thread.

Only start `mesurer-codex` when you explicitly want the current page to send feedback to that Codex session.
