# Queue Context feedback to Codex

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
              +--> codex queue --thread ... --message ...
              |       Codex native durable queue
              |
              +--> Codex Desktop owner
              |       codex://threads/<threadId>
              |       Desktop loads/resumes the existing thread
              |       Codex queue watcher drains when the thread is safe
              |
              +--> CLI/TUI shared-daemon owner
                      resume notLoaded thread when needed
```

The browser plugin, `codex()`, adds the service, command, **Queue to Codex** toolbar action, and bounded thread picker. The local companion owns process access; a normal web page cannot start Codex or open a Desktop protocol URL itself.

Mesurer always persists human feedback through Codex's native queued-user-message path first. The returned queued-submission id is the durable identity for the request. This keeps Queue semantics inside Codex instead of reconstructing them in Mesurer.

When trusted `SessionStart` metadata identifies a Codex Desktop-owned thread, Mesurer uses that fact only to choose the wake mechanism. It does **not** use the app-tools pipe as the delivery transport. After Codex accepts the queue item, the bridge opens `codex://threads/<threadId>`, the same existing-thread deep link used by Codex itself. Desktop then owns loading or resuming the thread.

Codex's queue service watches durable external queue changes for loaded threads and dispatches queued input only when the thread can accept it. A cold thread starts its persisted queued message when resumed. If the thread is already active, the queued item remains queued until Codex's own lifecycle reaches a safe point. Mesurer never converts this action into `turn/steer`.

For bridge-restart recovery, Mesurer keeps bounded local delivery tracking under `$CODEX_HOME/mesurer/codex-deliveries.json`. That file is not a second user-message queue; the actual request remains in Codex's native queue. Existing queued-submission ids are preserved and never deleted to change Desktop transports.

When the destination is a CLI/TUI shared-daemon environment instead of Desktop, the same native Codex queue remains the source of truth. The bridge may inspect the shared local app-server and resume only a `notLoaded` thread so Codex can drain its own queue. Mesurer does not require or bootstrap that standalone daemon for Desktop.

## Queue versus Steer

Mesurer implements **Queue**, not **Steer**.

- **Queue.** Codex durably stores the follow-up and runs it when the destination thread is ready.
- **Desktop wake.** Mesurer opens the existing thread with `codex://threads/<threadId>`; this does not replace the queued message with another send.
- **Steer.** Changing an already in-flight turn remains a separate Codex operation and is never invoked by Mesurer.

This means Desktop delivery no longer depends on the `codex_app` MCP pipe being open. A closed app-tools pipe does not invalidate a queued Mesurer request.

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
3. Reuses the bridge at `http://127.0.0.1:47365` only when that process reports the exact packaged bridge source identity. A stale self-identifying Mesurer bridge is stopped and replaced; legacy/unidentified occupants are rejected instead of silently reused.
4. Starts the packaged bridge as a detached local process when no compatible bridge is running.
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

Loading `codex()` does not probe `127.0.0.1` by itself. The first **Queue to Codex** press or **Choose Codex thread…** menu action performs the initial bridge check. This keeps ordinary Mesurer mounts free of ambient loopback traffic and avoids CSP console errors on pages that never use Codex delivery.

If that first contact fails, the action becomes disabled and is labelled **Codex unavailable**. Its dropdown offers **Retry Codex connection**. After one successful bridge contact, Mesurer health-checks that known companion; if it disappears, the action disables, and it re-enables automatically when the bridge returns.

The user's enabled preference stays separate from temporary bridge availability. A transient bridge outage therefore does not silently rewrite Settings.

A plain browser-only application still cannot start a missing local companion. The trusted Codex `SessionStart` hook or another local host with process access must do that work.

## Delivery state and completed annotations

The queue action has one page-local delivery state machine:

1. **Queueing to Codex…** starts immediately on the first press. The action and destination choices are disabled before the network request begins, so a fast double-click cannot create a duplicate queue entry.
2. **Queued for Codex** means Codex durably accepted the request. The bridge also records Codex's queued-submission id and wakes a cold `notLoaded` destination through the same shared daemon; it does not steer or interrupt an active turn.
3. **Codex working…** means read-only Codex turn history contains one recent turn whose user message matches the exact queued Mesurer payload and whose status is `inProgress`.
4. **Codex finished** means that exact matched turn reports `completed`. The action shows its completion state briefly, then becomes available again.
5. **Codex interrupted** means that exact matched turn reports `interrupted`. A failed turn uses the same retry-preserving terminal behavior. The action becomes available again and the annotation is preserved.

The bridge gives every queued request a random delivery id and stores a bounded amount of lifecycle metadata. It also keeps Codex's durable queued-submission id and dispatch diagnostic (`desktop-opened`, `resumed`, `already-loaded`, or a non-fatal wake failure) when the current Codex CLI exposes that identity. For Desktop deliveries, bridge polling uses bounded recent turn history from Codex app-server to match the exact queued message. Codex can normalize a persisted `inProgress` turn to `interrupted` when a separate reader process does not own the live Desktop thread; that synthetic state keeps `completedAt` unset. Mesurer therefore treats `interrupted` without a completion timestamp as Working and accepts Interrupted only after Codex has persisted the turn end. It does not add a hidden marker to the user-visible prompt. Desktop ignores legacy lifecycle-hook posts entirely. The legacy hook endpoint remains available only for non-Desktop compatibility.

