# Mesurer agent integration

Mesurer's agent integration is the rendered page itself. The coding agent reads `window.__MESURER__` through the browser control it already has, consumes human visual intent, edits normal application source, and verifies the real Live result.

The normal agent workflow requires no Mesurer MCP server, localhost daemon, Send-to-agent callback, or harness-specific transport. The optional `codex()` plugin is a separate human convenience path for explicitly sending Context feedback to Codex threads that a local Codex process or the user has registered with the loopback companion; it does not replace the browser-state contract described here.

## Install the Agent Skill

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

Use `mesurer-solid@beta` only when intentionally validating a prerelease.

The installer writes a self-contained skill and injection artifact:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    ├── inject-script.js
    ├── codex-connect.mjs
    ├── codex-lifecycle.mjs
    └── codex-bridge.mjs
```

## Reuse a live instance

Before injecting anything, check whether Mesurer is already connected:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If it exists, use that instance. A person may already have selected targets, guides, measurements, annotations, Arrange intent, text/style intent, or screenshot review state. That state is part of the request.

The injector reuses a connected instance by default. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

Do not replace a live instance while consuming human review state.

## Inject only when absent

Use the browser, Electron, WebView, Playwright, CDP, or other evaluation channel the harness already owns. With the installed skill, evaluate `.agents/skills/mesurer-ui/assets/inject-script.js`. With the npm package installed, read `mesurer-solid/inject-script`.

Do not mutate application source or create another browser connection merely to get Mesurer into a page the harness can already evaluate.

The optional human Screenshot plugin remains disabled during normal agent injection unless configured before first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

## Inventory human intent

For a broad request such as “check Mesurer,” collect all relevant state before editing source:

```js
const capabilities = window.__MESURER__.capabilities().capabilities
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()
const arrangements = capabilities.arrange
  ? await window.__MESURER__.arrangements()
  : []
const textEdits = capabilities.textEdit
  ? await window.__MESURER__.textEdits()
  : []

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Resolve relevant records before HMR can replace their DOM targets:

```js
const annotationContexts = await Promise.all(
  annotations.map((annotation) =>
    window.__MESURER__.context({ annotation: annotation.id })
  ),
)

const arrangeIntents = await Promise.all(
  arrangements.map((intent) => window.__MESURER__.arrange(intent.id)),
)

const textEditIntents = await Promise.all(
  textEdits.map((intent) => window.__MESURER__.textEdit(intent.id)),
)
```

Treat annotation notes, Arrange Desired geometry, and text/style Desired state as intent. Treat selection, measurements, distances, geometry, and computed styles as rendered evidence.

## Select exact targets

Do not overwrite a meaningful human selection until its context has been retained. When there is no relevant human selection and the exact targets are known:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Each selector must resolve to exactly one target. Missing or ambiguous selectors throw rather than binding to a guess.

For multi-selection, inspect every selected target and the relevant pair relationships. Prefer `selection.visualContext.distances`; use `distance(a, b)` when a needed pair has no existing evidence.

## Arrange intent

Arrange expresses requested geometry, not source implementation.

```js
const intents = await window.__MESURER__.arrangements()
const intent = await window.__MESURER__.arrange(arrangeId)
```

A 96px Desired offset does not mean production source should use `transform: translateX(96px)`. Implement the visual outcome through the application's real flex/grid, spacing, sizing, ordering, or component structure.

After source changes:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Live removes the temporary Arrange preview before measuring source output.

Arrange preview ownership is conservative. Mesurer restores an older transform only while the element still carries the exact preview value and priority Mesurer applied. Host-authored transform changes survive review, refresh, and disposal.

See [Arrange](../../docs/ARRANGE.md).

## Text and Typography intent

Direct text editing records copy and typography intent without pretending to edit source. The human-facing tool is **Typography**; the internal compatibility id remains `text-inspector`.

Editing starts by double-click/double-tap while Select or Typography is active. Arrange keeps Select active, so editing works while Arrange remains selected.

