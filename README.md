# Mesurer Solid

A framework-agnostic UI measurement, inspection, annotation, and extension layer for browser applications and coding agents, built as a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer Solid is implemented with Solid 2 internally, but that renderer/runtime is bundled into an isolated browser island. Host applications do **not** need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

Mesurer is useful in four related ways:

1. **Interactive devtool** — interactive selection, measurements, guides, rulers, text inspection, X-ray, color picking, distances, settings, history, and persistence.
2. **Human/agent visual context** — optional annotations, arbitrary-region feedback, scoped context, deterministic review, and clean screenshot planning through the removable `mesurer.context` plugin.
3. **Agent feedback API** — exact, JSON-safe DOM geometry and computed-style data that coding agents can read through the browser tool they already use.
4. **Composable runtime** — built-ins and third-party extensions share one plugin host, so tools can be added, removed, replaced, or driven by stable commands at runtime.

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

## Capabilities at a glance

| Capability | What Mesurer provides |
| --- | --- |
| Framework-independent mounting | `mountMeasurer()` works in browser DOM hosts without sharing the host framework runtime. |
| Isolated UI | ShadowRoot isolation plus a protected host layer so application CSS/stacking is not allowed to casually hide the inspector. |
| Browser top-layer mounting | Modern browsers promote the Mesurer host into a manual popover, escaping ordinary stacking contexts and ancestor clipping. |
| Visual inspection tools | Select, X-ray, color picker, rulers, text inspector, guides, distance overlay, and settings. |
| Human annotations | Element or arbitrary-region notes with conservative HMR rebinding and immutable scoped baselines. |
| Scoped visual context | `MesurerContextV1` combines intent with inspected targets, regions, relevant guides, measurements, distances, and visual state. |
| Deterministic revalidation | `review()` compares fresh rendered evidence to an annotation baseline and reports changed or missing evidence. |
| Clean screenshot planning | Viewport plus optional focus capture plans; Mesurer chrome can be hidden while visual evidence remains. |
| Exact element inspection | Rect, margin, padding, border, typography, appearance, layout, scroll size, and overflow state. |
| Geometry comparison | Horizontal/vertical gaps and center deltas between elements. |
| Viewport diagnostics | Viewport/document dimensions, DPR, scroll position, and page overflow signals. |
| Agent iteration snapshots | `feedback()` combines requested element measurements, viewport state, loaded capabilities, and plugin state. |
| Stable command surface | Agents and extensions can execute built-in or plugin commands without simulating toolbar clicks or keyboard events. |
| Runtime extensions | Plugins can register tools, commands, hooks, overlays, settings contributions, state, services, and disposal logic. |
| Canonical plugin toolbar | Plugin tools render through the same toolbar button/tooltip path as built-ins rather than a second injected toolbar implementation. |
| Hot replacement | Plugins can be loaded, removed, or replaced while the mounted instance is alive. Built-in slots can be replaced while retaining stable `builtin.*` command names and shortcuts. |
| History and persistence | Plugin state slices can opt into undo/redo history and browser persistence. Mesurer settings/workspace state can also persist. |
| Arbitrary-site extension | A thin first-party Manifest V3 extension injects the same built runtime without modifying website source. |
| Portable Agent Skill | One self-contained `mesurer-ui` Agent Skill teaches compatible harnesses the workflow and includes the exact classic injector. |
| Transport-neutral injection | The same self-contained classic script can be evaluated by an existing browser harness without requiring Playwright or a second CDP connection. |
| Deterministic reinjection | Injecting again disposes the previous injected instance before mounting the new one. |

## The rendered page is the source of truth

For agent-driven UI work, Mesurer is intended to stay in the development loop rather than appear only at final QA.

A source file saying `gap: 16px`, `align-items: center`, or `width: 100%` does **not** prove that the rendered page has the intended spacing, alignment, dimensions, or overflow. Fonts, intrinsic sizing, parent layout, transforms, breakpoints, wrapping, and neighboring components can all change the actual result.

The default design loop is:

