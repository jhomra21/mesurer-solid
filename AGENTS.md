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

### Replacing a built-in

A plugin can replace a built-in without changing the agent-facing command name. Remove/replace the original `mesurer.<name>` plugin, register a tool contribution with `builtin: "<name>"`, and give that contribution its own command. Mesurer hides the legacy control, renders the replacement contribution, and delegates the stable `builtin.<name>` command plus the conventional built-in shortcut to the replacement.

```ts
await host.replace({
  id: "mesurer.xray",
  provides: ["tool:xray"],
  setup(ctx) {
    ctx.state.register({ id: "replacement.xray", initial: false, history: true });
    ctx.command.register("replacement.xray.toggle", () => {
      ctx.state.update<boolean>("replacement.xray", (value) => !value);
    });
    ctx.tool.register({
      id: "xray",
      builtin: "xray",
      label: "Replacement X-ray",
      shortcut: "X",
      command: "replacement.xray.toggle",
      active: () => ctx.state.get("replacement.xray") === true,
    });
  },
});

// Existing agent integrations do not change:
await window.__MESURER__.command("builtin.xray");
```

Nested command delegation is one history transaction, so the stable built-in command does not create a second undo checkpoint around the replacement command.

## Runtime plugins

Plugins may register:

- tools
- commands
- hooks
- overlays
- settings contributions
- scoped state slices
- opaque renderer/browser services
- disposal callbacks

State slices can opt into history and persistence. Plugin registrations must dispose cleanly when their plugin is removed or replaced. Nested plugin commands are treated as one history transaction so a stable command can delegate without creating duplicate undo checkpoints.

Renderer-aware plugins can require the Solid runtime capability and use its service without importing renderer internals:

```ts
import type { MesurerSolidRuntimeService } from "@jhomra21/mesurer";

const plugin = {
  id: "example.overlay",
  requires: ["runtime:solid"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");
    if (!runtime) throw new Error("Missing Solid runtime service");

    const mount = runtime.createInspectorMount();
    mount.element.textContent = "Plugin UI";
    ctx.lifecycle.onDispose(() => mount.dispose());
  },
};
```

`createInspectorMount()` marks plugin-owned DOM as inspector UI so Mesurer does not measure or X-ray its own extension surface. Service values are opaque and are never included in history or persistence; `describe()` exposes service IDs only.

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
