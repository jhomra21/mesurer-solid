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
          |         |
          |         +--> Codex app-server thread/list
          |              recent same-project threads
          v
 codex queue --thread ... --message ...
              |
              v
 existing Codex CLI / Codex App thread
```

There are two pieces with different jobs.

The browser plugin, `codex()`, adds the service, command, **Send to Codex** toolbar action, and a bounded thread picker. Settings can load or remove this plugin without a page refresh.

The local companion owns process access. It listens on `127.0.0.1`, keeps the locally connected thread set, asks Codex app-server for recent threads in the same project directory, and invokes `codex queue`. A normal web page cannot start `codex`, Node, Bun, or another operating-system process, so browser Settings cannot create this local process by itself.

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

`mesurer-codex-connect` does five things:

1. Reads the current Codex session id.
2. Reads the current project directory from the trusted `SessionStart` hook event when available.
3. Reuses the bridge at `http://127.0.0.1:47365` when it is already healthy.
4. Starts the packaged bridge as a detached local process when no bridge is running.
5. Registers the current Codex thread and project directory and makes that thread the bridge default.

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

Loading `codex()` does not probe `127.0.0.1` by itself. The first **Send to Codex** press or **Choose Codex thread…** menu action performs the initial bridge check. This keeps ordinary Mesurer mounts free of ambient loopback traffic and avoids CSP console errors on pages that never use Codex delivery.

If that first contact fails, the action becomes disabled and is labelled **Codex unavailable**. Its dropdown offers **Retry Codex connection**. After one successful bridge contact, Mesurer health-checks that known companion; if it disappears, the action disables, and it re-enables automatically when the bridge returns.

The user's enabled preference stays separate from temporary bridge availability. A transient bridge outage therefore does not silently rewrite Settings.

A plain browser-only application still cannot start a missing local companion. The trusted Codex `SessionStart` hook or another local host with process access must do that work.

## Current-thread affinity and the recent-thread picker

The first healthy bridge thread observed by one mounted `codex()` plugin becomes that page's originating Codex thread. Mesurer keeps sending to that thread even if another Codex session later runs `SessionStart` and becomes the bridge-wide default.

This prevents an already-open Mesurer page from being silently stolen by whichever Codex session registered most recently.

Before the first successful bridge contact, the dropdown contains **Choose Codex thread…**. That action initializes the loopback connection and loads recent choices without sending feedback.

The dropdown beside **Send to Codex** shows:

1. the originating/current page thread first;
2. up to four more recent same-project Codex threads;
3. **Show 5 more…** when another five are available.

After **Show 5 more…**, the picker is bounded at ten entries. Selecting another entry changes only that Mesurer page's send target. The main **Send to Codex** button queues to the selected target.

Recent metadata comes from Codex app-server `thread/list`, sorted by Codex recency and scoped to the project directory captured by the trusted Codex connection. Mesurer uses Codex's user-facing thread name when present, otherwise the thread preview, and falls back to a shortened id.

A thread returned by app-server is not described as "currently open" merely because it is recent. Mesurer marks a thread as connected only when a local Codex `SessionStart`/registration path has registered it with the bridge.

## Permissions and privacy

Local Codex app-server thread listing does not have a separate per-request approval prompt. Installing the Mesurer Codex plugin and trusting its local `SessionStart` hook is the existing host-side trust boundary.

Mesurer intentionally does not expose an account-wide conversation browser to arbitrary pages. Recent discovery is limited to the project directory associated with the originating registered thread and to at most ten entries. The browser receives only the thread id, a bounded display title, recency timestamp, and whether the bridge has seen a trusted local registration for that thread.

If a future UI offers **All Codex projects**, that should be an explicit user opt-in rather than silently widening this scope.

## Existing threads versus creating a new thread

Codex app-server can create threads and start turns, but Mesurer does not do that automatically.

The current integration uses `codex queue` for existing threads. Codex's queue command routes through the shared app server and can durably enqueue a user message for an existing non-archived thread. If that thread is not currently loaded, the queued message may wait until Codex resumes it.

Starting a brand-new app-server turn is a different responsibility: a turn can generate command/file approval requests that must be surfaced by the client that owns that app-server connection. Mesurer's small loopback bridge is not an approval UI and must not auto-approve those requests or strand them invisibly.

For now, the safe product pattern is:

1. prefer the originating thread;
2. let the user explicitly pick another recent same-project thread;
3. if they want a new Codex thread, create/open it in Codex;
4. the trusted `SessionStart` hook registers it automatically and Mesurer can then target it.

Mesurer must never create a visible Codex task behind the user's back.

## Requirements

Use a current Codex build whose CLI exposes:

```bash
codex queue --help
codex app-server --help
```

`codex queue` targets an existing session by UUID or exact session name. The bridge uses app-server `thread/list` only for bounded, same-project discovery and keeps `codex queue` as the message-delivery path.

Current Codex hook events expose the running session id and working directory. `mesurer-codex-connect` uses both when started from the trusted `SessionStart` hook.