```text
human request / Mesurer annotation
  → agent reads scoped rendered context
  → agent edits the implementation
  → real app renders / HMR settles
  → __MESURER__.stable()
  → __MESURER__.review(annotationId) and/or feedback(...)
  → outer harness takes real screenshots when useful
  → agent compares exact measurements + pixels to the request
  → agent fixes discrepancies
  → repeat until the rendered result supports the claim
```

Use Mesurer to validate statements such as “these edges align,” “the gap is 16 px,” “all buttons are the same height,” “there is no horizontal overflow,” or “this heading is actually using the intended font.” Use screenshots to judge composition, hierarchy, balance, clipping, and the things that remain visual rather than numeric.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) for the practical agent workflow and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) for the annotation/context model.

## What Mesurer deliberately does not own

Mesurer is **not** a browser driver or an agent orchestration server. It does not own navigation, clicking, typing, screenshots, tabs, authentication, browser lifetime, source editing, dev servers, or an ACP process/session. Those responsibilities stay with Playwright, Chrome DevTools Protocol, Cypress, a coding-agent browser tool, Electron, or whatever outer harness already controls the page.

That separation is intentional: Mesurer measures, annotates, and exposes visual state; the outer harness interacts with the browser and edits the project.

## Install

During the prerelease period:

```bash
npm install -D mesurer-solid@beta
```

Or with Bun:

```bash
bun add -d mesurer-solid@beta
```

> **Package rename:** prereleases through `0.1.0-beta.11` were published as `@jhomra21/mesurer-solid`. New releases use the canonical unscoped package name `mesurer-solid`. The runtime API is unchanged; update dependency and import specifiers to the new package name.

## Choose how you want to use Mesurer

| Goal | Recommended path |
| --- | --- |
| Inspect a website you are developing | Install the package and call `mountMeasurer()` in browser/client code. |
| Add human annotations/context to an embedded inspector | Mount with `plugins: [contextPlugin()]`. |
| Inspect any Chromium website manually | Use the first-party extension; keep the DevTools Snippet as the no-extension fallback. |
| Use Mesurer from a coding agent | Install the portable Agent Skill or reuse the package `/inject-script`, then evaluate it through the harness's existing browser channel. |
| Use Mesurer from Playwright, CDP, Cypress, Electron, or another harness | Reuse the harness that already owns the page/renderer and inject. |
| Deliver context directly to an agent | Use the ACP session already owned by the host; Mesurer maps context/images to ACP content blocks. |
| Build or replace Mesurer tools | Use the public `/core` plugin/runtime API. |

The same runtime powers all of these paths. Humans use the visible toolbar directly; agents and automation use the JSON-safe bridge, scoped context, and stable commands.

## Quick start — use Mesurer in your own website

If you are already running your app with `npm run dev`, `bun run dev`, Vite, Next, Astro, or another browser development server, mount Mesurer from your client-side code:

```ts
import { mountMeasurer } from "mesurer-solid";

const mesurer = mountMeasurer();
```

Then:

1. Start your app normally, for example with `npm run dev`.
2. Open the app in your browser.
3. Mesurer appears as an isolated floating inspection layer over the page.
4. Use the toolbar to select, measure, inspect text, show rulers/guides, X-ray the DOM, pick colors, and inspect distances.

Common shortcuts include `M` to toggle Mesurer, `S` for Select, `A` for Text Inspector, `G` for Guides, `R` for Rulers, `X` for X-ray, `P` for Color Picker, and `Alt` for distance inspection.

If Mesurer should exist only during local Vite development, a client entry module can load it conditionally:

```ts
if (import.meta.env.DEV) {
  import("mesurer-solid").then(({ mountMeasurer }) => {
    const mesurer = mountMeasurer();
    import.meta.hot?.dispose(() => mesurer.dispose());
  });
}
```

The host application does not need Solid 2. Mesurer carries its own isolated renderer/runtime.

### Add annotations and agent context as a plugin

The human/agent context workflow is a normal removable extension:

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

