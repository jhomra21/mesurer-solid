# Mesurer agent integration

Mesurer is designed to be usable by coding agents from the same browser harness they already use to inspect and test a user's application.

## Preferred agent path: inject, do not modify the app

A user application does **not** need to import Mesurer. Build/install `@jhomra21/mesurer`, resolve its `@jhomra21/mesurer/inject` export in the harness process, and inject that file into the running page.

```js
import { fileURLToPath } from "node:url";

const injectPath = fileURLToPath(import.meta.resolve("@jhomra21/mesurer/inject"));
await page.addScriptTag({ type: "module", path: injectPath });
await page.evaluate(() => window.__MESURER__.ready());
```

The injector bundles its own Solid 2 runtime and mounts into an isolated ShadowRoot. It must not depend on or replace the application's Solid/React/Vue/Svelte runtime.

## Feedback loop

After each UI edit or HMR update:

```js
await page.evaluate(() => window.__MESURER__.stable());

const feedback = await page.evaluate(() =>
  window.__MESURER__.feedback([
    "[data-testid='primary-toolbar']",
    "main",
    "[data-testid='inspector']",
  ]),
);

const screenshot = await page.screenshot();
```

Use both outputs:

- Mesurer feedback gives exact geometry, margin/padding/border, typography, flex/grid properties, overflow, element-to-element gaps, viewport/document dimensions, plugin capabilities and plugin state.
- The browser screenshot gives visual appearance that structured DOM data cannot fully represent.

Do not infer geometry from screenshots when `window.__MESURER__` can measure it directly.

## Agent bridge

Default global: `window.__MESURER__`.

Important methods:

```ts
ready(): Promise<void>
stable(frames?: number): Promise<void>
inspect(selector: string, index?: number): AgentElementInspection | null
inspectAll(selector: string, limit?: number): AgentElementInspection[]
at(x: number, y: number): AgentElementInspection | null
distance(a: string, b: string): AgentDistance | null
viewport(): AgentViewportSnapshot
feedback(selectors?: string[]): Promise<AgentFeedbackSnapshot>
describe(): Promise<MesurerPluginDescription | undefined>
command(id: string, args?: unknown): Promise<void>
state(): Promise<Record<string, unknown>>
```

The injected advanced instance is available as `window.__MESURER_INSTANCE__`. Use its `pluginHost` only when an agent needs to add/remove/replace runtime plugins. Prefer the smaller `window.__MESURER__` measurement surface for ordinary UI feedback.

## Built-in commands

The Solid runtime bridge exposes built-in tools as commands, including:

```text
builtin.select
builtin.xray
builtin.color-picker
builtin.rulers
builtin.text-inspector
builtin.guides
builtin.settings
```

Commands use the same behavior path as the visible Mesurer tools.

## Runtime plugins

Plugins may register:

- tools
- commands
- hooks
- overlays
- settings contributions
- scoped state slices

State slices can opt into history and persistence. Plugin registrations must dispose cleanly when their plugin is removed or replaced.

Agents can inspect the current extension surface through `window.__MESURER__.describe()` rather than reaching into implementation files.

## Framework rules

- Solid 2 apps may use the native `@jhomra21/mesurer-solid` component or the universal injector.
- Solid 1 apps must use `@jhomra21/mesurer` / `@jhomra21/mesurer/inject`, not the Solid 2 component package.
- React, Vue, Svelte, vanilla browser apps and Electron renderer pages use the same universal mount/injection boundary.
- Electron main-process code is not a DOM host. Inject/mount only in renderer pages.

## Architecture invariants

- `@jhomra21/mesurer-core` must remain framework-neutral.
- `@jhomra21/mesurer-dom` owns shared browser/DOM measurement primitives.
- `@jhomra21/mesurer-solid` is the Solid 2 renderer/adapter, not the owner of the framework-neutral state/history contract.
- `@jhomra21/mesurer` is the self-contained universal browser island and agent harness.
- Built-in and external features use the public plugin host instead of privileged private registration paths.
- Default Mesurer rendering must retain the pinned React upstream visual/behavioral parity gates.

## Development-only injection

`@jhomra21/mesurer/inject` is intended for development, testing and coding-agent harnesses. It does not open a network port or expose a remote service. The bridge exists only in the browser page where the harness injects it.