The current queue accepts text input. Mesurer sends structured Context text in this integration, not image attachments.

If the host page uses Content Security Policy, using browser-side Codex delivery requires `connect-src` permission for the configured loopback endpoint. Merely mounting `codex()` does not make a loopback request, so pages that block localhost still load Mesurer cleanly. An explicit send, thread chooser, or programmatic Codex service call fails through the normal delivery error path when policy blocks the connection.

## Start the foreground bridge manually

The automatic connector is the normal Codex path. The foreground command remains useful for debugging or explicit process ownership:

```bash
bunx mesurer-codex
```

When Codex starts it, the bridge reads `CODEX_THREAD_ID`, registers that thread, and uses the process working directory for recent-thread scope.

You can still choose the first thread explicitly from a normal local shell:

```bash
bunx mesurer-codex --thread <SESSION> --cwd <PROJECT_DIRECTORY>
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

Run that from a Codex shell or tool command in the destination thread. It reads that thread's `CODEX_THREAD_ID`, registers it with the current working directory, and makes it the bridge default.

`mesurer-codex-connect` also handles this case. If the bridge is already running, calling the connector from another Codex thread reuses the process and registers the new thread without forgetting earlier registrations.

If you already know an existing session UUID or exact name, a normal local shell can register it explicitly:

```bash
bunx mesurer-codex --register <SESSION>
```

Use `--bridge <URL>` when the bridge is not on the default endpoint.

The page-affinity behavior above means a later bridge registration does not silently retarget an already-mounted Mesurer browser plugin.

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

`codex()` adds a **Send to Codex** split action immediately but performs no loopback request on mount. The first send, or **Choose Codex thread…**, establishes bridge availability and then populates the thread choices.

When clicked:

1. If saved Context annotations exist, Mesurer sends their notes with current target status, exact geometry, relevant guides, measurements, distances, and inspection data.
2. Otherwise it sends the current selection Context.
3. If there is no current selection, it sends workspace Context.
4. The local companion queues that text as a Codex user message for the page's originating or explicitly selected destination.

The default instruction asks Codex to implement the feedback, preserve unrelated review state, and verify the result in the live page with Mesurer.

## Programmatic thread routing

The plugin provides `codex:v1`. Import its service type from the plugin entry:

```ts
import type { MesurerCodexService } from "mesurer-solid/plugins"

const service = host.service.get<MesurerCodexService>("codex:v1")

const status = await service?.health()
// { thread: "bridge-default", threads: ["bridge-default", "other-connected-thread"] }
```

List recent same-project threads:

```ts
const recent = await service?.listThreads({
  limit: 10,
  thread: status?.thread ?? undefined,
})
```

Switch the bridge-wide default to another thread that Codex already registered:

```ts
await service?.useThread("other-connected-thread")
await service?.send()
```

Or send one Context message to a bridge-visible thread without changing the bridge default:

```ts
await service?.send({
  thread: "recent-thread-id",
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

A thread override that is neither locally registered nor returned by same-project app-server discovery is rejected instead of being routed somewhere else.

## Failure behavior

Delivery is explicit. A send fails if the companion is unavailable, the Codex executable is missing, no target thread is available, the requested thread is unknown, the browser origin is not authorized, or `codex queue` rejects the request.

The first explicit send or thread-chooser attempt is the availability boundary. If Mesurer cannot reach the companion, the toolbar changes to disabled **Codex unavailable** state and its dropdown offers **Retry Codex connection**. Mesurer does not keep probing a bridge it has never reached, so restrictive-CSP hosts do not accumulate automatic loopback errors. Once a connection has succeeded, health polling continues and recovery is automatic if the companion later disappears and returns.

The toolbar reports delivery failures to the browser console with a `[Mesurer] Failed to send feedback to Codex: ...` diagnostic and propagates the failure through the plugin error path. Programmatic `send()` calls reject with the same underlying error.

`mesurer-codex-connect` reports bootstrap or registration failures to the local Codex process. It does not fall back to browser-side process creation or unrestricted browser-side thread registration.

## Security boundary

A web page must not gain arbitrary access to every Codex conversation because Codex is installed.

The integration keeps local authority outside the browser:

- A trusted local Codex process registers the originating/current destination and project directory.
- The browser may target that connected set plus the bounded same-project threads the bridge itself discovered through Codex app-server.
- The browser cannot widen discovery to another project by supplying an arbitrary cwd.

Other boundaries remain in place:

- The bridge listens on loopback only.
- Browser-side loopback traffic starts only after an explicit send, thread-chooser action, or programmatic Codex service call; after a successful UI connection, health polling is limited to that known endpoint.
- It invokes Codex without a shell.
- Non-loopback browser origins are denied unless explicitly allowed.
- Request bodies are size-limited.
- The browser cannot supply an executable or arbitrary command.
- Mesurer never creates a Codex thread behind the user's back.

The connector does not use an npm install hook and does not modify Codex persistence. It starts the companion only when a trusted local process explicitly invokes it.