`mesurer.context` provides the `context:v1` service and owns annotation state, Copy Context/Copy Selection/Add Note tools, shortcuts, review/capture behavior, optional delivery callbacks, and cleanup. The actions appear in the existing draggable toolbar because plugin tools use the same canonical button renderer as built-ins.

```ts
const workspace = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const annotation = await mesurer.context({ annotation: annotationId });
await mesurer.copyContext({ annotation: annotationId });
```

A selection can contain DOM elements or only a dragged visual region. Scoped contexts expose their requested viewport rectangles in `regions`, so feedback such as “this whitespace is too large” remains useful even when no DOM element is the right target.

After a source edit/HMR cycle:

```ts
const review = await mesurer.review(annotationId);
```

Review uses stable annotation target IDs, conservative target rebinding, like-for-like scoped evidence, and explicit `kind: "missing"` changes when relevant evidence disappears.

Remove the complete feature through the same plugin host used by every extension:

```ts
mesurer.pluginHost?.remove("mesurer.context");
console.log(mesurer.agent.capabilities().capabilities.context); // false
```

## Quick start — use Mesurer on any website

### Recommended: first-party browser extension

The first-party Manifest V3 extension is the easiest zero-source-change path for arbitrary Chromium pages. During repository/beta development:

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

The extension requests `activeTab` and `scripting`, not persistent access to every website. Browser-protected pages such as `chrome://` pages cannot be injected.

The extension is only a distribution shell: its build copies the exact public `inject-script` artifact, which mounts the same runtime and `mesurer.context` plugin used everywhere else. See [`extension/README.md`](./extension/README.md).

### No-extension fallback: DevTools Snippet

You can still save the published self-contained `inject-script` as a DevTools Snippet once and run it on whatever page you are inspecting.

In any throwaway folder, install the package and write the published injection payload to a file:

```bash
npm install mesurer-solid@beta
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; process.stdout.write(readFileSync(fileURLToPath(import.meta.resolve('mesurer-solid/inject-script')), 'utf8'))" > mesurer-snippet.js
```

Then in Chrome or Edge:

1. Open DevTools.
2. Open **Sources → Snippets**.
3. Create a snippet named `Mesurer`.
4. Paste the contents of `mesurer-snippet.js` into it and save.
5. Visit a page and run the snippet (`Cmd/Ctrl+Enter`).

Re-running the payload on the same page is safe: Mesurer disposes the previous injected instance before mounting the new one. A full page navigation/reload removes in-page injection until the extension or snippet runs again.

## Agent quick start — discover once, reuse any harness

**Using Mesurer from an agent should normally require no changes to the target application's source or build.**

Mesurer does not ship OpenCode-, Pi-, Cursor-, Codex-, or other harness-specific adapter packages. Instead it ships one Agent Skill plus one browser contract.

Install the portable skill into the current repository:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The transient installer leaves a self-contained directory:

```text
.agents/skills/mesurer-ui/
├── SKILL.md
└── assets/
    └── inject-script.js
```

The skill teaches compatible agents when to use Mesurer, to read human annotations before editing, to revalidate after HMR, and to use the harness/browser's existing screenshot primitive. The included injector is byte-for-byte the package's built `inject-script.js`, so the npm package does not need to remain installed in application source after the skill installer exits.

If the harness can execute JavaScript in the current browser page, Electron renderer, WebView, or other DOM host, reuse that path:

```text
existing harness
  → existing page / renderer
  → evaluate skill asset or mesurer-solid/inject-script
  → window.__MESURER__
```

Do **not** add Mesurer to application source, create a Mesurer-specific build, add another browser/CDP stack, or introduce project-specific browser orchestration merely to inspect the UI. Convenience source integration is optional only when the user explicitly wants Mesurer embedded or automatically present on every development launch.

If the package is already installed, resolve/read the transport-neutral entry point and evaluate it through the JavaScript-execution primitive the harness already owns:

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

Injection exposes:

```text
window.__MESURER__          JSON-safe agent API
window.__MESURER_INSTANCE__ advanced mounted instance/pluginHost access
```

