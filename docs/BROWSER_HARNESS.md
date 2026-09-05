# Browser and agent integration

Mesurer uses the browser control an agent already has. It does not create a second browser, RPC server, CDP stack, or message-delivery layer.

```text
human reviewer
    ↕
Mesurer in the real page
    ↕
window.__MESURER__
    ↕
existing browser evaluate / screenshot
    ↕
coding agent
```

## Reuse before injecting

A live Mesurer instance may already contain selection, guides, measurements, annotations, Arrange intent, text/style intent, plugin state, or screenshot review state. Preserve it.

```js
const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (hasMesurer) {
  await browser.evaluate(() => window.__MESURER__.ready())
}
```

If the instance exists, use it. Inject only when it is absent.

The bundled payload is published at `mesurer-solid/inject-script`:

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

if (!hasMesurer) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

Injection defaults to `reuseExisting: true`. Deliberate replacement requires `window.__MESURER_CONFIG__ = { reuseExisting: false }` and should be reserved for explicit test/HMR scenarios.

Normal agent injection does not enable the human Screenshot plugin. Configure `{ screenshot: true }` before first injection only when that camera workflow is needed.

## Capabilities

After `ready()`:

```js
const { capabilities } = window.__MESURER__.capabilities()
```

Context-oriented methods include:

```text
context()
select()
annotations()
review()
capturePlan()
textEdits()
textEdit()
```

Arrange adds:

```text
arrangements()
arrange()
showArrange()
arrangeCapturePlan()
reviewArrange()
```

There is no Send-to-agent capability. Copy Context and Copy Selection are human clipboard actions; agents read the API directly. The optional Screenshot plugin is also not a delivery protocol.

## Read human intent before source edits

For a broad request such as “check Mesurer,” inventory all relevant channels before changing selection or source:

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

Resolve relevant annotation, Arrange, and text-edit records before HMR can replace DOM targets. Treat annotation notes, Arrange Desired geometry, and text/style Desired state as human intent. Treat measurements and computed inspection as rendered evidence.

If the exact rendered target is known and there is no human selection to preserve:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one target. Missing or ambiguous selectors throw instead of guessing.

## Multi-selection

Inspect every selected target, not just the first target or a count. Preserve the full target inspection and relevant pair relationships.

Use existing `selection.visualContext.distances` first. For a pair without useful distance evidence:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, keep useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs rather than producing mechanical O(n²) noise.

## Text-edit intent

The harness should normally read saved text intent instead of automating the editor UI unless Mesurer itself is under test.

Human entry is double-click/double-tap while Select or Typography is active. Content that inherits native `contenteditable` stays with the page/browser; a nested `contenteditable="false"` boundary ends that inheritance.

Saved intent is read through `textEdits()` and `textEdit(id)`. When Typography was already selected before editing, the direct-edit session still presents only one live Typography card.

Verification must use Live source, not Mesurer's own Desired preview. If the application changes text or styles itself, Mesurer relinquishes preview ownership and preserves the host value.

See [Direct text editing and Typography](./TEXT_EDITING.md).

## Arrange intent

When Arrange intent exists, retain Before and Desired before source changes. Desired describes the visual result, not the CSS implementation.

After editing source:

```js
await window.__MESURER__.stable()
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Live removes the temporary Arrange preview before measuring the application result. Arrange also preserves host-authored transform changes: cleanup restores an old transform only while the current value and priority still match Mesurer's owned preview.

See [Arrange](./ARRANGE.md).

## Revalidation

After normal HMR or reload settles:

```js
await window.__MESURER__.stable()
```

Then compare the same evidence captured before editing:

- Arrange intent against Live with the Arrange preview removed;
- text/style Desired intent against Live with the text preview inactive;
- annotations through `review(annotationId)`;
- selection/measurements through fresh context;
- exact target geometry through `inspect()` / `distance()` / `viewport()`.

Do not clear human history merely to expose Live state.

## Screenshot boundaries

Agent evidence and the human Screenshot plugin are separate paths.

For agent/harness evidence, Mesurer plans clean presentation while the outer harness owns screenshot bytes:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // outer harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ scope: "selection" }` for unsaved selection evidence. Mesurer hides control chrome while preserving the rendered evidence that belongs in the capture.

The optional `mesurer-solid/screenshot` plugin is a person-facing camera tool with region capture, output preferences, thumbnail preview, and viewer. See [Screenshots](./SCREENSHOTS.md).

## Low-level API

Useful focused methods include:

```text
ready()
stable()
capabilities()
context()
select()
annotations()
textEdits()
textEdit()
review()
capturePlan()
prepareCapture()
finishCapture()
inspect()
inspectAll()
at()
distance()
viewport()
feedback()
describe()
command()
state()
```

Use context and saved intent for human-in-the-loop work. Use focused methods for focused measurement questions.

## Browser boundaries

Normal browser security still applies. Top-level JavaScript cannot inspect cross-origin iframe DOM, and closed shadow roots remain inaccessible. Frame or privileged-target injection depends on the outer harness; Mesurer does not duplicate those capabilities.

The repository's Playwright adapters are deterministic reference/test drivers, not the Mesurer agent protocol.
