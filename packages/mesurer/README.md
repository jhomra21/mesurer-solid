# @jhomra21/mesurer-solid

Framework-agnostic UI measurement and inspection tools for browser applications and coding agents.

Mesurer's reference UI is implemented in Solid 2, but the public package bundles that renderer/runtime privately. Host applications do not need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

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

// later
mesurer.dispose();
```

`mountMeasurer()` creates an isolated ShadowRoot by default, so Mesurer does not share the host framework's renderer runtime or CSS boundary.

## Core/plugin API

```ts
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

There is no second framework-specific package to install.

## Inject from an existing coding-agent browser tool

The preferred generic agent path is:

```text
@jhomra21/mesurer-solid/inject-script
```

`inject-script.js` is a self-contained classic script. Read the resolved file as text and execute it with the browser primitive the agent already owns (`browser_eval`, `browser_execute`, CDP `Runtime.evaluate`, etc.). Do not launch a second browser or duplicate navigation/click/screenshot APIs just for Mesurer.

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

The injected payload exposes `window.__MESURER__` for JSON-safe measurements and `window.__MESURER_INSTANCE__` for advanced plugin-host access. Reinjection disposes the previous injected instance first.

Harnesses that specifically support adding an ES module script can alternatively use:

```text
@jhomra21/mesurer-solid/inject
```

Before injection, a harness can optionally configure the bridge:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__UI_MEASURE__",
  excludePlugins: ["color-picker"],
};
```

Neither injection entry opens a network listener or remote-control service.

## Agent API

- `ready()` — wait for the Mesurer runtime and plugins.
- `stable(frames?)` — wait for fonts and animation frames after an edit/HMR update.
- `inspect(selector, index?)` / `inspectAll(selector)` — rect, margin, padding, border, typography, appearance, layout, and overflow data.
- `at(x, y)` — inspect the application element under a viewport coordinate.
- `distance(a, b)` — horizontal/vertical gaps and center deltas between two elements.
- `viewport()` — viewport/document dimensions and overflow signals.
- `feedback(selectors?)` — one JSON-safe iteration payload with requested elements, viewport, plugin capabilities, and plugin state.
- `describe()` — loaded plugins, tools, commands, state slices, settings, services, and overlays.
- `command(id, args?)` — execute Mesurer or extension commands such as `builtin.xray`.
- `state()` — inspect plugin-owned state.

## Intended feedback loop

```text
outer harness edits/navigates/interacts
  → evaluate inject-script when needed
  → __MESURER__.stable()
  → __MESURER__.feedback([...important selectors])
  → outer harness screenshot
  → compare exact geometry + pixels
```

## Public package surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

All are exports of this single npm package.
