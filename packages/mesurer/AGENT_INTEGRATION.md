# Mesurer agent integration

Mesurer uses standards and a browser contract instead of harness-specific integrations.

```text
Agent Skill            window.__MESURER__             ACP
how/when to use it     visual context + validation    standardized delivery
       \                       |                       /
        \______________________|______________________/
                               |
                         any capable harness
```

There is no required OpenCode, Pi, Cursor, Codex, or other Mesurer adapter package.

## Install the portable Agent Skill

The npm package ships one canonical `mesurer-ui` Agent Skill. Install it into the current repository's standard `.agents/skills` directory with:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

Use `--force` only when intentionally replacing an existing local copy.

The skill teaches agents to load Mesurer for frontend visual work, consume human annotations before editing, and revalidate the rendered result after HMR instead of treating typecheck/build success as visual completion.

## Default browser integration: inject, do not redesign the harness

**Default host-project mutation budget: zero.** If the existing browser, Electron, WebView, or automation harness can execute JavaScript in the target renderer, reuse that channel:

```text
existing harness
  → existing page / renderer
  → evaluate @jhomra21/mesurer-solid/inject-script
  → window.__MESURER__
```

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(
  fileURLToPath(import.meta.resolve("@jhomra21/mesurer-solid/inject-script")),
  "utf8",
);

await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

Do not create another Chromium instance, another CDP connection, a Mesurer-specific server, a special application build, or source changes merely to inspect an app that the harness can already evaluate.

## Discover the browser contract

```js
window.__MESURER__?.capabilities()
```

The v1 bridge reports `mesurer.agent/v1` and exposes the original inspection API plus context/review methods.

### Human-in-the-loop context

```js
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
await window.__MESURER__.context({ scope: "selection" })
await window.__MESURER__.context()
await window.__MESURER__.contextText({ annotation: annotationId })
```

`context()` combines the human's selected target and note with exact DOM inspection and the relevant Mesurer evidence touching that scope: guides, measurements, and held distances. It intentionally excludes transient hover/drag state.

### Revalidate after edits

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

Annotations store a durable selector/fingerprint baseline. After ordinary HMR DOM replacement, Mesurer only rebinds when the selector resolves to exactly one fingerprint-compatible target. Ambiguous or missing targets are reported as stale instead of being silently rebound.

`review()` returns the annotation baseline, current scoped context, target status, and measurable before/current changes.

### Clean screenshots

The outer harness continues to own real browser screenshots. Mesurer only defines the evidence frame:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot: current viewport
  // optional close-up: plan.captures.find(c => c.id === "focus")
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides Mesurer controls such as toolbars, settings, comment editors, and action panels while preserving evidence such as rulers, guides, selection/annotation markers, measurements, distance overlays, and pixel labels.

Use screenshots together with structured context. Screenshots are strong visual evidence; Mesurer's geometry is stronger evidence for exact spacing/alignment claims.

## ACP delivery

Mesurer does not own an ACP process or session. The ACP client/harness that already owns the session sends Mesurer's output.

The package exports a pure mapping helper:

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one text content block plus optional image content blocks. The calling ACP client is responsible for session selection, capability negotiation, and `session/prompt`.

This keeps Mesurer independent of every individual agent implementation.

## Existing low-level API

The original JSON-safe primitives remain useful for specific questions:

```js
window.__MESURER__.inspect(".selector")
window.__MESURER__.inspectAll(".selector")
window.__MESURER__.at(x, y)
window.__MESURER__.distance(".a", ".b")
window.__MESURER__.viewport()
await window.__MESURER__.feedback([".selector"])
await window.__MESURER__.state()
await window.__MESURER__.stable()
```

Prefer scoped `context()` and `review()` for normal human-in-the-loop visual development; use the low-level primitives when an agent needs to answer a narrower measurement question.

## Ownership boundary

Mesurer owns visual inspection, annotations, context formatting, capture planning, review baselines, plugin state, and its in-page UI.

The outer harness owns navigation, clicks, typing, screenshots, tabs/windows, authentication, browser lifetime, source editing, dev servers, and ACP session/process ownership.
