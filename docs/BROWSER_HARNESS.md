# Browser and agent integration

Mesurer Solid is designed to sit **on top of whatever browser control the agent already has**. It does not need to own Chromium, duplicate navigation/click/screenshot tools, or run a Mesurer-specific RPC server.

## Primary architecture

```text
Codex / Claude Code / Droid / Pi / OpenCode / other harness
                         │
                 existing browser tool
                         │
          existing Chrome / Electron / tab
                         │
              evaluate Mesurer payload
                         │
                window.__MESURER__
```

The outer harness remains responsible for:

- selecting/attaching to tabs
- navigation
- authentication/session state
- clicking, typing, keyboard input
- screenshots
- browser process lifetime
- CDP or other browser transport

Mesurer is responsible for measurement, inspection, and its own UI/commands.

## Default rule: reuse the harness, mutate nothing

**Default host-project mutation budget: zero.** If the outer harness can already execute JavaScript in the target renderer, use that capability and inject Mesurer. Do not edit target source, bundler config, package scripts, Electron main/preload code, or produce a Mesurer-specific build merely to inspect the UI.

Use this decision table:

| Situation | Mesurer workflow |
| --- | --- |
| Harness already has browser JavaScript execution | **Inject `/inject-script`** |
| Existing CDP reaches the renderer | **Attach with the existing harness + inject** |
| Ordinary packaged app can be launched with CDP | **Launch the same artifact + inject** |
| User explicitly wants Mesurer on every development launch | Source mounting may be appropriate |
| No renderer evaluation path exists | Explain the limitation, then consider source integration |
| Proposed solution adds a new browser/CDP stack or special Mesurer build | **Do not do that by default** |

For packaged apps, the artifact-faithful path is the ordinary package plus an existing attach/evaluate channel. Starting that same executable with a remote-debugging option changes the launch mode, not the packaged artifact. Prefer this over compiling Mesurer into a separate inspection build.

An app that is already running without CDP or another renderer-evaluation mechanism may not be attachable after the fact. That is a transport limitation, not a reason to automatically modify the application.

## Transport-neutral injection payload

The npm package publishes:

```text
@jhomra21/mesurer-solid/inject-script
```

`inject-script.js` is a self-contained classic JavaScript/IIFE payload. It contains Mesurer's private Solid 2 renderer and has no runtime import of the host framework. It is deliberately built without ESM syntax or top-level await so a browser tool can execute its text directly.

A Node-based agent adapter can resolve/read the payload without importing it:

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const url = import.meta.resolve("@jhomra21/mesurer-solid/inject-script");
const source = await readFile(fileURLToPath(url), "utf8");

await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

The exact names of `browser.evaluate`, `browser_execute`, `Runtime.evaluate`, etc. belong to the outer harness. Mesurer does not wrap or replace them.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

## In-page API

After evaluation, the default global is:

```js
window.__MESURER__
```

Important methods:

```text
ready()
stable(frames?)
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

A typical agent loop is:

```js
await browser.evaluate(`window.__MESURER__.stable()`);
const measurements = await browser.evaluate(`
  window.__MESURER__.feedback(["header", "main", "button"])
`);
const screenshot = await browser.screenshot();
```

Use Mesurer for geometry instead of estimating geometry from screenshots.

## Configuration before injection

An outer harness can set configuration before evaluating the payload:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__MESURER__",
  target: "body",
};
```

Re-evaluating the payload is deterministic: the previous injected Mesurer instance is disposed before the new one mounts.

## Existing browser/CDP sessions

If an agent already knows how to connect to a browser on a port such as `http://127.0.0.1:9222`, use that existing facility. Do not launch the reference Playwright harness too.

This also applies to Electron renderer debugging endpoints. Mesurer needs a browser-like `window`/`document`; it does not care whether those come from Chrome, Chromium, Electron, or another Chromium-based shell.

For an Electron packaged-app check, the preferred sequence is:

```text
package normally
  → launch that exact packaged executable with the project's existing CDP/debug path
  → verify Mesurer is not already present
  → attach the existing harness
  → evaluate @jhomra21/mesurer-solid/inject-script
  → await window.__MESURER__.ready()
  → inspect the real renderer
```

## Optional Playwright reference adapter

The repository retains a small Playwright adapter for manual testing and CI:

```bash
bun run build
bun run browser:harness -- https://example.com
```

It can attach to an existing Chromium endpoint for manual testing:

```bash
bun run browser:harness -- \
  --cdp http://127.0.0.1:9222 \
  --list-pages

bun run browser:harness -- \
  --cdp http://127.0.0.1:9222 \
  --page 1
```

This adapter is **not the agent integration API**. It exists as a reference implementation and deterministic test driver. Playwright remains a repository dev dependency and is not added to the public package's runtime dependencies.

## CI proof

Package smoke intentionally uses Playwright because CI needs a deterministic browser. The important part of the test is that the packed npm `inject-script.js` is read as text and passed to `page.evaluate(source)` in a React application that does not import Mesurer. That models the same primitive an existing coding-agent browser tool provides.

## Browser boundaries

Normal browser security boundaries still apply. A top-level page cannot inspect inside cross-origin iframes through normal DOM APIs, and closed shadow roots remain inaccessible to page JavaScript. Browser-internal privileged URLs are outside Mesurer's scope.

Whether a particular agent can bypass page CSP, inject into individual frames, or attach to privileged targets depends on that agent's browser transport. Mesurer itself should not duplicate those browser-specific capabilities.
