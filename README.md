# Mesurer Solid

Framework-agnostic UI measurement, inspection, annotation, and visual-validation tooling for browser applications and coding agents.

Mesurer Solid is a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by Julien Thibeaut (`@ibelick`). The Solid renderer is a private implementation detail: host applications can be Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderers.

## What Mesurer is for

Mesurer gives humans and coding agents the same browser-visible evidence:

- Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings;
- exact DOM geometry, box model, typography, layout, scrolling, and overflow;
- optional human annotations and scoped `MesurerContextV1` through `contextPlugin()`;
- deterministic before/current review after HMR or source edits;
- clean screenshot planning that hides Mesurer controls while keeping visual evidence;
- a JSON-safe `window.__MESURER__` browser API for existing harnesses;
- one portable Agent Skill instead of per-harness integration packages;
- ACP-ready text/image content mapping plus universal Copy Context fallback;
- a composable plugin/runtime architecture.

Mesurer does **not** own source editing, dev servers, browser navigation, clicks/typing, browser lifetime, screenshots, authentication, or an ACP process/session. Those stay with the application or outer agent/browser harness.

## Mesurer in action

Mesurer runs as an isolated inspection layer over real applications, including complex stacking, modal/top-layer UI, strict Trusted Types pages, and Electron renderer pages.

<p align="center">
  <img src="docs/assets/showcase/youtube.png" alt="Mesurer Solid inspecting a public YouTube search page" width="100%">
</p>

<table>
  <tr>
    <td><img src="docs/assets/showcase/github.png" alt="Mesurer Solid inspecting GitHub" width="100%"></td>
    <td><img src="docs/assets/showcase/google-maps.png" alt="Mesurer Solid inspecting Google Maps" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>GitHub</sub></td>
    <td align="center"><sub>Google Maps</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/showcase/reddit.png" alt="Mesurer Solid inspecting Reddit" width="100%"></td>
    <td><img src="docs/assets/showcase/google-search.png" alt="Mesurer Solid inspecting Google Search" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><sub>Reddit</sub></td>
    <td align="center"><sub>Google Search</sub></td>
  </tr>
</table>

### Electron renderer

<p align="center">
  <img src="docs/assets/showcase/electron-solid.jpg" alt="Mesurer Solid running over a packaged Electron application with a Solid 1 renderer" width="100%">
</p>

<sub>Mesurer running over a packaged Electron application with a Solid 1 renderer.</sub>

## Install in an app

During beta:

```bash
bun add -d @jhomra21/mesurer-solid@beta
# or
npm install -D @jhomra21/mesurer-solid@beta
```

Mount the base inspector from browser/client code:

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer();
```

Mesurer mounts into an isolated ShadowRoot by default and carries its own Solid 2 runtime.

### Add the context/annotation extension

The human/agent context workflow is a normal removable plugin rather than special renderer behavior:

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
});
```

`mesurer.context` provides the `context:v1` service and owns its annotation state, UI, shortcuts, review/capture behavior, and cleanup. Removing it removes the feature while leaving the rest of Mesurer running:

```ts
mesurer.pluginHost?.remove("mesurer.context");
console.log(mesurer.agent.capabilities().capabilities.context); // false
```

See [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## Use on any website: browser extension

The first-party Manifest V3 extension is the recommended zero-source-change path for arbitrary Chromium pages.

During repository/beta development:

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

The extension packages the same self-contained `inject-script` artifact used by coding-agent/browser harnesses. Injection installs `contextPlugin()` by default, so the extension is a distribution shell around the same plugin/runtime rather than a second Mesurer implementation.

See [`extension/README.md`](./extension/README.md).

### No-extension fallback

The DevTools Snippet workflow remains available when an extension cannot be installed. Build/read `@jhomra21/mesurer-solid/inject-script`, save it as a Chromium DevTools Snippet, and run it in the current page.

## Human annotations and Copy Context

With the context plugin installed, use Select to target one or more page elements **or drag an arbitrary region**, then choose **Add note**. Element notes retain conservative DOM identity plus a visual baseline; region-only notes retain the selected viewport rectangle even when no element sits inside it.

The toolbar supports:

- **Copy context** — meaningful whole workspace;
- **Copy selection** — current target/region plus related evidence;
- **Add note** — persist human intent on a target or region;
- annotation **Copy context** — only that note/scope and relevant visual evidence;
- **Send to agent** only when `contextPlugin()` was configured with a sender callback.

The context buttons are normal plugin contributions rendered by the same canonical draggable top-toolbar button component as built-ins. Shortcuts are `C`, `Shift+C`, `N`, and optional `Cmd/Ctrl+Enter` for Send Selection.

Context relevance is deterministic: Mesurer includes guides that touch/cross the scope, measurements that reference/overlap it, and held distances involving/overlapping it. Scoped context exposes the requested rectangles in `regions`.

```ts
const all = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const note = await mesurer.context({ annotation: annotationId });
await mesurer.copyContext({ annotation: annotationId });
```

The mounted convenience methods resolve the plugin's `context:v1` service. If the plugin is removed or never installed, context methods report that the plugin is unavailable instead of running a hidden fallback implementation.

## Human-in-the-loop agent workflow

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

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })

// after editing/HMR
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotationId)
```

Annotations keep the exact DOM node while it remains connected. After replacement, Mesurer only rebinds when strong identity or a unique compatible weaker fingerprint proves the target. Ambiguous or incompatible replacements are reported stale rather than silently attaching the note to another element.

Review compares by stable annotation target IDs rather than regenerated selectors. Relevant targets/guides/measurements/distances that disappear are reported explicitly as `kind: "missing"`.

## Clean screenshot evidence

Mesurer does not fake screenshots with DOM-to-canvas rendering. The context plugin prepares the real page for the screenshot primitive already owned by Playwright, CDP, Electron, another coding-agent browser tool, etc.

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

The focused crop includes scoped `regions` as well as relevant element/measurement/distance evidence, so an element-free whitespace/alignment annotation still gets a close-up. Capture mode hides toolbar/settings/comment/action chrome but preserves useful evidence such as rulers, guides, measurements, distances, pixel labels, selections, and annotation markers.

## One portable Agent Skill

Mesurer does not ship OpenCode/Pi/Cursor/Codex-specific packages.

Install the single canonical Agent Skill into the current repository:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

This transient install leaves a self-contained skill:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

Harnesses that support the Agent Skills convention can discover the same workflow and evaluate the included injector through the browser/evaluation channel they already own. The npm package does not need to remain installed in application source after the skill installer exits.

This repository dogfoods the same skill under `.agents/skills/mesurer-ui/`.

## Inject into an existing agent/browser harness

Default host-project mutation budget is zero. If the harness can already execute page JavaScript, reuse it. With an installed Agent Skill, evaluate `.agents/skills/mesurer-ui/assets/inject-script.js`. If the package itself is already installed, `/inject-script` is the equivalent distribution path:

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

`/inject` and `/inject-script` install the context plugin by default. A harness that deliberately wants only the low-level inspector can set this before injection:

```js
window.__MESURER_CONFIG__ = { context: false };
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

When `mesurer.context` is loaded, the same bridge exposes:

```text
capabilities()
context()/contextText()
annotations()
review()
capturePlan()
prepareCapture()/finishCapture()
sendContext()  // when the plugin was configured with a sender
```

Root-scoped agents keep `at()` consistent with `inspect()`/`inspectAll()`: a document-level hit-test fallback is discarded unless the hit element belongs to that configured root.

See [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md).

## ACP

ACP is the standardized direct-delivery target, but Mesurer does not own an ACP process or choose a session.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The ACP client/harness that already owns the target session performs capability negotiation and sends those content blocks through its normal session prompt flow. If images are unsupported, send the text block only.

The universal fallback remains `contextText()` / **Copy context**.

## App integration and optional direct handoff

Screenshot and send capabilities are options of the context plugin, not core mount behavior:

```ts
const mesurer = mountMeasurer({
  agent: true,
  plugins: [
    contextPlugin({
      evidenceProvider: async ({ context, plan }) => {
        // Return real browser screenshots from the owning host/harness.
        return [];
      },
      sendContext: async ({ context, text, images }) => {
        // Hand these to the ACP client/session already owned by the host.
      },
    }),
  ],
});
```

Without `sendContext`, the plugin omits the Send control.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

Plugins can contribute tools, commands, hooks, overlays, settings, scoped state, services, history/persistence, lifecycle cleanup, and renderer-owned UI through the opaque runtime service. Built-ins can be excluded/replaced without forking the renderer.

Programmatic built-in commands use one controller owned by the renderer instance; toolbar clicks and human shortcuts converge on that same path. Commands do not depend on toolbar labels, `.click()`, or synthetic window keyboard events.

The context workflow follows the same plugin model: `contextPlugin()` is loaded, removed, and replaced through `pluginHost` and provides its public behavior through `context:v1`.

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

`bun run build` builds the public package and then writes an unpacked MV3 extension to `extension/dist/`. The package build also smoke-installs the portable Agent Skill into a temporary project and verifies its embedded injector matches the exact built `inject-script` bytes.

Compatibility, package-smoke, visual-parity, and interaction workflows remain regression gates. Agent-session/ACP ownership flows should additionally be exercised locally with the actual harnesses because CI cannot meaningfully stand in for a user's live local coding-agent/browser session.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for package boundaries and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) for the human/agent context model.

## License and upstream

MIT. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution and adapted-source notices.
