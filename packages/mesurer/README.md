# @jhomra21/mesurer-solid

Framework-agnostic UI measurement and inspection tools for browser applications and coding agents.

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
- classic-script and ES-module injection paths for existing browser harnesses.

Mesurer deliberately does **not** own browser navigation, clicks, typing, screenshots, tabs, authentication, source editing, browser lifetime, or a network RPC server. Keep those responsibilities in the outer browser/agent harness.

## Install

During the beta:

```bash
bun add -d @jhomra21/mesurer-solid@beta
```

## Mount from application code

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;

console.log(mesurer.agent.inspect("[data-testid='save']"));
console.log(mesurer.agent.distance("#sidebar", "main"));

// Later
mesurer.dispose();
```

`mountMeasurer()` creates an isolated ShadowRoot by default. The mounted instance exposes the live `agent` harness, `pluginHost`, `ready`, `describe()`, and `dispose()`.

Useful options include `target`, `isolate`, `shadowMode`, colors, guide/ruler settings, persistence, `plugins`, `excludePlugins`, a supplied `pluginHost`, and agent bridge configuration.

## Inject from an existing coding-agent browser tool

The preferred transport-neutral agent path is:

```text
@jhomra21/mesurer-solid/inject-script
```

`inject-script.js` is a self-contained classic script. Resolve/read it as text and execute the source with the browser primitive the agent already owns (`browser_eval`, `browser_execute`, CDP `Runtime.evaluate`, etc.). Do not launch a second browser or duplicate navigation/click/screenshot APIs just for Mesurer.

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

Harnesses that specifically support adding an ES module script can alternatively use:

```text
@jhomra21/mesurer-solid/inject
```

Before injection, a harness can configure the bridge:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__UI_MEASURE__",
  target: "#app",
  excludePlugins: ["color-picker"],
  persistKey: "my-project:mesurer",
};
```

Neither injection entry opens a network listener or remote-control service.

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

Recommended feedback loop:

```text
outer harness edits/navigates/interacts
  → __MESURER__.stable()
  → __MESURER__.feedback([...important selectors])
  → outer harness screenshot
  → compare exact geometry + pixels
```

Prefer Mesurer's numeric geometry over estimating spacing from screenshots.

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