After injection, wait for `ready()` **before** reading dynamic context capabilities:

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
```

Injection installs `contextPlugin()` by default. A harness that deliberately wants only the low-level inspector can set:

```js
window.__MESURER_CONFIG__ = { context: false };
```

Other injection options remain available:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__UI_MEASURE__",
  target: "#app",
  excludePlugins: ["color-picker"],
  persistKey: "my-project:mesurer",
};
```

Reinjection is deterministic: the previous injected instance is disposed before the next one mounts.

For packaged applications, prefer the **ordinary packaged artifact** plus an existing attach/evaluate channel. If that artifact can be launched with CDP enabled, launch the same artifact, attach the existing harness, and inject Mesurer. Do not compile Mesurer into a special package merely to inspect the packaged app.

| Situation | Mesurer workflow |
| --- | --- |
| Harness already has browser JavaScript execution | **Evaluate the installed skill asset or `/inject-script`** |
| Electron renderer is reachable through existing CDP | **Attach the existing harness + inject** |
| Normal packaged app can be launched with CDP | **Launch the same artifact + inject** |
| User explicitly wants Mesurer every development launch | `mountMeasurer()` may be appropriate |
| No renderer evaluation path exists | Explain the limitation, then consider source integration |
| Agent wants to create a new browser, command, or build just for Mesurer | **Don't; reuse the existing harness** |

Harnesses that specifically support ES-module script injection may use `mesurer-solid/inject` instead. `/inject-script` is the transport-neutral default for generic browser evaluation APIs.

The repository also includes a Playwright reference adapter for manual testing/CI, but it is **not** the agent integration API. Do not launch it when the outer harness already has browser execution capability. See [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md), [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md), and [`AGENTS.md`](./AGENTS.md).

## Human-in-the-loop annotation workflow

With `mesurer.context` loaded, people can select one or more elements **or drag an arbitrary region** and add a note. The note is intent; exact DOM geometry, guides, measurements, distances, visual toggles, and screenshots are evidence.

```js
await window.__MESURER__.ready()
const annotations = await window.__MESURER__.annotations()
const context = await window.__MESURER__.context({ annotation: annotations[0].id })

// agent edits normal project source, then HMR updates the page
await window.__MESURER__.stable()
const review = await window.__MESURER__.review(annotations[0].id)
```

Element annotations retain the exact live node while it remains connected. After replacement, Mesurer only rebinds when strong identity or a unique compatible weaker fingerprint proves the target. Ambiguous or incompatible replacements remain stale instead of silently moving the user's note to another element.

The annotation baseline is scoped using the same deterministic relevance rules as current context. Targets are compared by immutable annotation target ID rather than regenerated selector strings; relevant guides, measurements, distances, or targets that disappear are reported explicitly as `kind: "missing"`.

