# Browser and agent integration

Mesurer uses the browser control a coding agent already has. It does not create a second browser, CDP stack, RPC server, or message-delivery layer.

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

The self-contained payload is published at `mesurer-solid/inject-script`:

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

Injection defaults to `reuseExisting: true`. Deliberate replacement with `{ reuseExisting: false }` is for explicit test or HMR scenarios, not normal agent attachment.

Normal injection does not enable the human Screenshot plugin. Configure `{ screenshot: true }` before first injection only when that camera workflow is needed.

## Capability surface

After `ready()`:

```js
const { capabilities } = window.__MESURER__.capabilities()
```

Common context methods include:

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

There is no Send-to-agent capability. Copy Context and Copy Selection are human clipboard actions; agents read the page API directly.

## Read before editing

For a broad request such as “check Mesurer,” preserve the current human state before changing selection or source. That can include Context, annotations, Arrange Before/Desired geometry, direct text/style intent, guides, measurements, rulers/X-ray state, and screenshot review state.

If the exact rendered targets are known and no human selection needs preserving:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one target. Missing or ambiguous selectors fail rather than silently choosing another element.

See [Context](./CONTEXT_WORKFLOW.md) for the full target and intent ordering.

## Verify the real page

After source changes or HMR:

```js
await window.__MESURER__.stable()
```

Then compare the same evidence captured before editing:

- Arrange against Live with its temporary preview removed;
- text/style intent against Live with the Desired preview inactive;
- annotations through `review(annotationId)`;
- selection and measurements through fresh context;
- focused geometry through `inspect()`, `distance()`, or `viewport()`.

Do not clear human history merely to expose Live state.

Feature-specific ownership and review rules live in [Arrange](./ARRANGE.md) and [Direct text editing and Typography](./TEXT_EDITING.md); the harness should consume those contracts rather than reimplementing them.

## Multi-selection

Inspect every selected target and preserve the relationships that matter between them. Use existing `selection.visualContext.distances` first; call `distance(a, b)` for a needed pair when the selection lacks useful evidence.

For small selections, keep useful unique pair relationships. For large selections, focus on adjacent, repeated, or user-relevant pairs rather than generating O(n²) noise.

## Screenshot evidence

For agent evidence, Mesurer prepares the page while the existing harness owns screenshot bytes:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // outer harness screenshot
} finally {
  await window.__MESURER__.finishCapture()
}
```

Use `{ scope: "selection" }` for unsaved selection evidence.

The optional `mesurer-solid/screenshot` plugin is a separate person-facing camera tool. See [Screenshots](./SCREENSHOTS.md).

## Focused API

Useful low-level methods include:

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

Use Context and saved intent for human-in-the-loop work. Use the focused methods for focused measurement questions.

## Browser boundaries

Normal browser security still applies. Top-level JavaScript cannot inspect cross-origin iframe DOM, and closed shadow roots remain inaccessible. Frame or privileged-target injection depends on the outer harness; Mesurer does not duplicate those capabilities.

The repository's Playwright adapters are deterministic reference/test drivers, not a separate Mesurer agent protocol.
