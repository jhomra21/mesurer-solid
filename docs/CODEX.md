# Send Context feedback to Codex

Mesurer can queue human visual feedback into Codex threads.

This is a convenience transport for a person using Mesurer. It is not Mesurer's normal agent protocol. Coding agents should keep reading `window.__MESURER__` through the browser control they already use.

## How it works

```text
saved Mesurer notes / current selection
              |
              v
          codex()
              | HTTP on loopback
              v
        mesurer-codex
              |
              v
 codex queue --thread ... --message ...
              |
              v
 registered Codex CLI / Codex App thread
```

There are two pieces with different jobs.

The browser plugin, `codex()`, adds the service, command, and **Send to Codex** toolbar action. Settings can load or remove this plugin without a page refresh.

The local companion owns process access. It listens on `127.0.0.1`, keeps the allowed Codex thread set, and invokes `codex queue`. A normal web page cannot start `codex`, Node, Bun, or another operating-system process, so browser Settings cannot create this local process by itself.

The package includes the companion and an idempotent connector. When Codex is controlling the project, the Mesurer skill uses that connector from the Codex process so the person does not need to start a second terminal command by hand.

## Automatic connection from Codex

The published package includes:

```text
mesurer-codex
mesurer-codex-connect
```

`mesurer-codex` is the low-level foreground bridge. `mesurer-codex-connect` is the normal bootstrap command for Codex-driven use.

From a Codex shell or tool command:

```bash
bunx mesurer-codex-connect
```

`mesurer-codex-connect` does four things:

1. Reads the current `CODEX_THREAD_ID`.
2. Reuses the bridge at `http://127.0.0.1:47365` when it is already healthy.
3. Starts the packaged bridge as a detached local process when no bridge is running.
4. Registers the current Codex thread and makes it the active Mesurer destination.

The portable `mesurer-ui` skill installs the same connector and bridge beside its injector. A Codex agent using that skill should run:

```bash
node .agents/skills/mesurer-ui/assets/codex-connect.mjs
```

when Codex delivery is requested or when the live Mesurer instance already has `mesurer.codex` enabled.

Inside the Mesurer Solid repository, use:

```bash
bun run mesurer-codex-connect
```

This is the supported zero-manual path for a Codex-controlled local project. The browser toggle still owns only browser state because the browser sandbox does not have process-spawn access.

## What the Settings toggle means

Turning Codex on in **Settings -> Plugins** loads `codex()` immediately. No refresh is required. Turning it off removes the browser service, command, and toolbar action immediately. Re-enabling it restores them.

Disabling the browser plugin does not stop the local companion. The companion can be shared by more than one page or registered Codex thread, and stopping it when one page toggles Codex off could break another client. While no page sends feedback, the companion waits on loopback and does no Codex work.

If a bridge is already running, re-enabling Codex in Settings can use it on the next send without another bootstrap step.

A plain browser-only application cannot start a missing local companion. In that case, start or connect the companion from a local Codex process or another trusted host that can spawn processes.

## Requirements

Use a current Codex build whose CLI exposes:

```bash
codex queue --help
```

`codex queue` targets an existing session by UUID or exact session name. A new thread becomes a Mesurer destination after Codex creates it and a local process registers it with the bridge. Mesurer does not fabricate Codex threads.

Current Codex tool commands expose the running thread as `CODEX_THREAD_ID`. Both `mesurer-codex` and `mesurer-codex-connect` use it when started from Codex.

The current queue accepts text input. Mesurer sends structured Context text in this integration, not image attachments.

## Start the foreground bridge manually

The automatic connector is the normal Codex path. The foreground command remains useful for debugging or explicit process ownership:

```bash
bunx mesurer-codex
```

When Codex starts it, the bridge reads `CODEX_THREAD_ID`, registers that thread, and makes it the active destination.

You can still choose the first thread explicitly from a normal local shell:

```bash
bunx mesurer-codex --thread <SESSION>
```

The default endpoint is:

```text
http://127.0.0.1:47365
```

For a browser app running on localhost, no extra origin configuration is needed. To authorize another exact browser origin:

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

## Register another Codex thread

A different Codex thread can register itself with an already-running bridge:

```bash
bunx mesurer-codex --register-current
```

Run that from a Codex shell or tool command in the destination thread. It reads that thread's `CODEX_THREAD_ID`, registers it, and makes it the active Mesurer destination.

`mesurer-codex-connect` also handles this case. If the bridge is already running, calling the connector from another Codex thread reuses the process and registers the new thread.

If you already know an existing session UUID or exact name, a normal local shell can register it explicitly:

```bash
bunx mesurer-codex --register <SESSION>
```

Use `--bridge <URL>` when the bridge is not on the default endpoint.

Registering another thread does not forget previous threads. Mesurer can switch back or send one message to another registered destination without changing the default.

## Mount the plugins

Context owns the feedback. Codex delivery requires Context. All first-party plugin factories come from `mesurer-solid/plugins`:

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

1. If saved Context annotations exist, Mesurer sends their notes with current target status, exact geometry, relevant guides, measurements, distances, and inspection data.
2. Otherwise it sends the current selection Context.
3. If there is no current selection, it sends workspace Context.
4. The local companion queues that text as a Codex user message for the current registered destination.

The default instruction asks Codex to implement the feedback, preserve unrelated review state, and verify the result in the live page with Mesurer.

## Programmatic thread routing

The plugin provides `codex:v1`. Import its service type from the plugin entry:

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

A thread override that was never registered is rejected instead of being routed somewhere else.

## Failure behavior

Delivery is explicit. A send fails if the companion is unavailable, the Codex executable is missing, no thread is registered, the requested thread is unknown, the browser origin is not authorized, or `codex queue` rejects the request.

The toolbar reports delivery failures to the browser console with a `[Mesurer] Failed to send feedback to Codex: ...` diagnostic and propagates the failure through the plugin error path. Programmatic `send()` calls reject with the same underlying error.

`mesurer-codex-connect` reports bootstrap or registration failures to the local Codex process. It does not fall back to browser-side thread registration.

The bridge does not resume or launch an unloaded existing Codex thread. Interactive feedback should normally target a loaded Codex CLI or Codex App thread.

## Security boundary

A web page must not gain arbitrary access to every Codex conversation because Codex is installed.

The integration keeps registration outside the browser:

- Browser origins may send messages and switch only among already registered thread ids.
- A local process registers new destinations. `mesurer-codex-connect`, `--register-current`, and `--register` use this path.

Other boundaries remain in place:

- The bridge listens on loopback only.
- It invokes Codex without a shell.
- Non-loopback browser origins are denied unless explicitly allowed.
- Request bodies are size-limited.
- The browser cannot supply an executable or arbitrary command.
- Mesurer never creates a Codex thread behind the user's back.

The connector does not use an npm install hook and does not modify Codex persistence. It starts the companion only when a trusted local process explicitly invokes it.
