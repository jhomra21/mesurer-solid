# @jhomra21/mesurer

Framework-agnostic browser entry point and automation harness for Mesurer.

## Mount from application code

```ts
import { mountMeasurer } from "@jhomra21/mesurer";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;

console.log(mesurer.agent.inspect("[data-testid='save']"));
console.log(mesurer.agent.distance("#sidebar", "main"));

// later
mesurer.dispose();
```

`mountMeasurer()` creates an isolated ShadowRoot by default and bundles its own Solid 2 renderer/runtime. The host application therefore does not need Solid 2 and can be Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

## Inject from a browser harness

For coding agents, the preferred path is `@jhomra21/mesurer/inject`: the application does not import Mesurer at all. A Playwright-style harness injects the self-contained module into the already-running page.

```js
import { fileURLToPath } from "node:url";

const injectPath = fileURLToPath(import.meta.resolve("@jhomra21/mesurer/inject"));

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

The injected module exposes `window.__MESURER__` for JSON-safe measurements and `window.__MESURER_INSTANCE__` for advanced plugin-host access. Reinjection disposes the previous injected instance first, which keeps HMR/agent loops deterministic.

Before injection, a harness can optionally configure the bridge:

```js
await page.evaluate(() => {
  window.__MESURER_CONFIG__ = {
    globalName: "__UI_MEASURE__",
    excludePlugins: ["color-picker"],
  };
});
```

This injection surface is intended for development/test automation. It does not create a network listener or remote-control channel by itself.

## Agent API

The bridge is deliberately data-first so an agent can combine structured measurements with its existing browser screenshots:

- `ready()` — wait for Mesurer plugins/runtime and settled layout.
- `stable(frames?)` — wait for fonts plus animation frames after an edit/HMR update.
- `inspect(selector, index?)` / `inspectAll(selector)` — rect, margin, padding, border, typography, visual style, layout and overflow data.
- `at(x, y)` — inspect the application element under a viewport coordinate.
- `distance(a, b)` — horizontal/vertical gaps and center deltas between two elements.
- `viewport()` — viewport/document dimensions and overflow signals.
- `feedback(selectors?)` — one JSON-safe iteration payload with requested elements, viewport, plugin capabilities and plugin state.
- `describe()` — loaded plugins, tools, commands, state slices, settings and overlays.
- `command(id, args?)` — execute Mesurer or extension commands such as `builtin.xray`.
- `state()` — inspect plugin-owned state.

Element box-model values come from the same framework-neutral DOM inspection primitive used by the visual Solid Select tool, rather than a separate agent-only measurement implementation.

## Intended feedback loop

A coding agent can run this cycle entirely from its browser harness:

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