See [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## Clean screenshot evidence

Mesurer does not render a fake DOM screenshot. The outer browser/harness owns the real screenshot primitive.

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // capture the real current viewport
  // when present, also capture/crop plan.captures.find(c => c.id === "focus")
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides toolbar/settings/comment/action chrome while preserving rulers, guides, selected outlines, annotations, measurements, distances, and pixel labels. A focused crop includes scoped `regions`, so an element-free whitespace/alignment note still gets close-up evidence.

Use screenshots together with structured context: geometry is stronger for exact spacing/alignment claims; images are stronger for surrounding composition and visual judgment.

## App integration API — mount from source

Use `mountMeasurer()` when Mesurer should be embedded in a browser application or automatically present during development. This section shows its lifecycle and optional agent bridge.

```ts
import { mountMeasurer } from "mesurer-solid";

const mesurer = mountMeasurer({
  agent: true,
});

await mesurer.ready;

console.log(mesurer.agent.inspect("[data-testid='save']"));
console.log(mesurer.agent.distance("#sidebar", "main"));

// Later
mesurer.dispose();
```

`mountMeasurer()` creates an isolated ShadowRoot by default and, on browsers with Popover API support, promotes the outer host into the browser top layer so ordinary page stacking contexts and ancestor clipping cannot cover it.

The mounted instance exposes:

- `ready` — resolves after built-ins, the renderer bridge, external plugins, and persisted plugin state settle.
- `agent` — the JSON-safe measurement/command harness.
- `pluginHost` — the live extension host once created.
- `hostLayer` — reports `"top-layer"` or the fixed compatibility fallback.
- `bringToFront()` — explicitly reasserts Mesurer as the newest inspection surface when needed.
- `describe()` — current plugin/capability description.
- `dispose()` — removes the Mesurer island and associated globals/listeners.

With `contextPlugin()` loaded, the mounted instance also exposes `context()`, `contextText()`, `copyContext()`, `annotations()`, `review()`, `capturePlan()`, `prepareCapture()`, `finishCapture()`, and `sendContext()`. These convenience methods resolve the live plugin service; they are not a second context implementation.

Useful mount options include `target`, `isolate`, `shadowMode`, `topLayer`, colors, guide/ruler settings, persistence configuration, external `plugins`, `excludePlugins`, a supplied `pluginHost`, and agent bridge configuration.

See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md) for the host-page layering contract, adversarial test strategy, and explicit guarantee boundaries.

## Agent API

The default global is `window.__MESURER__`.

| Method | Purpose |
| --- | --- |
| `ready()` | Wait for the runtime/plugins and initial layout to settle. |
| `stable(frames?)` | Wait for fonts plus one or more animation frames after HMR or UI edits. |
| `inspect(selector, index?)` | Inspect one matching element. |
| `inspectAll(selector, limit?)` | Inspect multiple matching elements, default limit 50. |
| `at(x, y)` | Inspect the element under a viewport coordinate, respecting a configured agent root. |
| `distance(a, b)` | Compare two elements by gap and center deltas. |
| `viewport()` | Read viewport/document dimensions, DPR, scrolling, and overflow. |
| `feedback(selectors?)` | Get one iteration snapshot containing viewport, requested elements, plugin capabilities, and plugin state. |
| `describe()` | List loaded plugins, tools, settings, overlays, state slices, commands, hooks, and services. |
| `command(id, args?)` | Execute a built-in or extension command. |
| `state()` | Serialize all plugin-owned state. |
| `capabilities()` | Report dynamic context/review/capture/send capabilities when using the browser bridge. |
| `context(request?)` | Capture workspace, selection, or annotation-scoped visual context. |
| `contextText(request?)` | Format the same context into deterministic copy/prompt text. |
| `annotations()` | Read current human annotations. |
| `review(annotationId?)` | Compare annotation baselines against the current rendered page. |
| `capturePlan(request?)` | Describe viewport/focus screenshot evidence. |
| `prepareCapture()` / `finishCapture()` | Hide/restore Mesurer chrome around a real harness screenshot. |

An element inspection includes identity/text plus:

```text
rect
margin / padding / border
typography: font, size, weight, line height, letter spacing, alignment, color
appearance: background, border color/radius, shadow, opacity
layout: display, position, z-index, overflow, flex/grid fields, transform
scroll: client/scroll dimensions and overflow booleans
```

When an agent is configured with a scoped root, `inspect()`, `inspectAll()`, `distance()`, and `at()` all respect that root. A document-level `elementFromPoint()` fallback is discarded unless the hit element belongs to the configured root.

For meaningful UI/design changes, this loop should be the default verification step, not an optional final check:

```text
edit or interact through the outer harness
  → __MESURER__.stable()
  → __MESURER__.review(annotationId) and/or feedback([...important selectors])
  → take a real screenshot with the outer harness when useful
  → compare exact geometry + visual pixels
  → repeat
```

Prefer Mesurer's numeric geometry over estimating spacing from screenshots, and prefer the actual rendered measurement over assuming a CSS declaration produced the intended result.

## Stable built-in commands

The runtime bridge exposes these command names:

