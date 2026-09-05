# Mesurer agent integration

Mesurer's agent integration is the rendered page itself. The coding agent reads `window.__MESURER__` through the browser control it already has, consumes human visual intent, edits normal application source, and verifies the real Live result.

There is no Mesurer MCP server, localhost daemon, Send-to-agent callback, or harness-specific transport.

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
    └── inject-script.js
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

Read durable intent through:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

Treat `intent.desired` and style deltas as visual/source requirements, not inline CSS instructions. Look for the application's semantic props, classes, design tokens, CSS variables, theme values, or stylesheet rules that produce the requested render.

Verification must use Live source with the Desired preview inactive. Text/style preview ownership follows the same conservative rule as Arrange: while the DOM still equals Mesurer's owned value, undo/redo can move it to the restored Desired value; once the application changes it, Mesurer preserves the host value instead of overwriting it during history or cleanup.

See [Direct text editing and Typography](../../docs/TEXT_EDITING.md).

## Annotation and context review

A saved annotation carries target-bound intent and an immutable baseline:

```js
const context = await window.__MESURER__.context({ annotation: annotationId })
```

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

The optional `mesurer-solid/screenshot` plugin is a separate human camera workflow. It is not an agent delivery capability. Preserve an existing human preview unless the task is specifically about Screenshot behavior.

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
