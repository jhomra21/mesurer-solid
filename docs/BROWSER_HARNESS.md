# Browser and agent integration

Mesurer sits **on top of whatever browser control the agent already has**. It does not own Chromium, duplicate the harness's navigation/click/task-screenshot tools, run a Mesurer RPC server, or inject messages into an agent conversation.

The integration is the page itself:

```text
human reviewer
    ↕
Mesurer UI in the real page
    ↕ shared visual state
window.__MESURER__
    ↕ browser evaluate / screenshot
Codex / Claude / Cursor / Droid / Pi / OpenCode / other harness
```

The outer harness already knows which task/conversation it belongs to. Mesurer does not need that identity.

Mesurer also has an optional first-party **human screenshot plugin**. That camera tool is distinct from the outer harness's task screenshot primitive; see [Screenshot capture](./SCREENSHOTS.md).

Direct text editing is another page-native human-intent path. It uses the same mounted renderer and exposes saved text/style Desired intent through `window.__MESURER__`; see [`TEXT_EDITING.md`](./TEXT_EDITING.md).

## Primary rule: discover before injecting

A person may already have a live Mesurer instance with selections, guides, measurements, held distances, rulers/X-ray state, annotations, Arrange intents, saved text/style edits, or a screenshot thumbnail/viewer. That state must survive agent attachment.

Before evaluating an injector:

```js
const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (hasMesurer) {
  await browser.evaluate(() => window.__MESURER__.ready())
}
```

If `hasMesurer` is true, use that exact instance. Do not reinject or dispose it.

If Mesurer is absent, inject through the JavaScript-evaluation channel the harness already owns.

## Default rule: reuse the harness, mutate nothing

**Default host-project mutation budget: zero.** Do not edit target source, bundler config, package scripts, Electron main/preload code, or create a special Mesurer build merely to inspect the UI.

| Situation | Mesurer workflow |
| --- | --- |
| Mesurer already exists in the page | **Reuse it; read `window.__MESURER__` directly** |
| Harness already has browser JavaScript execution | **Inject `/inject-script` only if absent** |
| Existing CDP reaches the renderer | **Attach existing harness + inject only if absent** |
| Ordinary packaged app can be launched with CDP | **Launch same artifact + attach + inject only if absent** |
| User explicitly wants Mesurer on every dev launch | Source mounting may be appropriate |
| No renderer evaluation path exists | Explain the limitation, then consider source integration |
| Proposed solution adds MCP/server/browser/CDP plumbing just for Mesurer | **Do not do that** |

An app already running without CDP or another renderer-evaluation mechanism may not be attachable after the fact. That is a browser-transport limitation, not a reason to invent a Mesurer transport.

## Transport-neutral injection payload

The npm package publishes:

```text
mesurer-solid/inject-script
```

`inject-script.js` is a self-contained classic JavaScript/IIFE payload containing Mesurer's private Solid 2 renderer. A Node/Bun-side harness can read it without importing it into application source:

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

const alreadyPresent = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (!alreadyPresent) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

The exact names of `browser.evaluate`, `browser_execute`, `Runtime.evaluate`, etc. belong to the outer harness.

Normal injection keeps the optional screenshot camera disabled. When a task explicitly needs it, configure the first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

The first-party Chrome extension sets the equivalent option automatically. Do not reinject over a live instance merely to change this option; preserve the person's current state and use the plugin host deliberately if the feature must be added to an already-mounted instance.

## Injection replacement contract

Injection defaults to preserving the canonical live injected instance:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: true, // default
}
```

When `globalThis.__MESURER_INSTANCE__?.element.isConnected` is true, evaluating the injector again reuses that instance instead of destroying human review state.

Deliberate replacement remains available:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: false,
}
```

Use replacement only for explicit HMR/test/tooling scenarios. It is not part of the normal human-to-agent workflow.

The first-party extension still owns its explicit toggle behavior. Agent discovery should not simulate that toggle when it merely wants to read current state.

## Direct capability contract

Injected usage installs `mesurer.context` by default.

After `ready()`:

```js
const capabilities = window.__MESURER__.capabilities()
```

The context capability surface is:

```text
context
select
annotations
review
capturePlan
```

When direct text editing is available, capabilities also reports:

```text
textEdit
```