When the queued request contains saved Mesurer annotations, the browser retains the exact annotation ids used to construct the message. After the matching turn reaches **Codex finished**, `codex()` removes only those saved annotations. Notes created later, notes that were not part of the queued message, and annotations from interrupted turns remain untouched.

Automatic removal defaults on. Disable it per mount when review history should remain:

```ts
codex({ clearCompletedAnnotations: false })
```

This rule tracks Codex turn completion. It does not prove that the requested UI change is correct. The default queued instruction still tells Codex to verify the affected UI in the live page before claiming completion.

Current lifecycle tracking does not require `UserPromptSubmit`, `Stop`, or `Interrupt` hooks. The trusted `SessionStart` hook is only responsible for local bridge bootstrap, project scope, and thread registration. The browser stores the active delivery id, destination thread, lifecycle state, and exact annotation ids in per-tab `sessionStorage` while a delivery is queued, working, or interrupted. Interrupted state re-enables Queue immediately but remains reconcilable for a bounded period, so a later authoritative correction to Working or Completed updates the live page and completion can still retire the exact sent annotations. If the page reloads during that window, `codex()` resumes polling that delivery instead of freezing the stale terminal label.

If Codex history cannot be read or the exact queued prompt cannot be correlated unambiguously, Mesurer leaves the delivery and annotation intact. It never infers completion from a missing queue item or an unrelated newer turn. On bridge startup, persisted Desktop records are rechecked against the authoritative turn when possible, so an older bridge's premature terminal state can be corrected after upgrading.

## Current-thread affinity and the recent-thread picker

The first unambiguous healthy bridge thread observed by one mounted `codex()` plugin becomes that page's originating Codex thread. Mesurer keeps sending to that thread even if another Codex session later runs `SessionStart` and becomes the bridge-wide default.

That page affinity is stored in browser `sessionStorage`, scoped to the configured bridge endpoint plus the page origin and pathname. It survives a reload in the same tab but does not become an account-wide or cross-tab default. A user-selected override is stored with the origin thread too, so reloading does not silently fall back to a different bridge-wide target.

If a reloaded page has no saved affinity and the bridge has more than one registered Codex thread, Mesurer refuses to inherit the bridge's current default. The toolbar becomes **Choose Codex thread** until the user picks a destination. This is intentional: an ambiguous reload must fail closed instead of queueing feedback into an unrelated idle session.

This prevents both an already-open Mesurer page and a reloaded page from being silently stolen by whichever Codex session registered most recently.

Before the first successful bridge contact, the dropdown contains **Choose Codex thread…**. That action initializes the loopback connection and loads recent choices without sending feedback.

The dropdown beside **Queue to Codex** shows:

1. the originating/current page thread first;
2. up to four more recent same-project Codex threads;
3. **Show 5 more…** when another five are available.

After **Show 5 more…**, the picker is bounded at ten entries. Selecting another entry changes only that Mesurer page's send target. The main **Queue to Codex** button queues to the selected target.

Recent metadata comes from Codex app-server `thread/list`, sorted by Codex recency and scoped to the project directory captured by the trusted Codex connection. Mesurer uses Codex's user-facing thread name when present, otherwise the thread preview, and falls back to a shortened id.

A thread returned by app-server is not described as "currently open" because it is recent. Mesurer marks a thread as connected only when a local Codex `SessionStart`/registration path has registered it with the bridge.

## Permissions and privacy

Local Codex app-server reads do not have a separate per-request approval prompt. Installing the Mesurer Codex plugin and trusting its `SessionStart` hook is the host-side trust boundary for bridge bootstrap and thread/project registration. Lifecycle reconciliation then uses read-only app-server history from that local companion. Browser pages still cannot register sessions or widen project scope.

Mesurer does not expose an account-wide conversation browser to arbitrary pages. Recent discovery is limited to the project directory associated with the originating registered thread and to at most ten entries. The browser receives only the thread id, a bounded display title, recency timestamp, and whether the bridge has seen a trusted local registration for that thread.

If a future UI offers **All Codex projects**, that should be an explicit user opt-in rather than silently widening this scope.

## Existing threads versus creating a new thread

Codex app-server can create threads and start turns, but Mesurer does not do that automatically.

The current integration uses `codex queue` for existing threads. Codex's queue command routes through the shared app server and durably enqueues a user message for an existing non-archived thread. After persistence, Mesurer checks that same daemon and resumes only a `notLoaded` destination; this is Codex's own cold-queue dispatch path. An already-loaded thread is never resumed or steered by Mesurer and continues draining its queue under Codex's scheduler.

