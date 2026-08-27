# Browser and agent integration

Mesurer sits **on top of whatever browser control the agent already has**. It does not need to own Chromium, duplicate navigation/click/screenshot tools, run a Mesurer RPC server, or inject messages into an agent conversation.

The direct integration is the page itself:

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
| Proposed solution adds MCP/server/browser/CDP plumbing just for Mesurer | **Do not do that by default** |

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

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

## Injection replacement contract

Injection now defaults to preserving a matching live injected instance:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: true, // default
}
```

This prevents an agent from accidentally destroying human review state.

Deliberate deterministic replacement remains available:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: false,
}
```

Use replacement only for explicit HMR/test/tooling scenarios. It should not be part of the normal human-to-agent workflow.

The first-party extension still owns its explicit toggle behavior: clicking the extension action disposes the existing extension instance before toggling off. Agent discovery should not simulate that toggle when it merely wants to read the current state.

## Shared visual context API

After `ready()`, the context plugin is installed by default for injected usage.

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

This gives the agent structured data for the state the human can see: exact targets, selection regions, guides, measurements, held distances, rulers/X-ray state, box model, typography, layout, appearance, and overflow.

A typical harness should gather that state **before source edits** so unsaved selection identity is not lost across DOM replacement.

## Revalidation loop

After the agent edits source and the normal page/HMR updates:

```js
await window.__MESURER__.stable()
```

If the human saved an annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

If the human only selected/measured the workspace, re-read `context()` and use original selectors with focused primitives when needed:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
```

The agent already has the before and after values in its current task. No external delivery protocol is necessary.

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

The repository retains a Playwright adapter for manual testing and CI:

```bash
bun run build
bun run browser:harness -- https://example.com
```

It can attach to existing Chromium for manual testing. This adapter is **not the agent integration API**. It is a deterministic reference/test driver.

## CI proof

Host compatibility includes a real browser regression that:

1. injects Mesurer;
2. stores live plugin/human-like state;
3. evaluates the injector again;
4. proves the exact same mounted instance, agent object, and state remain;
5. proves only one Mesurer island exists;
6. sets `reuseExisting: false` and proves deliberate replacement still works.

This guards the most important direct-harness invariant: **agent attachment must not destroy human visual context**.

## Browser boundaries

Normal browser security boundaries still apply. A top-level page cannot inspect cross-origin iframe DOM through normal page JavaScript, and closed shadow roots remain inaccessible.

Whether a specific agent can inject into frames or privileged targets depends on that agent's browser transport. Mesurer should not duplicate those capabilities.
