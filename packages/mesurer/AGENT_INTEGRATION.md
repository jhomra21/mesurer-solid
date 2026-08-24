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

The npm package ships one canonical `mesurer-ui` Agent Skill:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

Use `--force` only when intentionally replacing an existing local copy. The install is self-contained: it writes the skill plus the exact packaged classic injector to:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches agents to use Mesurer for frontend visual work, consume human annotations before editing, and revalidate the rendered result after HMR instead of treating typecheck/build success as visual completion.

## Default browser integration: inject

**Default host-project mutation budget: zero.** If the existing browser, Electron, WebView, or automation harness can execute JavaScript in the target renderer, reuse that channel.

When the Agent Skill is installed, read `.agents/skills/mesurer-ui/assets/inject-script.js` and evaluate those bytes in the page. No project dependency is required after the transient installer exits.

When `mesurer-solid` is already installed as a project/tooling dependency, the equivalent package path is the `/inject-script` export:

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
);

await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

Both routes evaluate the same built injector artifact. The injection entry points install the removable `mesurer.context` plugin by default. A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false };
```

Do not create another Chromium instance, another CDP connection, a Mesurer-specific server, a special application build, or source changes merely to inspect an app that the harness can already evaluate.

## Discover the browser contract

Wait for plugin setup before reading dynamic capabilities:

```js
if (window.__MESURER__) {
  await window.__MESURER__.ready()
  window.__MESURER__.capabilities()
}
```

`capabilities().capabilities.context` reflects whether the `context:v1` plugin service is currently present. Removing `mesurer.context` switches the context/review/capture capabilities off dynamically while the original inspection API keeps working.

### Human-in-the-loop context

With the plugin loaded:

```js
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
await window.__MESURER__.context({ scope: "selection" })
await window.__MESURER__.context()
await window.__MESURER__.contextText({ annotation: annotationId })
```

`context()` combines the human's selected elements or dragged region and note with exact DOM inspection and relevant guides, measurements, and held distances. Scoped contexts expose their requested viewport rectangles in `regions`, so a region-only note remains useful even when no DOM element sits inside it. Transient hover/drag state is excluded.

### Revalidate after edits

```js
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

Annotations retain exact live DOM identity while the original node remains connected. After DOM replacement/HMR, rebinding is deliberately conservative: strong IDs are preferred, and weaker fingerprints must resolve uniquely. Ambiguous or incompatible replacements are reported stale instead of silently attaching the note to another element.

`review()` matches targets by stable annotation target IDs rather than regenerated selectors. Relevant baseline evidence that genuinely disappears is reported with `kind: "missing"` instead of being silently omitted.

### Clean screenshots

The outer harness owns real browser screenshots. The context plugin defines the evidence frame:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // harness screenshot: current viewport
  // close-up when present: plan.captures.find(c => c.id === "focus")
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture planning includes the scoped `regions`, so an arbitrary whitespace/alignment annotation can still produce a focused close-up. Capture mode hides toolbars, settings, comment editors, and action panels while preserving rulers, guides, selection/annotation markers, measurements, distance overlays, and pixel labels.

Use screenshots together with structured context. Screenshots are strong visual evidence; Mesurer geometry is stronger evidence for exact spacing/alignment claims.

## Source-mounted integrations

When Mesurer is mounted from application code, explicitly install the same plugin:

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "mesurer-solid";

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
});
```

Browser/harness delivery capabilities are plugin options:

```ts
contextPlugin({
  evidenceProvider: async ({ context, plan }) => [],
  sendContext: async ({ context, text, images }) => {
    // Send using the ACP session already owned by the host.
  },
})
```

Remove the complete extension through the normal plugin host:

```ts
mesurer.pluginHost?.remove("mesurer.context");
```

The context UI, annotation runtime, shortcuts, service, and listeners are disposed together.

## ACP delivery

Mesurer does not own an ACP process or session. The ACP client/harness that already owns the session sends Mesurer output.

```ts
import { toAcpContentBlocks } from "mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one context text block plus optional labeled image blocks. The calling ACP client is responsible for session selection, capability negotiation, and `session/prompt`.

## Existing low-level API

These JSON-safe primitives remain available whether or not `mesurer.context` is loaded:

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

When an agent is mounted with a scoped root, `inspect`, `inspectAll`, `distance`, and `at` all respect that root. A document-level hit test is never returned by `at()` unless the hit element belongs to the configured root.

Prefer scoped `context()` and `review()` for normal human-in-the-loop visual development when the context plugin is available; use the low-level primitives for narrower measurement questions.

## Ownership boundary

The base Mesurer runtime owns measurement, inspection, plugin composition, and the low-level browser API. `mesurer.context` owns annotations, context formatting/capture/review behavior, and its UI. The outer harness owns navigation, clicks, typing, screenshots, tabs/windows, authentication, browser lifetime, source editing, dev servers, and ACP session/process ownership.