Native editing stays native. Mesurer does not intercept form controls or descendants that inherit `contenteditable`. A nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the direct-text rules otherwise pass.

The editing UI exposes direct B/I/U, Font, Size, Weight, rendered-page colors, custom color, and a separate Text/H1/H2/H3 semantic preset popup. Missing heading levels are not invented.

If Typography was already explicitly selected, the direct-edit session suppresses the older hover/pinned Typography surface so the field has one live card. The normal surface returns when editing ends.

Direct edit also owns the field's visible selection lane. The duplicate ordinary selected border is paint-suppressed, the selected dimensions pill remains available, and the Typography card stays source-relative without reacting to ordinary pointer movement. The selection-adjacent Add Note button is intentionally hidden during the active edit and returns afterward. Existing saved annotation state remains available throughout.

Read durable intent through:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

Treat `intent.desired` and style deltas as visual/source requirements, not inline CSS instructions. Look for the application's semantic props, classes, design tokens, CSS variables, theme values, or stylesheet rules that produce the requested render.

Verification must use Live source with the Desired preview inactive. Text/style preview ownership follows the same conservative rule as Arrange: while the DOM still equals Mesurer's owned value, undo/redo can move it to the restored Desired value; once the application changes it, Mesurer preserves the host value instead of overwriting it during history or cleanup.

Do not infer Context availability from transient chrome. While a direct editor is active the Add Note button is absent by design, but `annotations()`, annotation-scoped `context()`, and `review()` remain the durable interface.

See [Direct text editing and Typography](../../docs/TEXT_EDITING.md).

## Annotation and context review

A saved annotation carries target-bound intent and an immutable baseline:

```js
const context = await window.__MESURER__.context({ annotation: annotationId })
```

Saved annotation UI is source-linked presentation, not the durable state itself. Saved annotations survive a same-tab reload and conservatively rebind through their stored selector/fingerprint identity; ambiguous targets remain unresolved rather than attaching to a different element. Add Note, its composer, saved markers and panels, and the ownership edge move with their target through window and nested scrolling. A saved panel keeps its target-relative page point and may leave the viewport with its source. Several notes on one target keep separate nearby markers, and Add Note remains available while an existing note is open.

Do not infer that an annotation disappeared because its card or marker is currently offscreen. Read `annotations()` and annotation-scoped `context()` instead. When a note is highlighted, the temporary ownership emphasis uses one exact target boundary rather than a second fill, glow, or rounded frame.

Context cards are Mesurer inspector UI. Live Select hover and selection evidence must paint underneath the composer and saved panels, including when the outer Mesurer host is in the browser top layer. Agents should treat the cards as interaction boundaries rather than attempting to select page content through them.

After source changes:

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

`review()` can report exact geometry/evidence changes without any external message transport.

## Screenshots

For ordinary coding-agent evidence, the outer harness owns screenshot bytes while Mesurer prepares capture presentation:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional human `screenshot()` plugin from `mesurer-solid/plugins` is a separate camera workflow. It is not an agent delivery capability. Preserve an existing human preview unless the task is specifically about Screenshot behavior.

## Optional human-to-Codex delivery

A source-mounted page may opt into `codex()` from `mesurer-solid/plugins` alongside `context()`. This is not an agent integration requirement and does not add a generic send capability to `window.__MESURER__`.

For a Codex-controlled local project, the preferred lifecycle is the trusted `SessionStart` connector. `mesurer-codex-connect` reads the current Codex session id and project directory, starts or reuses the packaged loopback companion, and registers that pair locally. The browser cannot spawn this process and must not be given a browser-side registration escape hatch.

Delivery is owner-aware and remains distinct from an explicit Steer action. A Codex Desktop SessionStart registers its app-tools pipe with the bridge. Mesurer persists that feedback locally, waits while the app-owned `read_thread` reports the target active, and calls `send_message_to_thread` only after observing idle/not-loaded state. The bridge does not start the standalone app-server daemon for Desktop. A bridge restart reloads the same Desktop delivery from `$CODEX_HOME/mesurer/codex-deliveries.json`.

