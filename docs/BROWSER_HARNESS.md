# Browser and agent integration

Mesurer sits **on top of whatever browser control the agent already has**. It does not own Chromium, duplicate navigation/click/screenshot tools, run a Mesurer RPC server, or inject messages into an agent conversation.

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

## Primary rule: discover before injecting

A person may already have a live Mesurer instance with selections, guides, measurements, held distances, rulers/X-ray state, or annotations. That state must survive agent attachment.

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

## Direct context capability contract

Injected usage installs `mesurer.context` by default.

After `ready()`:

```js
const capabilities = window.__MESURER__.capabilities()
```

The context capability surface is:

```text
context
annotations
review
capturePlan
```

There is no `send`, `screenshots`, or `sendContext` delivery capability. The visible context UI is exactly Copy Context, Copy Selection, and Add Note. Copy is a human clipboard convenience; agents read the API directly.

## Shared visual context API

Read the broad workspace:

```js
const workspace = await window.__MESURER__.context()
```

Try the human's current selection:

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Read saved annotations:

```js
const annotations = await window.__MESURER__.annotations()
const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

This gives structured data for the state the human can see: exact targets, selection regions, guides, measurements, held distances, rulers/X-ray state, box model, typography, layout, appearance, and overflow.

A harness gathers this state **before source edits** so unsaved selection identity is not lost across DOM replacement.

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

If the human saved an annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

If the human only selected/measured the workspace, re-read `context()` and use original selectors with focused primitives:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

For multi-selection, check the same target dimensions and pair relationships captured before editing.

The agent already has before and after values in its current task. No external delivery protocol is necessary.

## Screenshot boundary

Mesurer plans evidence; the outer harness owns screenshots:

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

Capture preparation hides control chrome while preserving rulers, guides, selected outlines, annotations, measurements, held distances, and pixel labels.

Use Mesurer geometry for exact numeric claims and screenshots for composition/appearance.

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
annotations()
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

Use `context()`/`review()` for human-in-the-loop work. Use low-level methods for focused measurement questions.

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
  → read human state
  → edit/relaunch as normal
  → remeasure rendered result
```

## Optional Playwright reference adapter

The repository retains a Playwright adapter for manual testing and CI. It is **not the agent integration API**; it is a deterministic reference/test driver.

## CI proof

Host compatibility guards both positive and negative parts of the direct contract:

1. inject Mesurer;
2. prove context/annotations/review/capture-plan capabilities exist;
3. prove `sendContext`, send/delivery capability bits, and the old Send tool do not exist;
4. prove Copy Context, Copy Selection, and Add Note each render once in the isolated toolbar;
5. store live plugin/human-like state;
6. evaluate the injector again;
7. prove the exact same mounted instance, agent object, and state remain;
8. prove only one Mesurer island exists;
9. set `reuseExisting: false` and prove deliberate replacement still works.

Browser contracts separately self-host Mesurer and exercise multi-selection spacing.

## Browser boundaries

Normal browser security boundaries still apply. A top-level page cannot inspect cross-origin iframe DOM through normal page JavaScript, and closed shadow roots remain inaccessible.

Whether a specific agent can inject into frames or privileged targets depends on that agent's browser transport. Mesurer should not duplicate those capabilities.
