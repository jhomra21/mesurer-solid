# @jhomra21/mesurer-solid

Framework-agnostic UI measurement and inspection tools for browser applications and coding agents, built as a Solid 2 port/remix and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by [Julien Thibeaut (`@ibelick`)](https://github.com/ibelick).

Mesurer is both an interactive developer tool and a machine-readable inspection layer. Its reference UI is implemented in Solid 2, but the public package bundles that renderer/runtime privately. Host applications do not need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

## What it can do

Mesurer provides:

- interactive Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings features;
- exact DOM geometry, box model, typography, appearance, layout, scroll, and overflow inspection;
- element-to-element gap and center-delta measurements;
- viewport/document diagnostics;
- a JSON-safe coding-agent API with `feedback()`, stable commands, and plugin state;
- a composable plugin runtime with tools, commands, hooks, overlays, settings, state, services, history, persistence, and disposal;
- runtime plugin load/remove/replace, including replacement of built-in slots;
- isolated ShadowRoot mounting by default;
- protected browser top-layer mounting on modern browsers so normal page stacking/clipping does not cover the inspector;
- classic-script and ES-module injection paths for existing browser harnesses.

Mesurer deliberately does **not** own browser navigation, clicks, typing, screenshots, tabs, authentication, source editing, browser lifetime, or a network RPC server. Keep those responsibilities in the outer browser/agent harness.

## Install

During the beta:

```bash
npm install -D @jhomra21/mesurer-solid@beta
```

Or with Bun:

```bash
bun add -d @jhomra21/mesurer-solid@beta
```

## Choose how you want to use Mesurer

| Goal | Recommended path |
| --- | --- |
| Inspect a website you are developing | Install the package and call `mountMeasurer()` in browser/client code. |
| Inspect any website manually | Save the published `/inject-script` payload as a browser DevTools Snippet and run it on the current page. |
| Use Mesurer from a coding agent | Reuse the agent's existing browser/evaluation channel and inject `/inject-script`. |
| Use Mesurer from Playwright, CDP, Cypress, Electron, or another harness | Reuse the harness that already owns the page/renderer and inject. |
| Build or replace Mesurer tools | Use the public `/core` plugin/runtime API. |

## Quick start — your own website

Mount Mesurer from client-side application code:

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer();
```

Start the app normally (`npm run dev`, `bun run dev`, etc.), open it in the browser, and use the floating toolbar. Common shortcuts include `M` to toggle Mesurer, `S` for Select, `A` for Text Inspector, `G` for Guides, `R` for Rulers, `X` for X-ray, `P` for Color Picker, and `Alt` for distance inspection.

For Vite projects that should load Mesurer only in development:

```ts
if (import.meta.env.DEV) {
  import("@jhomra21/mesurer-solid").then(({ mountMeasurer }) => {
    const mesurer = mountMeasurer();
    import.meta.hot?.dispose(() => mesurer.dispose());
  });
}
```

The host app does not need Solid 2; Mesurer carries its own isolated renderer/runtime.

## Quick start — any website

You can use Mesurer on a website without changing that site's source. The current no-extension workflow is a saved browser DevTools Snippet built from the published self-contained `/inject-script` payload.

In any throwaway folder:

```bash
npm install @jhomra21/mesurer-solid@beta
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; process.stdout.write(readFileSync(fileURLToPath(import.meta.resolve('@jhomra21/mesurer-solid/inject-script')), 'utf8'))" > mesurer-snippet.js
```

Then in Chrome, Edge, or another Chromium browser:

1. Open DevTools → **Sources → Snippets**.
2. Create a snippet named `Mesurer`.
3. Paste the contents of `mesurer-snippet.js` and save it.
4. Visit any page you want to inspect and run the snippet (`Cmd/Ctrl+Enter`).
5. Use the Mesurer toolbar directly on that page.

Run the snippet again after a full page navigation/reload. Re-running it on the same page is safe because Mesurer disposes the previous injected instance before mounting the new one.

This requires a desktop browser that permits DevTools JavaScript execution in the current page. Mesurer does not bypass browser security boundaries. A first-party browser extension is not currently shipped; the saved DevTools Snippet is the current zero-source-change path for arbitrary websites.

## Agent quick start — inject into your existing harness

**Using Mesurer from an agent should normally require no changes to the target application's source or build.**

The default host-project mutation budget is **zero**. If the harness can execute JavaScript in the current browser page, Electron renderer, WebView, or other DOM host, reuse that existing path:

```text
existing harness
  → existing page / renderer
  → evaluate @jhomra21/mesurer-solid/inject-script
  → window.__MESURER__
```

Do **not** add Mesurer to application source, create a Mesurer-specific build, add another browser/CDP stack, or introduce project-specific `start:mesurer` / `package:mesurer` commands merely to inspect the UI. Those are optional conveniences only when the user explicitly wants a persistent embedded development workflow.

The preferred transport-neutral agent path is:

```text
@jhomra21/mesurer-solid/inject-script
```

Resolve/read it as text and execute the source with the JavaScript primitive the agent already owns (`browser_eval`, `browser_execute`, CDP `Runtime.evaluate`, etc.):

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

Injection exposes:

```text
window.__MESURER__          JSON-safe measurement/command API
window.__MESURER_INSTANCE__ mounted instance and pluginHost access
```

Reinjection disposes the previous injected instance first.

For packaged applications, prefer the **ordinary packaged artifact** plus an existing attach/evaluate channel. If the normal artifact can be launched with CDP enabled, launch that same artifact, attach the existing harness, and inject Mesurer. Do not compile Mesurer into a special package merely to inspect it.

| Situation | Mesurer workflow |
| --- | --- |
| Harness already has browser JavaScript execution | **Inject `/inject-script`** |
| Electron renderer is reachable through existing CDP | **Attach the existing harness + inject** |
| Normal packaged app can be launched with CDP | **Launch the same artifact + inject** |
| User explicitly wants Mesurer every development launch | `mountMeasurer()` may be appropriate |
| No renderer evaluation path exists | Explain the limitation, then consider source integration |
| Agent wants a new browser, command, or build just for Mesurer | **Don't; reuse the existing harness** |

Harnesses that specifically support adding an ES module script can alternatively use:

```text
@jhomra21/mesurer-solid/inject
```

Before injection, a harness can configure the bridge:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__UI_MEASURE__",
  target: "#app",
  topLayer: true,
  excludePlugins: ["color-picker"],
  persistKey: "my-project:mesurer",
};
```

Neither injection entry opens a network listener or remote-control service.

See the shipped [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md) for the concise agent contract.

## App integration API — mount from source

Use `mountMeasurer()` when Mesurer should be embedded in a browser application or automatically present during development. The quick start above uses this same API; this section shows the optional agent bridge and mounted-instance lifecycle.

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;

console.log(mesurer.agent.inspect("[data-testid='save']"));
console.log(mesurer.agent.distance("#sidebar", "main"));
console.log(mesurer.hostLayer); // "top-layer" on supported modern browsers

// Later
mesurer.dispose();
```

`mountMeasurer()` creates an isolated ShadowRoot by default. On browsers with Popover API support, the outer host is promoted into the browser top layer so ordinary stacking contexts and ancestor clipping cannot cover it. The mounted instance exposes the live `agent` harness, `pluginHost`, `hostLayer`, `bringToFront()`, `ready`, `describe()`, and `dispose()`.

Useful options include `target`, `isolate`, `shadowMode`, `topLayer`, colors, guide/ruler settings, persistence, `plugins`, `excludePlugins`, a supplied `pluginHost`, and agent bridge configuration.

## Agent API

- `ready()` — wait for the runtime/plugins and initial layout to settle.
- `stable(frames?)` — wait for fonts and animation frames after edits or HMR.
- `inspect(selector, index?)` / `inspectAll(selector, limit?)` — rect, margin, padding, border, typography, appearance, layout, scroll, and overflow data.
- `at(x, y)` — inspect the element under a viewport coordinate.
- `distance(a, b)` — horizontal/vertical gaps and center deltas.
- `viewport()` — viewport/document dimensions, DPR, scrolling, and overflow.
- `feedback(selectors?)` — one JSON-safe iteration snapshot with requested elements, viewport, plugin capabilities, and plugin state.
- `describe()` — loaded plugins, tools, commands, state slices, settings, services, hooks, and overlays.
- `command(id, args?)` — execute Mesurer or extension commands.
- `state()` — serialize plugin-owned state.

## Use Mesurer as the design feedback loop

For meaningful UI/design work, do not stop when the source CSS looks plausible. Validate what the browser actually rendered:

```text
agent edits the UI
  → real app/HMR settles
  → __MESURER__.stable()
  → __MESURER__.feedback([...important selectors])
  → outer harness screenshot
  → compare actual alignment/spacing/sizing/overflow/computed styles + pixels
  → fix discrepancies and repeat
```

Use Mesurer measurements to prove claims such as “these edges align,” “the gap is 16 px,” “all buttons are the same height,” or “there is no horizontal overflow.” Use screenshots for composition, hierarchy, clipping, and visual balance. The rendered page—not the CSS declaration—is the final source of truth.

## Stable built-in commands

```text
builtin.select
builtin.xray
builtin.color-picker
builtin.rulers
builtin.text-inspector
builtin.guides
builtin.settings
```

The Distance feature is an overlay capability, not a standalone `builtin.distance` command.

## Plugins and core runtime

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

Plugins can register tools, commands, hooks, overlays, settings contributions, scoped state slices, opaque services, and disposal callbacks. State slices may opt into history and persistence.

Plugins may be loaded, removed, or replaced while Mesurer is mounted. Built-in slots can also be excluded or replaced while preserving their stable shortcut and `builtin.<id>` command routing.

Users can customize Mesurer by asking their coding agent to create project-specific plugins—for example an 8 px grid audit, overflow highlighter, component-label overlay, or consistency checker—rather than forking the renderer.

Renderer-aware plugins may request the opaque `runtime:solid` service through `ctx.service.get("runtime:solid")`. It supplies the owner document/window, portal target, and a `createInspectorMount()` helper for plugin-owned UI. Extension code should not import private renderer workspaces.

## Built-in composition

The root package exports built-in factories and composition helpers:

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
} from "@jhomra21/mesurer-solid";
```

## Public package surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

All are exports of this single npm package.