For CLI/TUI shared-daemon sessions, `codex queue` remains the durable transport and Mesurer retains Codex's queued-submission id. Older native queue state can be migrated into a Desktop-owned delivery only after the exact queue item is validated and the full message is persisted locally; the bridge then deletes that exact native item before app-native dispatch.

Desktop currently exposes no atomic queue-only cross-thread app-tool call. The idle check and send can race, so do not describe Desktop Queue as a stronger guarantee than the underlying owner provides. Mesurer's contract is to avoid knowingly steering an active turn, avoid blind retry after an uncertain send, and keep the human feedback durable while delivery is blocked.

The browser plugin is intentionally lazy. Mounting `codex()` performs no loopback request. The human's first **Queue to Codex** action or **Choose Codex thread…** menu action establishes bridge availability. A failed first contact becomes **Codex unavailable** with an explicit retry. After one successful connection, Mesurer may health-check that known companion so it can disable and recover the action if the bridge later stops or restarts.

The first unambiguous healthy thread observed by one Mesurer page becomes that page's originating destination. The browser persists that origin plus any explicit destination override in per-tab `sessionStorage`, so a reload keeps the same route. Later `SessionStart` registrations do not silently steal the page. When a page has no saved affinity and multiple registered threads are visible, Mesurer requires the human to choose one instead of inheriting the bridge-wide default. The bridge uses Codex app-server `thread/list`, scoped to the trusted project directory, to expose at most ten recent same-project threads. The browser may send to a locally registered thread or to one of those bridge-discovered same-project threads, but it cannot supply an arbitrary project directory or invent an arbitrary session id.

The typed `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and `send({ thread })`. `useThread(thread)` changes the bridge default only for a locally registered thread; a page-specific `send({ thread })` can target any thread the bridge has already registered or discovered for the scoped project.

The human queue control owns duplicate suppression and visible delivery state. It disables before the request starts, then tracks Queueing → Queued → Working → Finished/Interrupted from trusted Codex lifecycle hooks. Do not add an agent-side second queue merely because the human presses the control twice.

When a queued request contains saved annotations, `codex()` remembers those exact ids. Queued/working delivery state is persisted per tab so a reload resumes the same delivery id rather than losing its cleanup contract. By default it removes the exact sent annotation ids only after the matching Codex turn reports `Stop`; `Interrupt` and delivery failure preserve them. This is completion cleanup, not semantic proof. The coding agent must still verify the rendered result before finishing, and must not manually clear unrelated Mesurer review state.

Mesurer does not create a new Codex thread or start a new app-server turn. New threads should be created or opened in Codex, where the client that owns the turn can surface command and file approval requests. The trusted `SessionStart` path then registers the thread automatically. See [Queue Context feedback to Codex](../../docs/CODEX.md).
## Revalidate after source edits

After HMR or reload settles:

```js
await window.__MESURER__.stable()
```

Then compare the same evidence retained before editing:

- Arrange Desired against Live through `reviewArrange()`;
- text/style Desired against Live with the text preview inactive;
- saved annotations through `review()`;
- current selections and measurements through fresh `context()`;
- exact geometry through `inspect()`, `distance()`, and `viewport()`.

Do not clear human history merely to expose Live state, and do not reinject just to refresh context.

## Completion rule

A meaningful Mesurer call should affect the work. If exact geometry is available, use it instead of estimating pixels from a screenshot. If the user already encoded intent in Arrange, text editing, annotations, or selection, consume it before asking them to repeat it.

The repository's packaged [`mesurer-ui` skill](./skills/mesurer-ui/SKILL.md) carries the operational version of this contract for coding agents. [Browser and agent integration](../../docs/BROWSER_HARNESS.md) documents the outer harness boundary.