and the harness can read:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(editId)
```

When Arrange is mounted, `arrange` adds its intent/presentation/review methods too.

`select` is a programmatic agent/harness operation, not another human toolbar action. There is no `send`, `screenshots`, or `sendContext` **delivery capability**. The visible context UI remains exactly Copy Context, Copy Selection, and Add Note. Copy is a human clipboard convenience; agents read the API directly.

Direct text editing likewise does not add a competing top-level Text Edit tool. Human entry is double-click/double-tap while Select or Text Inspector is active. The optional `mesurer.screenshot` plugin does not change the delivery contract either; it contributes a camera tool and typed plugin service rather than a JSON-safe agent delivery capability.

## Shared visual context API

A broad Mesurer request should inventory all human-intent channels before narrowing:

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

Read saved annotations:

```js
const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

Resolve relevant Arrange/text-edit records too:

```js
const arrangeIntents = await Promise.all(
  arrangements.map((intent) => window.__MESURER__.arrange(intent.id)),
)
const textEditIntents = await Promise.all(
  textEdits.map((intent) => window.__MESURER__.textEdit(intent.id)),
)
```

This gives structured data for the state the human can see and the Desired state they saved: exact targets, selection regions, guides, measurements, held distances, rulers/X-ray state, box model, typography, layout, appearance, overflow, Arrange geometry, and text/style intent.

A harness gathers this state **before source edits** so unsaved selection identity and saved intent targets are not lost across DOM replacement.

When there is no relevant human selection and the harness knows the exact rendered targets it changed, select them directly:

```js
const changedContext = await window.__MESURER__.select([
  selectorA,
  selectorB,
])
```

`select()` requires each selector to resolve to exactly one target, visibly highlights those targets using Mesurer's normal Select state, and returns selection-scoped `MesurerContextV1`. If target identity is genuinely ambiguous, ask the user to select the intended element(s) or region instead of guessing.

## Direct text-edit interaction in a browser harness

The harness should normally **read** saved text intent rather than automate the editor UI unless the task is testing Mesurer itself. For Mesurer's own browser contract, the interaction is intentionally exercised through the real page:

```text
activate Arrange/Select
  → select rendered target
  → double-click ordinary direct text through Arrange surface
  → textarea opens with full text selected
  → Mesurer-style formatting toolbar appears
  → automatic Text Inspector card appears for the same field
  → change page-derived typography/color or B/I/U/custom color
  → Enter commits Desired intent
```

While the editor has focus, normal typed shortcut letters must not activate Mesurer tools.

The automatic Text Inspector card is transient presentation, not a separate agent API. Durable agent evidence is `textEdit(id)` plus the target's ordinary rendered context.

## Multi-selection harness behavior

When `selection.targets` contains multiple elements, return every target's complete inspection rather than only the first target or a count.

Then recover spatial relationships. Use existing `selection.visualContext.distances` first. For a selected pair without relevant distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For a small selection, all useful unique pair relationships should be available to the agent. For large sets, focus on adjacent/repeated/user-relevant pairs instead of mechanically producing O(n²) noise.

This is the standard human-to-agent read contract for selections involving several controls/components.

## Revalidation loop

After the agent edits source and the normal page/HMR updates:

```js
await window.__MESURER__.stable()
```

If a relevant Arrange intent exists, switch it to Live and use `reviewArrange()` so the temporary Desired transform cannot make unfinished source look correct.

If a relevant text-edit intent exists, preserve that intent but deactivate the Select/Text Inspector preview before comparing the target's real text/computed typography with Desired. Do not clear text history merely to expose Live.

If the human saved an annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

If a still-relevant human selection exists, re-read it. If the agent knows the exact affected targets, leave them visibly selected and get fresh scoped context in one operation:

```js
const current = await window.__MESURER__.select(changedSelectors)
```

For focused primitives:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

For multi-selection, check the same target dimensions and pair relationships captured before editing.

The agent already has before and after values in its current task. No external delivery protocol is necessary.

## Screenshot boundaries

There are two screenshot paths and they must remain distinct.

### Agent/harness evidence

For ordinary coding-agent verification, Mesurer plans clean evidence while the outer harness owns the actual screenshot bytes:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // real harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ scope: "selection" }` when validating an unsaved selection.

Capture preparation hides control chrome while preserving rulers, guides, selected outlines, annotations, measurements, held distances, and pixel labels. Active editor controls and the transient automatic Text Inspector card are inspector chrome, not application evidence.

This lets the existing harness control browser viewport, timing, artifact storage, and comparison while Mesurer supplies exact scope and presentation.

