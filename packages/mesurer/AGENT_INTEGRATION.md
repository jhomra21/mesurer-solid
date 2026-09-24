# Mesurer agent integration

Mesurer's agent integration is the rendered page itself. The coding agent reads `window.__MESURER__` through the browser control it already has, consumes human visual intent, edits normal application source, and verifies the real Live result.

The normal agent workflow requires no Mesurer MCP server, localhost daemon, Send-to-agent callback, or browser-tool-specific transport. The optional `codex()` plugin is a separate human convenience path for explicitly sending Context feedback to Codex threads that a local Codex process or the user has registered with the loopback companion; it does not replace the browser-state contract described here.

## Install the agent skill

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```


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

## Know the available capabilities

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, and Settings. Native Color Picker appears only when the browser exposes a working `EyeDropper`.

First-party plugins add Context, Arrange, Screenshot, and optional Codex delivery. The complete public map, including the low-level inspection methods and plugin host, is in [Capabilities](../../docs/CAPABILITIES.md).

For normal coding-agent work, use `window.__MESURER__`. Use `window.__MESURER_INSTANCE__` only when the task requires mounted-instance or plugin-host operations.

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

Use the browser, Electron, WebView, Playwright, CDP, or other evaluation channel the browser controller already provides. With the installed skill, evaluate `.agents/skills/mesurer-ui/assets/inject-script.js`. With the npm package installed, read `mesurer-solid/inject-script`.

Do not mutate application source or create another browser connection merely to get Mesurer into a page the browser controller can already evaluate.

The optional human Screenshot plugin remains disabled during normal agent injection unless configured before first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

## Inventory human intent

For a broad request such as "check Mesurer," collect all relevant state before editing source:

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

## Agent API reference

Use the high-level Context and saved-intent methods for normal UI work. The lower-level methods are useful when you need a direct element lookup, point lookup, plugin command, or one combined state snapshot.

| Method | Use it for |
| --- | --- |
| `ready()` | Wait for Mesurer to finish loading. |
| `describe()` | Read loaded plugins and their tools, settings, overlays, state, commands, hooks, and services. |
| `inspect(selector, index?)` | Inspect one matching rendered element. |
| `inspectAll(selector, limit?)` | Inspect several matches without changing selection. |
| `at(x, y)` | Inspect the page element at viewport coordinates. |
| `distance(a, b)` | Measure two selector targets. |
| `viewport()` | Read viewport/document dimensions, scrolling, device pixel ratio, and overflow. |
| `feedback(selectors?)` | Read viewport data, inspected elements, plugin description, and plugin state together. |
| `command(id, args?)` | Execute a registered Mesurer command and return its JSON-safe result when present. |
| `state()` | Read plugin state. |
| `stable(frames?)` | Wait for fonts and rendering before measuring again. |
| `textEdits()` / `textEdit(id)` | Read saved direct-text and typography intent. |

Context adds `capabilities()`, `context()`, `contextText()`, `select()`, `annotations()`, `review()`, `capturePlan()`, `prepareCapture()`, and `finishCapture()`.

These inspection methods accept general DOM elements, including SVG. `select()` and point inspection can return SVG targets, and Context preserves their selector, tag, and geometry. Arrange and direct text editing remain HTML-only mutation paths.

Human Select lifecycle follows the same public contract. Invoking Select clears the current element and Guide selection before toggling the tool, and holding Shift while clicking rendered targets adds or removes them from the human multi-selection. Browser and agent code should not assume a hidden selection survives Select-off or an off-state reload.

Arrange adds `arrangements()`, `arrange()`, `showArrange()`, `arrangeCapturePlan()`, and `reviewArrange()`.

Use `capabilities().capabilities` before calling optional Context, Arrange, or text-edit paths. The complete public list is in [Capabilities](../../docs/CAPABILITIES.md).

## Select exact targets

Do not overwrite a meaningful human selection until its context has been retained. When there is no relevant human selection and the exact targets are known:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Each selector must resolve to exactly one target. Missing or ambiguous selectors throw rather than binding to a guess.

For multi-selection, inspect every selected target and the relevant pair relationships. Prefer `selection.visualContext.distances`; use `distance(a, b)` when a needed pair has no existing evidence. Box, guide, container, and diagonal semantics are defined in [Measurements and distance geometry](../../docs/MEASUREMENTS.md).

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

Native editing stays native. Mesurer does not intercept form controls or descendants that inherit `contenteditable`. A nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the direct-text rules otherwise pass. Mixed inline copy can target the exact direct text run under the pointer while preserving inline children and the host element's native DOM surface.

The editing UI exposes direct B/I/U, Font, Size, Weight, rendered-page colors, custom color, and a separate Text/H1/H2/H3 semantic preset popup. Missing heading levels are not invented.

If Typography was already explicitly selected, the direct-edit session suppresses the older hover/pinned Typography UI so the field has one live card. The normal Typography UI returns when editing ends.

Direct edit also owns the field's visible selection lane. The duplicate ordinary selected border is paint-suppressed, the selected dimensions pill remains available, and the Typography card stays source-relative without reacting to ordinary pointer movement. The selection-adjacent Add Note button is hidden only during the active edit and returns afterward. Existing saved annotation state remains available throughout.

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

For ordinary coding-agent evidence, the browser controller owns screenshot bytes while Mesurer prepares capture presentation:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // browser-controller screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

The optional human `screenshot()` plugin from `mesurer-solid/plugins` is a separate camera workflow. It may use application-native, Chromium extension, or browser display capture internally, but none of those paths changes the agent contract above. Do not add or configure a host capture path only to collect coding-agent evidence. Preserve an existing human preview unless the task is specifically about Screenshot behavior.

## Optional human-to-Codex delivery

A page can mount `codex()` next to `context()` for explicit human-triggered delivery. This is optional and does not add a generic send method to `window.__MESURER__`.

For local Codex projects, the trusted `SessionStart` connector starts or reuses the packaged loopback companion and registers the current session with its project directory. Browser code cannot register arbitrary sessions or start the local process.

Delivery uses Codex's native durable queue. Mesurer queues once and keeps the queued-submission id. Desktop delivery opens the existing `codex://threads/<threadId>` destination and lets Codex's queue watcher run the item when the thread can accept it. CLI/TUI sessions use the same queued item and may resume a cold `notLoaded` thread through the shared daemon. Mesurer never calls `turn/steer`, never deletes and resends an existing queue item during recovery, and does not use the Desktop app-tools pipe as a second delivery path.

The browser plugin connects lazily on the first Queue to Codex or thread-picker action. Page affinity and an explicit destination override persist per tab. If several registered threads are visible and the page has no saved destination, the user must choose one.

The typed `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, `delivery(deliveryId)`, and canonical `queue(request?)`. `send(request?)` remains a compatibility alias. The generic plugin command is `codex.queue`; `codex.send` remains its compatibility alias. Queue submission is single-flight. A matched completed turn may remove only the annotation ids sent with that delivery; interrupted, failed, ambiguous, or unreadable work keeps them.

Mesurer does not create new Codex threads. Create or open the thread in Codex and let `SessionStart` register it. Turn completion is transport lifecycle, not proof that the requested UI result is correct.

See [Queue Context feedback to Codex](../../docs/CODEX.md) for setup, routing, recovery, privacy, and failure behavior.

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

The repository's packaged [`mesurer-ui` skill](./skills/mesurer-ui/SKILL.md) carries the operational version of this contract for coding agents. [Browser and agent integration](../../docs/BROWSER_HARNESS.md) documents the browser-control boundary.