```text
builtin.select
builtin.xray
builtin.color-picker
builtin.rulers
builtin.text-inspector
builtin.guides
builtin.settings
```

Toolbar clicks, human shortcuts, and programmatic `builtin.*` commands converge on the same controller owned by that renderer instance. Programmatic commands do not depend on toolbar labels, button `.click()`, or synthetic window `keydown` events. The distance feature is an overlay capability rather than a standalone `builtin.distance` command.

## Plugins and extension composition

Plugin authors use the public core subpath:

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core";
```

A plugin can register:

```text
tools
commands
hooks
overlays
settings contributions
scoped state slices
opaque services
disposal callbacks
```

Example:

```ts
import { defineMesurerPlugin } from "mesurer-solid/core";

export const counterPlugin = defineMesurerPlugin({
  id: "example.counter",
  version: "1.0.0",
  setup(ctx) {
    ctx.state.register({
      id: "example.counter.value",
      initial: 0,
      history: true,
      persist: true,
    });

    ctx.command.register("example.counter.increment", () => {
      ctx.state.update<number>("example.counter.value", (value) => value + 1);
    });

    ctx.tool.register({
      id: "example-counter",
      label: "Counter",
      command: "example.counter.increment",
      order: 70,
    });
  },
});
```

Pass plugins at mount time:

```ts
mountMeasurer({ plugins: [counterPlugin] });
```

Or manage them dynamically through `mounted.pluginHost` after `mounted.ready`:

```ts
await mounted.ready;
await mounted.pluginHost?.load(counterPlugin);
mounted.pluginHost?.remove("example.counter");
await mounted.pluginHost?.replace(nextCounterPlugin);
```

Plugin tool contributions are rendered by the canonical `ToolbarButton` path, including icon, active/disabled, tooltip, and shortcut presentation. There is no extension-only toolbar renderer or perpetual DOM-discovery loop.

### Customize Mesurer by asking your agent

Users do not need to hand-author plugin code. A normal workflow can be:

> “Add a Mesurer plugin that checks whether these cards align to an 8 px spacing grid.”

> “Add a Mesurer tool that highlights overflowing containers.”

> “Replace X-ray with a project-specific overlay that labels our design-system components.”

> “Add a command that measures every toolbar button and reports inconsistent heights.”

The coding agent should generally implement project-specific inspection behavior as a plugin, load it through the public plugin host, and keep Mesurer core reusable.

Built-ins use the same host. You can exclude them with `excludePlugins`, or replace a built-in slot with a plugin contribution that declares the same `builtin` id. Mesurer keeps the stable shortcut and `builtin.<id>` command routing while the replacement is active.

Renderer-aware plugins can request the `runtime:solid` capability through `ctx.service.get("runtime:solid")`. That service provides owner document/window, the portal target, and a `createInspectorMount()` helper for plugin-owned UI. The service is intentionally opaque; extension code should not import private renderer workspaces.

`contextPlugin()` follows this same architecture. Removing `mesurer.context` removes its tools, annotation UI/state, observation/listeners, service, and shortcuts while the base inspector keeps running.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) for practical extension ideas, [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) for the human/agent extension, and [`AGENTS.md`](./AGENTS.md) for the coding-agent contract.

## Built-in feature composition

The root package exports factories for every default built-in plus composition helpers:

```ts
import {
  colorPickerPlugin,
  composeMesurerPlugins,
  defaultMesurerPlugins,
  distancePlugin,
  guidesPlugin,
  rulersPlugin,
  selectPlugin,
  settingsPlugin,
  textInspectorPlugin,
  xrayPlugin,
} from "mesurer-solid";
```

This lets an integration start with the default feature set, exclude selected built-ins, or compose a custom set without forking Mesurer. `contextPlugin()` is intentionally separate from the default source-mounted built-ins, while generic injection and the browser extension install it by default for the human/agent workflow.

## ACP delivery

Mesurer does not discover agents, manage their processes, or choose sessions. The ACP client/harness that already owns the target session sends Mesurer output.

```ts
import { toAcpContentBlocks } from "mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one deterministic context text block plus optional labeled image blocks. The caller performs ACP initialization/capability negotiation and its normal `session/prompt` flow. If image prompts are unsupported, send the text block only. `contextText()` / **Copy context** remains the universal fallback.

