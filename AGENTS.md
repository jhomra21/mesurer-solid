# Mesurer Solid agent integration

Mesurer Solid is designed to be attached by coding agents from the same browser harness they already use to inspect and test a user's application.

## Preferred path: use the agent's existing browser tool

A user application does **not** need to import Mesurer. The coding-agent environment should install `@jhomra21/mesurer-solid`, resolve/read its `@jhomra21/mesurer-solid/inject-script` export, and pass that source to the browser tool's existing JavaScript-evaluation primitive.

Do not launch a second Chromium, create a second CDP connection, or wrap navigation/click/type/screenshot APIs when the outer harness already provides them.

Conceptually:

```js
const source = await readMesurerInjectScript();
await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

`inject-script.js` is a self-contained classic script. It contains Mesurer's private Solid 2 renderer/runtime and mounts into an isolated ShadowRoot without depending on or replacing the application's Solid, React, Vue, Svelte, or other renderer runtime.

Harnesses that specifically support module-script injection may alternatively use `@jhomra21/mesurer-solid/inject`, but `/inject-script` is the transport-neutral default for generic `browser_eval`, `browser_execute`, or CDP `Runtime.evaluate` APIs.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

The repository's `browser:harness` command is only a Playwright reference adapter for manual testing/CI; it is not the agent integration API. See [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md).

## Feedback loop

After each UI edit or HMR update, use the outer harness to execute:

```js
await window.__MESURER__.stable();
const feedback = await window.__MESURER__.feedback([
  "[data-testid='primary-toolbar']",
  "main",
  "[data-testid='inspector']",
]);
```

Then use the outer browser harness's existing screenshot tool. Mesurer feedback gives exact geometry, margin/padding/border, typography, flex/grid properties, overflow, element-to-element gaps, viewport/document dimensions, plugin capabilities, and plugin state. Do not infer geometry from screenshots when `window.__MESURER__` can measure it directly.

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

The advanced mounted instance is available as `window.__MESURER_INSTANCE__`. Use its `pluginHost` only when an agent needs to add, remove, or replace runtime plugins. Prefer the smaller JSON-safe `window.__MESURER__` surface for normal feedback.

## Built-in commands

The runtime bridge exposes stable built-in command names:

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

A plugin can replace a built-in without changing the agent-facing command name. Register the replacement against the same built-in slot and use its own command. Mesurer hides the legacy control, renders the replacement contribution, and delegates the stable `builtin.<name>` command plus the conventional shortcut to the replacement.

```ts
import { defineMesurerPlugin } from "@jhomra21/mesurer-solid/core";

const replacement = defineMesurerPlugin({
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

await window.__MESURER_INSTANCE__?.pluginHost?.replace(replacement);
await window.__MESURER__.command("builtin.xray");
```

Nested command delegation is one history transaction, so stable built-in commands do not create duplicate undo checkpoints.

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

State slices can opt into history and persistence. Registrations must clean up when their plugin is removed or replaced.

Renderer-aware plugins may request the `runtime:solid` capability and use the public runtime service type exported by `@jhomra21/mesurer-solid`. This does not require importing the private renderer workspace.

```ts
import type { MesurerSolidRuntimeService } from "@jhomra21/mesurer-solid";

const plugin = {
  id: "example.overlay",
  requires: ["runtime:solid"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");
    if (!runtime) throw new Error("Missing renderer runtime service");

    const mount = runtime.createInspectorMount();
    mount.element.textContent = "Plugin UI";
    ctx.lifecycle.onDispose(() => mount.dispose());
  },
};
```

`createInspectorMount()` marks plugin-owned DOM as inspector UI so Mesurer does not measure or X-ray its own extension surface. Service values never enter history or persistence; `describe()` exposes service IDs only.

## Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages all use the public `@jhomra21/mesurer-solid` mount/injection boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's own UI renderer remains implemented in Solid 2, but that runtime is private to the Mesurer browser island.
- Electron main-process code is not a DOM host. Mount or inject only in renderer pages.
- Browser transport and browser ownership belong to the outer harness, not Mesurer.

## Public package contract

Only one package is intended for users:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

These are subpath exports of the same npm package, not separate packages.

## Architecture invariants

Internal repository workspaces may remain separated for maintainability, but they are private implementation details:

- framework-neutral core must not depend on Solid, React, or another renderer;
- DOM helpers own canonical browser measurements;
- `packages/renderer` owns the Solid 2 UI/reactive adapter;
- `packages/mesurer` owns the one public package, isolated mount, public core bundle, and injection payloads;
- built-in and external features use the same plugin host;
- the staged npm artifact must not expose private workspace names or runtime dependencies;
- default rendering must retain the pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright when the outer harness already has browser execution capability.

## Development-only injection

`@jhomra21/mesurer-solid/inject` and `@jhomra21/mesurer-solid/inject-script` are intended for development, testing, and coding-agent harnesses. They do not open a network port or expose a remote-control service by themselves.
