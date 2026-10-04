# Mesurer agent integration

Mesurer's agent integration is the rendered page itself. This guide matches `mesurer-solid@0.2.1` stable. The coding agent reads `window.__MESURER__` through the browser control it already has, consumes human visual intent, edits normal application source, and verifies the real Live result.

The normal agent workflow requires no Mesurer MCP server, Send-to-agent callback, or special browser transport. The optional `codex()` plugin is a separate human convenience path for sending Context feedback into local Codex threads; it does not replace the browser-state contract described here. In Electron it can use the native preload bridge. In an ordinary browser it can use the local Mesurer Codex Bridge companion on loopback. Neither path is the Mesurer Solid ChatGPT/Codex agent plugin.

## Install the agent skill

```bash
npx --yes --package=mesurer-solid@latest mesurer-skill install
```


The installer writes a self-contained skill and injection artifact:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    ├── mediabunny-vendor.js
    ├── inject-script.js
    ├── codex-bridge.mjs
    └── codex-connect.mjs
```

## Know the available capabilities

The base inspector includes Select, X-ray, Color Picker, Rulers, Typography, Guides, Distance, and Settings. Color Picker uses application-local host capture when available and otherwise uses a working browser `EyeDropper`.

First-party plugins add Context, Edit, Layout Guides, Screenshot, Recording, and optional Codex delivery. Recording is a human video-capture workflow with a typed `recording:v1` service; it is not the normal coding-agent evidence channel. Edit movement preserves the existing Arrange agent method names for compatibility. The complete public map, including the low-level inspection methods and plugin host, is in [Capabilities](../../docs/CAPABILITIES.md).

Rulers, ordinary Guides, and Layout Guides remain available while the human is in Edit; X-ray, Color Picker, Typography, Screenshot, and Recording remain Select-lane tools. For normal coding-agent work, use `window.__MESURER__`. Use `window.__MESURER_INSTANCE__` only when the task requires mounted-instance or plugin-host operations.

## Use the visible Mesurer UI when it is the best interface

Mesurer does not require an agent-specific transport for ordinary interaction. A browser or computer-use harness can click and drag the live Mesurer interface exactly as a person can. Use that path for exploratory visual work, mode/tool changes, Guides/Layout Guides, Edit movement, Typography, Screenshot, Recording, Settings, and other inspector UI.

Use `window.__MESURER__` when the answer is better represented as exact structured evidence: selectors, geometry, distances, computed styles, Context, saved intent, or review deltas.

Stable Mesurer-owned automation hooks are documented in [Browser and agent integration](../../docs/BROWSER_HARNESS.md). The optional local ChatGPT/Codex plugin adds semantic MCP shortcuts over this same contract; it does not replace browser control. See [ChatGPT and Codex plugin](../../docs/CHATGPT_CODEX_PLUGIN.md).

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

If it exists, use that instance. A person may already have selected targets, guides, measurements, annotations, Edit movement intent, text/style intent, screenshot review state, or a Recording preview. That state is part of the request.

The injector reuses a connected instance by default. Deliberate replacement requires:

```js
window.__MESURER_CONFIG__ = { reuseExisting: false }
```

Do not replace a live instance while consuming human review state.

## Inject only when absent

Use the browser, Electron, WebView, Playwright, CDP, or other evaluation channel the browser controller already provides. With the installed skill, evaluate `.agents/skills/mesurer-ui/assets/mediabunny-vendor.js` first and then `.agents/skills/mesurer-ui/assets/inject-script.js`. With the npm package installed, use the sibling `mesurer-solid/mediabunny-vendor` classic asset before `mesurer-solid/inject-script`. Keep the two files separate so MediaBunny remains on its MPL-2.0 distribution boundary.

Do not mutate application source or create another browser connection merely to get Mesurer into a page the browser controller can already evaluate.

Human Screenshot and Recording UI are separate from the normal agent evidence path. Do not reinject a live instance merely to change either plugin's state. For compatibility, Screenshot can still be enabled before first injection:

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

Treat annotation notes, Edit movement Desired geometry, and text/style Desired state as intent. Treat selection, measurements, distances, geometry, and computed styles as rendered evidence.

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

These inspection methods accept general DOM elements, including SVG. `select()` and point inspection can return SVG targets, and Context preserves their selector, tag, and geometry. Edit movement and direct text editing remain HTML-only mutation paths.

Human Select lifecycle follows the same public contract. Invoking Select clears the current element and Guide selection before toggling the tool, and holding Shift while clicking rendered targets adds or removes them from the human multi-selection. Browser and agent code should not assume a hidden selection survives Select-off or an off-state reload.

Edit movement exposes `arrangements()`, `arrange()`, `showArrange()`, `arrangeCapturePlan()`, and `reviewArrange()` under their existing compatibility names.

Use `capabilities().capabilities` before calling optional Context, Edit movement, or text-edit paths. The complete public list is in [Capabilities](../../docs/CAPABILITIES.md).

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

## Edit movement intent

Edit movement expresses requested geometry, not source implementation. The agent method names keep `Arrange` for compatibility.

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

Live removes the temporary Edit movement preview before measuring source output.

Edit movement preview ownership is conservative. Mesurer restores an older transform only while the element still carries the exact preview value and priority Mesurer applied. Host-authored transform changes survive review, refresh, and disposal.

See [Edit](../../docs/EDIT.md).

## Text and Typography intent

Direct text editing records copy and typography intent without pretending to edit source. The human-facing tool is **Typography**; the internal compatibility id remains `text-inspector`.

Editing starts by double-click or double-tap while Edit is active. Typography in Select stays inspection-only. Movement and direct text/style editing can therefore share one Edit session.

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

Verification must use Live source with the Desired preview inactive. Text/style preview ownership follows the same conservative ownership rule as Edit movement: while the DOM still equals Mesurer's owned value, undo/redo can move it to the restored Desired value; once the application changes it, Mesurer preserves the host value instead of overwriting it during history or cleanup.

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

The first-party `codex()` plugin is Mesurer's **Settings -> Codex** feature. It is not the OpenAI Mesurer Solid agent plugin.

Electron hosts with `window.__MESURER_HOST__.codexBridge(request)` can use the in-process native bridge and start Codex enabled. Browser hosts still show Codex in Settings but start with it off. When enabled, the browser plugin talks to the local Mesurer Codex Bridge companion at `127.0.0.1:47365`. If that helper is absent, the plugin stays enabled in an unavailable/retry state instead of failing with an Electron-preload requirement.

The optional local **Mesurer Codex Bridge** helper can be installed into Codex so SessionStart starts or reuses the loopback companion and registers the current local Codex session. The npm package also exposes `mesurer-codex` and `mesurer-codex-connect` for diagnostics.

Both renderer transports expose the same `codex:v1` service. Shared sessions queue through Codex's local app-server. Exact Desktop-current-thread delivery can use one durable Codex queue operation plus the native `codex://threads/<id>` wake. The private app-tools pipe is never opened.

Browser companion state and the native Electron bridge are local-machine transports only. Neither is a hosted Mesurer relay, and neither changes how coding agents consume `window.__MESURER__`.

## Revalidate after source edits

After HMR or reload settles:

```js
await window.__MESURER__.stable()
```

Then compare the same evidence retained before editing:

- Edit movement Desired against Live through `reviewArrange()`;
- text/style Desired against Live with the text preview inactive;
- saved annotations through `review()`;
- current selections and measurements through fresh `context()`;
- exact geometry through `inspect()`, `distance()`, and `viewport()`.

Do not clear human history merely to expose Live state, and do not reinject just to refresh context.

## Completion rule

A meaningful Mesurer call should affect the work. If exact geometry is available, use it instead of estimating pixels from a screenshot. If the user already encoded intent in Edit movement, text editing, annotations, or selection, consume it before asking them to repeat it.

The repository's packaged [`mesurer-ui` skill](./skills/mesurer-ui/SKILL.md) carries the operational version of this contract for coding agents. [Browser and agent integration](../../docs/BROWSER_HARNESS.md) documents the browser-control boundary.