### Human screenshot plugin

The optional `mesurer-solid/screenshot` entry provides `screenshotPlugin()`. It adds an in-page camera tool for a person to drag a viewport region, capture a real HiDPI-aware PNG, optionally copy/download it, keep a draggable thumbnail, and open a Copy/Save viewer.

Normal browser hosts use `getDisplayMedia()` for that plugin. The first-party Chrome extension enables the plugin automatically and routes capture through `chrome.tabs.captureVisibleTab()` via an isolated-world bridge, avoiding the screen-share chooser for the extension path.

Advanced mounted integrations can resolve the typed screenshot service under plugin service id `screenshot`; that service is not part of `window.__MESURER__`'s context capability list.

See [`SCREENSHOTS.md`](./SCREENSHOTS.md) for the complete capture/output/preview contract.

Use Mesurer geometry for exact numeric claims and screenshots from either path for composition/appearance. Do not estimate geometry from pixels when Mesurer reports the exact value.

## Low-level in-page API

The default global is:

```js
window.__MESURER__
```

Important methods include:

```text
ready()
stable(frames?)
capabilities()
context(request?)
select(selectorOrSelectors)
annotations()
textEdits()
textEdit(id)
review(annotationId?)
capturePlan(request?)
prepareCapture()
finishCapture()
inspect(selector, index?)
inspectAll(selector, limit?)
at(x, y)
distance(a, b)
viewport()
feedback(selectors?)
describe()
command(id, args?)
state()
```

When Arrange is available, add `arrangements()`, `arrange(id)`, `showArrange()`, `arrangeCapturePlan()`, and `reviewArrange()` to that task's relevant surface.

Use `context()` / `select()` / annotation review plus Arrange/text intent for human-in-the-loop work. Use low-level methods for focused measurement questions.

## Existing browser/CDP sessions

If an agent already knows how to connect to a browser endpoint, reuse that connection. Do not launch the repository's reference Playwright harness too.

This also applies to Electron renderer debugging endpoints. Mesurer needs a browser-like `window`/`document`; it does not care whether those come from Chrome, Chromium, Electron, or another shell.

For a packaged-app check:

```text
package normally
  → launch exact artifact through project's existing debug path
  → attach existing harness
  → discover existing Mesurer
  → inject only if absent
  → read all relevant human state/intent
  → edit/relaunch as normal
  → verify real Live rendered result
```

## Optional Playwright reference adapter

The repository retains a Playwright adapter for manual testing and CI. It is **not the agent integration API**; it is a deterministic reference/test driver.

## CI proof

Host compatibility guards both positive and negative parts of the direct contract:

1. inject Mesurer;
2. prove context/select/annotations/review/capture-plan capabilities exist;
3. prove the direct `textEdit` capability and public `textEdits()` / `textEdit()` agent surface exist when expected;
4. use `select()` against real page targets and prove it returns selection-scoped context while creating the same live Select state the user sees;
5. prove missing and ambiguous selectors fail instead of guessing;
6. prove `sendContext`, send/delivery capability bits, and the old Send tool do not exist;
7. prove Copy Context, Copy Selection, and Add Note each render once in the isolated toolbar;
8. store live plugin/selection state;
9. evaluate the injector again;
10. prove the exact same mounted instance, agent object, selection, and state remain;
11. prove only one Mesurer island exists;
12. set `reuseExisting: false` and prove deliberate replacement still works.

Rendered browser contracts separately self-host Mesurer and exercise multi-selection spacing. The direct-text contract exercises editing through active Arrange/Select state, full-text selection, the canonical Mesurer-style formatting toolbar, automatic/live Text Inspector information, page-derived typography/color controls, B/I/U, custom color, commit/cancel semantics, reversible Desired/Live state, cleanup, and clean browser diagnostics.

The dedicated screenshot contract exercises screenshot-plugin activation, region selection/cropping, capture-chrome hiding/restoration, cancellation, persistent preview/viewer behavior, and the deterministic capture-provider path. Package guards require the public `./screenshot` export and declarations in the exact staged npm package and separately protect the `textEdit` capability/method declarations.

## Browser boundaries

Normal browser security boundaries still apply. A top-level page cannot inspect cross-origin iframe DOM through normal page JavaScript, and closed shadow roots remain inaccessible.

Whether a specific agent can inject into frames or privileged targets depends on that agent's browser transport. Mesurer should not duplicate those capabilities.