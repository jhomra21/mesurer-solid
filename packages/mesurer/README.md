# @jhomra21/mesurer-solid

Framework-agnostic UI measurement and inspection tools for browser applications and coding agents.

Mesurer's reference UI is implemented in Solid 2, but the public package bundles that renderer/runtime privately. Host applications do not need Solid 2 and can use Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

## Install

During the beta:

```bash
bun add -d @jhomra21/mesurer-solid@beta
```

## Mount from application code

The same API is used regardless of host framework:

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

Extension authors use a subpath of the same package:

```ts
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

There is no second framework-specific package to install.

## Inject from a browser harness

For coding agents, the preferred path is `@jhomra21/mesurer-solid/inject`: the application does not import Mesurer at all. A Playwright-style harness injects the self-contained module into the already-running page.

```js
import { fileURLToPath } from "node:url";

const injectPath = fileURLToPath(
  import.meta.resolve("@jhomra21/mesurer-solid/inject"),
);

await page.addScriptTag({
  type: "module",
  path: injectPath,
});

await page.evaluate(() => window.__MESURER__.ready());

const feedback = await page.evaluate(() =>
  window.__MESURER__.feedback([
    "[data-testid='toolbar']",
    "[data-testid='canvas']",
  ]),
);

const screenshot = await page.screenshot();
```

The injected module exposes `window.__MESURER__` for JSON-safe measurements and `window.__MESURER_INSTANCE__` for advanced plugin-host access. Reinjection disposes the previous injected instance first, keeping HMR/agent loops deterministic.

Before injection, a harness can optionally configure the bridge:

```js
await page.evaluate(() => {
  window.__MESURER_CONFIG__ = {
    globalName: "__UI_MEASURE__",
    excludePlugins: ["color-picker"],
  };
});
```

This surface is intended for development/test automation. It does not create a network listener or remote-control channel by itself.

## Agent API

The bridge is deliberately data-first so an agent can combine structured measurements with browser screenshots:

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

Element box-model values come from the same framework-neutral DOM inspection primitive used by the visible Select tool rather than a separate automation-only implementation.

## Intended feedback loop

```text
edit UI
  → HMR/browser update
  → __MESURER__.stable()
  → __MESURER__.feedback([...important selectors])
  → browser screenshot
  → compare geometry/typography/overflow + pixels
  → revise UI
```

The user application does not need to know which framework Mesurer itself uses.

## Public package surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
```

All three are exports of this single npm package.
