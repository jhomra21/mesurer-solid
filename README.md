# Mesurer Solid

Framework-agnostic UI measurement, inspection, annotation, and visual-validation tooling for browser applications and coding agents.

Mesurer Solid is a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by Julien Thibeaut (`@ibelick`). The Solid renderer is private implementation detail: host applications can be Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderers.

## What Mesurer is for

Mesurer gives humans and coding agents the same browser-visible evidence:

- Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings;
- exact DOM geometry, box model, typography, layout, scrolling, and overflow;
- human notes anchored to selected page elements;
- scoped `MesurerContextV1` for a workspace, current selection, or one annotation;
- deterministic before/current review after HMR or source edits;
- clean screenshot planning that hides Mesurer controls while keeping visual evidence;
- a JSON-safe `window.__MESURER__` browser API for existing harnesses;
- one portable Agent Skill instead of per-harness integration packages;
- ACP-ready text/image content mapping plus universal Copy Context fallback;
- a composable plugin/runtime architecture.

Mesurer does **not** own source editing, dev servers, browser navigation, clicks/typing, browser lifetime, screenshots, authentication, or an ACP process/session. Those stay with the application or outer agent/browser harness.

## Install in an app

During beta:

```bash
bun add -d @jhomra21/mesurer-solid@beta
# or
npm install -D @jhomra21/mesurer-solid@beta
```

Mount from browser/client code:

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer();
```

For Vite development only:

```ts
if (import.meta.env.DEV) {
  import("@jhomra21/mesurer-solid").then(({ mountMeasurer }) => {
    const mesurer = mountMeasurer();
    import.meta.hot?.dispose(() => mesurer.dispose());
  });
}
```

Mesurer mounts into an isolated ShadowRoot by default and carries its own Solid 2 runtime.

## Use on any website: browser extension

The first-party Manifest V3 extension is the recommended zero-source-change path for arbitrary Chromium pages.

During repository/beta development, build and load it unpacked:

```bash
bun install
bun run build
```

Then:

1. Open Chrome/Edge extensions and enable Developer mode.
2. Choose **Load unpacked**.
3. Select `extension/dist/`.
4. Visit an ordinary `http:` or `https:` page.
5. Click the Mesurer extension action to toggle Mesurer on/off.

The extension requests only `activeTab` and `scripting`; it does not request persistent access to every website. Browser-protected pages such as `chrome://` pages cannot be injected.

The extension packages the same self-contained `inject-script` artifact used by coding-agent/browser harnesses. It is not a second implementation.

See [`extension/README.md`](./extension/README.md).

### No-extension fallback

The existing DevTools Snippet workflow remains available when an extension cannot be installed. Build/read `@jhomra21/mesurer-solid/inject-script`, save it as a Chromium DevTools Snippet, and run it in the current page. This is now the fallback rather than the recommended arbitrary-site UX.

## Human annotations and Copy Context

Use Select to target one or more page elements, then choose **Add note**. The note is anchored to durable selector/fingerprint metadata and records a visual baseline.

The context action surface supports:

- **Copy context** — meaningful whole workspace;
- **Copy selection** — current target + related evidence;
- **Add note** — persist human intent on a target;
- annotation **Copy context** — only that note/target and relevant visual evidence;
- **Send to agent** only when the host explicitly supplies a sender callback.

Context relevance is deliberately simple: Mesurer includes guides that touch/cross the scope, measurements that reference/overlap it, and held distances involving/overlapping it. No model is used to guess relevance.

Programmatically:

```ts
const all = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const note = await mesurer.context({ annotation: annotationId });

await mesurer.copyContext({ annotation: annotationId });
```

The same API is available through `window.__MESURER__` when the agent bridge/injector is enabled.

## Human-in-the-loop agent workflow

The intended development loop is:

```text
human selects / measures / comments
             ↓
agent reads Mesurer context
             ↓
agent edits normal project source
             ↓
dev server / HMR updates the real page
             ↓
agent waits for Mesurer stability
             ↓
Mesurer rebinds + remeasures annotation
             ↓
agent reviews numeric + screenshot evidence
             ↓
iterate or hand back to human
```