Starting a new app-server turn is a different responsibility. A turn can generate command or file approval requests, and the client that owns the app-server connection must present them. Mesurer's small loopback bridge is not an approval UI and must not auto-approve those requests or strand them invisibly.

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

`codex queue` targets an existing session by UUID or exact session name. The bridge uses app-server `thread/list` only for bounded, same-project discovery and keeps `codex queue` as the message-persistence path. After a successful queue response, it uses Codex's local stdio-to-UDS relay only to inspect the shared daemon and resume a cold destination.

Current Codex app-server exposes `thread/turns/list` with turn status, summary items, and terminal timing. Mesurer uses that bounded read-only history to correlate the exact queued user message to its turn. Because Codex's separate-reader normalization can relabel an unfinished `inProgress` turn as `interrupted`, Mesurer requires `completedAt` before accepting Interrupted. `thread/read` remains only the compatibility fallback when paginated turn history is unavailable. `mesurer-codex-connect` still uses the session id and working directory from trusted `SessionStart`. The packaged `codex-lifecycle.mjs` helper remains for compatibility with older trusted installs, but current correctness does not depend on it.

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

`mesurer-codex-connect` also handles this case. If the matching bridge is already running, calling the connector from another Codex thread reuses that exact process and registers the new thread without forgetting earlier registrations. If the packaged bridge source changed, a self-identifying older bridge is replaced before registration; pre-identity legacy bridges fail closed and must be stopped once rather than receiving new lifecycle traffic.

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

`codex()` adds a **Queue to Codex** split action immediately but performs no loopback request on mount. The first send, or **Choose Codex thread…**, establishes bridge availability and then populates the thread choices.

When clicked:

1. If saved Context annotations exist, Mesurer sends their notes with current target status, exact geometry, relevant guides, measurements, distances, and inspection data.
2. Otherwise it sends the current selection Context.
3. If there is no current selection, it sends workspace Context.
4. The local companion queues that text as a Codex user message for the page's originating or explicitly selected destination.

The default instruction asks Codex to implement the feedback, preserve unrelated review state, and verify the result in the live page with Mesurer.

## Programmatic thread routing

The plugin provides `codex:v1`. Import its service type from the plugin entry:

```ts
import {
  MESURER_CODEX_SERVICE_ID,
  type MesurerCodexService,
} from "mesurer-solid/plugins"

const service = await mesurer.service<MesurerCodexService>(MESURER_CODEX_SERVICE_ID)

const status = await service.health()
// { thread: "bridge-default", threads: ["bridge-default", "other-connected-thread"] }
```

List recent same-project threads:

```ts
const recent = await service.listThreads({
  limit: 10,
  thread: status?.thread ?? undefined,
})
```

Switch the bridge-wide default to another thread that Codex already registered:

```ts
await service.useThread("other-connected-thread")
await service.queue()
```

Or queue one Context message for a bridge-visible thread without changing the bridge default:

```ts
const result = await service.queue({
  thread: "recent-thread-id",
})
// result.delivery === "queued"
```

Read the tracked lifecycle later with the returned delivery id:

```ts
const delivery = result
  ? await service.delivery(result.deliveryId)
  : undefined
```

`queue()` is the canonical service method and returns `delivery: "queued"`; Mesurer does not claim that the active turn was steered. The 0.1.8 `send()` method remains as a compatibility alias.

Send only particular saved annotations:

```ts
await service.queue({
  annotationIds: ["annotation-1", "annotation-2"],
})
```

Or replace the instruction for one send:

```ts
await service.queue({
  instruction: "Implement these visual review notes, then verify them in Mesurer.",
})
```

A thread override that is neither locally registered nor returned by same-project app-server discovery is rejected instead of being routed somewhere else.

## Failure behavior

Delivery is explicit. A send fails if the companion is unavailable, the Codex executable is missing, no target thread is available, the requested thread is unknown, the browser origin is not authorized, or `codex queue` rejects the request.

The first explicit send or thread-chooser attempt checks bridge availability. If Mesurer cannot reach the companion, the toolbar changes to disabled **Codex unavailable** state and its dropdown offers **Retry Codex connection**. Mesurer does not keep probing a bridge it has never reached, so restrictive-CSP hosts do not accumulate automatic loopback errors. Once a connection has succeeded, health polling continues and recovery is automatic if the companion later disappears and returns.

The toolbar reports queue failures to the browser console with a `[Mesurer] Failed to queue feedback for Codex: ...` diagnostic and propagates the failure through the plugin error path. Programmatic `queue()` calls reject with the same underlying error.

A queue request that Codex durably accepted is never reported as a failed send because the follow-up daemon wake check failed; doing so would invite a duplicate retry. Its delivery metadata records the non-fatal wake diagnostic and Mesurer keeps the saved annotation until a matching lifecycle completion event arrives. A request that cannot be lifecycle-tracked is never treated as completed to clear the UI.

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