## Public package surface

There is one npm package with four primary public entry points:

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

- root — mount API, agent/context types and helpers, plugin factories, and the bundled renderer.
- `/core` — framework-neutral plugin/runtime primitives.
- `/inject` — ES-module side-effect injector for browser automation.
- `/inject-script` — self-contained classic-script payload for generic JavaScript evaluation.

Only `mesurer-solid` is published under the canonical package name. Private core/DOM/renderer workspaces remain internal and must not leak into public JS/declaration artifacts. The public context declarations remain self-contained while compile-time contract assertions prevent the internal framework-neutral annotation model from silently drifting away from the public JSON shapes.

## Compatibility and host-page isolation

The supported browser-host boundary is intentionally framework independent:

```text
Solid 1
Solid 2
React
Vue
Svelte
vanilla DOM
Electron renderer
```

We do not attempt to prove compatibility by keeping a list of websites. Instead, package-smoke exercises classes of browser interference against the exact packed artifact: hostile global CSS, transformed/overflow-clipped ancestors, extreme `z-index` overlays, later top-layer popovers, and modal dialogs. Those are the primitives websites compose.

On modern browsers, the preferred manual-popover host lives in the browser top layer, which is above normal document layers and escapes ancestor clipping. The fixed/max-`z-index` path is the compatibility fallback. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md) for what is guaranteed and what no in-page library can guarantee.

Electron main-process code is not a DOM host. Mount or inject Mesurer inside renderer pages. Mesurer does not import Electron.

The package build fails if public artifacts leak private workspace package names or leave Solid as a runtime dependency for the host application.

X-ray preserves the established full-page behavior for body/document mounts while its lifecycle is reference-counted per document, so disposing one Mesurer instance cannot turn off another active instance. Element and ShadowRoot mounts scope X-ray to their own target.

## Visual and behavioral parity

The default renderer continues to track the pinned upstream Mesurer UI and behavior. CI compares the Solid renderer against the pinned React reference through screenshot parity, explicit control/icon geometry contracts, interaction gates, and native-3× captures.

Framework independence and plugin composition are architectural changes; they are not permission to silently drift the default UI. New plugin tools use the same toolbar primitives rather than introducing a visually separate action bar.

## Development

```bash
bun install
bun run dev
```

Core validation:

```bash
bun run typecheck
bun run test
bun run build
```

The package-smoke workflow packs the exact sanitized npm artifact, installs it into clean consumer hosts, evaluates the packed `inject-script.js` from a React page with no Mesurer source import, and exercises the host-isolation regression contract.

`bun run build` also writes the unpacked MV3 extension to `extension/dist/`. The public-package build smoke-installs the portable Agent Skill into a temporary project and verifies the installed `assets/inject-script.js` exactly matches the built injector bytes.

Agent-session/ACP ownership flows should additionally be exercised locally with actual harnesses because CI cannot meaningfully stand in for a user's live local coding-agent/browser session.

For repository work, also read:

- [`AGENTS.md`](./AGENTS.md) — coding-agent integration and contribution instructions.
- [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md) — the inject-first browser/Electron harness contract.
- [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) — how to keep Mesurer in the UI implementation/validation loop.
- [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md) — annotations, scoped context, review, screenshots, Agent Skill, and ACP delivery.
- [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md) — cross-site layering/occlusion invariants and adversarial tests.
- [`packages/mesurer/AGENT_INTEGRATION.md`](./packages/mesurer/AGENT_INTEGRATION.md) — harness-facing browser/context contract.
- [`extension/README.md`](./extension/README.md) — first-party browser extension workflow.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — internal boundaries and invariants.
- [`RELEASING.md`](./RELEASING.md) — release workflow; do not manually publish normal releases.
- [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) — upstream attribution.