Agent-facing examples:

```js
window.__MESURER__.capabilities()
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })

// after editing/HMR
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

Annotations conservatively rebind after DOM replacement only when their selector resolves to exactly one fingerprint-compatible target. Ambiguous/missing targets are reported stale rather than silently attached to another element.

See [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## Clean screenshot evidence

Mesurer does not fake screenshots with DOM-to-canvas rendering. It prepares the real page for the screenshot primitive already owned by Playwright, CDP, Electron, another coding-agent browser tool, etc.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })

await window.__MESURER__.prepareCapture()
try {
  // Capture the real current viewport.
  // If plan contains `focus`, also capture/crop that rectangle.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides toolbar/settings/comment/action chrome but preserves useful evidence such as rulers, guides, measurements, distances, pixel labels, selections, and annotation markers.

A capture plan always requests the current viewport and may include a close-up rect built from the relevant evidence—not just the selected element box.

## One portable Agent Skill

Mesurer does not ship OpenCode/Pi/Cursor/etc. packages.

Install the single canonical Agent Skill into the current repository:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

This writes:

```text
.agents/skills/mesurer-ui/SKILL.md
```

Harnesses that support the Agent Skills convention can discover the same workflow. The skill teaches agents to use Mesurer for visual frontend work and to revalidate the rendered result after edits before claiming completion.

This repository dogfoods the same skill under `.agents/skills/mesurer-ui/`.

## Inject into an existing agent/browser harness

Default host-project mutation budget is zero. If the harness can already execute page JavaScript, reuse it:

```text
existing browser / renderer
        ↓
evaluate @jhomra21/mesurer-solid/inject-script
        ↓
window.__MESURER__
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

Do not add another browser/CDP stack, Mesurer server, alternate app build, or project source integration merely to inspect a renderer the harness already controls.

### Browser API

Existing primitives remain:

```text
ready()/stable()
inspect()/inspectAll()/at()
distance()
viewport()
feedback()
describe()
command()
state()
```

Human/agent context adds:

```text
capabilities()
context()/contextText()
annotations()
review()
capturePlan()
prepareCapture()/finishCapture()
sendContext()  // only when a host supplied a sender
```

See [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md).

## ACP

ACP is the one standardized direct-delivery target, but Mesurer does not own an ACP process or choose a session.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The ACP client/harness that already owns the target session performs capability negotiation and sends those content blocks through its normal session prompt flow. If images are unsupported, send the text block only.

The universal fallback remains `contextText()` / **Copy context**.

## App integration and optional direct handoff

A source-mounted host may provide its own screenshot and send callbacks without teaching Mesurer about a specific agent:

```ts
const mesurer = mountMeasurer({
  agent: true,
  evidenceProvider: async ({ context, plan }) => {
    // Return real browser screenshots from the owning host/harness.
    return [];
  },
  sendContext: async ({ context, text, images }) => {
    // Hand these to the ACP client/session already owned by the host.
  },
});
```

When `sendContext` exists, the visible context UI can show **Send to agent**. Without it, Mesurer remains fully useful through Copy Context and the browser API.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

Plugins can contribute tools, commands, hooks, overlays, settings, scoped state, services, history/persistence, and disposal. Built-ins can be excluded/replaced without forking the renderer.

Renderer-aware extensions should request the opaque `runtime:solid` service rather than import private renderer workspaces.

## Public package surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

Only `@jhomra21/mesurer-solid` is published. Private core/DOM/renderer workspaces are bundled and must not leak into public JS/declaration artifacts.

## Repository development

Bun is the workspace package manager.

```bash
bun install
bun run typecheck
bun run test
bun run build
```

`bun run build` builds the public package and then writes an unpacked MV3 extension to `extension/dist/`.

Existing compatibility, package-smoke, visual-parity, and interaction workflows remain regression gates. Agent-session/ACP ownership flows should additionally be exercised locally with the actual harnesses because CI cannot meaningfully stand in for a user's live local coding-agent/browser session.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for package boundaries and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) for the human/agent context model.

## License and upstream

MIT. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution and adapted-source notices.
