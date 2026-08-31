# Mesurer agent integration

Mesurer uses standards and a browser contract instead of harness-specific integrations.

```text
Agent Skill          window.__MESURER__        host/browser bridge        ACP / Codex app-server
how/when to use it   context + validation      capability-only callback   session/thread routing
       \                    |                          |                         /
        \___________________|__________________________|________________________/
                                             |
                                       capable harness
```

There is no required OpenCode, Pi, Cursor, Codex, or other Mesurer transport package. Mesurer produces structured visual context and evidence; the outer host owns browser automation, transport connections, credentials, and conversation routing.

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

## Optional WebMCP tools

If the browser exposes the draft [`document.modelContext`](https://webmachinelearning.github.io/webmcp/) API, injection also installs the removable `mesurer.webmcp` plugin. It shares a retained feedback bus with `mesurer.context` and registers these tools:

```text
mesurer.feedback.wait
mesurer.context.get
mesurer.annotations.list
mesurer.review
mesurer.capture.prepare
mesurer.capture.finish
```

The important flow is agent-initiated: a browser agent calls `mesurer.feedback.wait`, the page keeps that tool execution pending, and a human presses Send in Mesurer. The pending call then resolves with a `MesurerFeedbackEvent` in the same agent tool flow. Use `afterId` or `afterSequence` to replay retained events, and call again after a timeout using the returned `lastSequence`.

The feedback bus is append-only and bounded. Cancellation removes a waiter without deleting the event log. Events include context, text, capture planning, and evidence metadata. They do not contain screenshot bytes; the outer harness remains responsible for native screenshot capture. `capture.prepare` and `capture.finish` only change Mesurer presentation and should be paired with `try/finally` in the harness.

WebMCP does not give page JavaScript a Codex thread id, ACP session id, credential, or conversation-routing handle. It also cannot start a new Codex turn after the agent has finished. For hosts that own those values, use the capability-only `mesurer.host/v1` bridge and the ACP/App Server adapters below. If WebMCP is unavailable, the context API and host bridge remain usable without registering these tools.

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

For a source-mounted browser that supports WebMCP, pass one bus to both plugins:

```ts
import {
  contextPlugin,
  createMesurerFeedbackBus,
  mountMeasurer,
  webMcpPlugin,
} from "mesurer-solid";

const feedbackBus = createMesurerFeedbackBus();
mountMeasurer({
  agent: true,
  plugins: [contextPlugin({ feedbackBus }), webMcpPlugin({ feedbackBus })],
});
```

A source-mounted host that already owns its transport can pass callbacks directly:

```ts
contextPlugin({
  evidenceProvider: async ({ context, plan }) => [],
  sendContext: async ({ context, text, images }) => {
    // Route through the session/thread already owned by this host.
  },
})
```

Remove the complete extension through the normal plugin host:

```ts
mesurer.pluginHost?.remove("mesurer.context");
```

The context UI, annotation runtime, shortcuts, service, and listeners are disposed together.

## Injected page → host bridge

An injected page does not automatically inherit the coding client's current ACP session or Codex thread. The host must expose a narrow callback capability before evaluating Mesurer.

The classic injector recognizes this versioned capability object:

```ts
window.__MESURER_HOST__ = {
  protocol: "mesurer.host/v1",
  captureEvidence: async ({ context, plan }) => [],
  sendContext: async ({ context, text, images }) => {},
};
```

Only the callbacks cross into the page. Keep session IDs, thread IDs, credentials, auth state, approval handling, and transport clients in the outer host.

For a browser harness with an expose-binding primitive, the pattern is:

```ts
await page.exposeBinding("__mesurerSendContext", async (_source, delivery) => {
  await sendContext(delivery);
});

await page.exposeBinding("__mesurerCaptureEvidence", async (_source, input) => {
  return captureEvidence(input);
});

await page.evaluate(() => {
  window.__MESURER_HOST__ = {
    protocol: "mesurer.host/v1",
    sendContext: (delivery) => window.__mesurerSendContext(delivery),
    captureEvidence: (input) => window.__mesurerCaptureEvidence(input),
  };
});

await page.evaluate(injectSource);
```

A direct `context` plugin option wins over the host bridge when both provide the same callback. This keeps explicit source-mounted configuration deterministic.

Treat direct-send bindings as privileged capabilities. Only expose them to pages/origins you trust, and validate incoming delivery objects in the host before forwarding them into an agent conversation. The page still never needs the underlying ACP/Codex credentials or conversation identifiers.

## ACP delivery adapter

ACP `session/prompt` accepts text and image content blocks directly, including base64 image data. The public host-only `/delivery` entrypoint turns a `MesurerContextDelivery` into that request while resolving the current session at send time:

```ts
import { createAcpContextSender } from "mesurer-solid/delivery";

const sendContext = createAcpContextSender({
  target: () => ({ sessionId: currentAcpSession.id }),
  prompt: ({ sessionId, prompt }) =>
    acpClient.request("session/prompt", { sessionId, prompt }),
});
```

Pass that `sendContext` behind the browser bridge above, or directly to `contextPlugin()` in a source-mounted host. Mesurer does not initialize, authenticate, create, resume, or select the ACP session.

The lower-level formatter remains available when a host wants to manage the request itself:

```ts
import { toAcpContentBlocks } from "mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

## Codex App Server delivery adapter

Codex App Server owns durable threads and in-flight turns. Its user input wire format is not ACP: screenshots must be supplied as an image URL or a host-local image path.

```ts
import { createCodexAppServerContextSender } from "mesurer-solid/delivery";

const sendContext = createCodexAppServerContextSender({
  target: () => ({
    threadId: currentCodexThread.id,
    activeTurnId: currentCodexTurn?.status === "inProgress"
      ? currentCodexTurn.id
      : null,
  }),
  request: ({ method, params }) => appServer.request(method, params),
  imageInput: async (image) => ({
    type: "localImage",
    path: await writeTemporaryEvidenceFile(image),
  }),
});
```

When the target has no active turn, Mesurer produces a `turn/start` request. When the host reports an active turn, it produces `turn/steer` with `expectedTurnId` so context enters that same in-flight task instead of starting a competing turn.

The host owns temporary image-file/URL materialization and cleanup. If `imageInput` is omitted or returns `null`, delivery remains valid and falls back to text-only context.

This adapter does not start `codex app-server`, initialize/authenticate it, discover a Codex thread, or expose the thread id to the page. The Codex client that already owns the conversation supplies those pieces.

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

The base Mesurer runtime owns measurement, inspection, plugin composition, and the low-level browser API. `mesurer.context` owns annotations, context formatting/capture/review behavior, and its UI. The page-to-host bridge owns only callable capabilities. The outer harness owns navigation, clicks, typing, screenshots, tabs/windows, authentication, browser lifetime, source editing, dev servers, ACP/Codex clients, credentials, session/thread selection, approvals, and conversation routing.
