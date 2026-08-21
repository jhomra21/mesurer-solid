# Mesurer Solid agent instructions

Mesurer Solid is designed to be attached by coding agents from the **same browser harness they already use** to inspect and test a user's application.

The core rule is simple:

> The outer harness owns the browser. Mesurer owns measurement, inspection, Mesurer commands, and the extension runtime.

Do not build a second browser-control stack around Mesurer.

## 1. Preferred integration: inject into the existing page

A user application does **not** need to import Mesurer.

The coding-agent environment should install `@jhomra21/mesurer-solid`, resolve/read its `@jhomra21/mesurer-solid/inject-script` export, and pass that source to the browser tool's existing JavaScript-evaluation primitive.

Do not launch a second Chromium, create a second CDP connection, or wrap navigation/click/type/screenshot APIs when the outer harness already provides them.

In a Node/Bun-side harness:

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

`inject-script.js` is a self-contained classic script. It contains Mesurer's private Solid 2 renderer/runtime and mounts into an isolated ShadowRoot without depending on or replacing the application's Solid, React, Vue, Svelte, or other renderer runtime.

Harnesses that specifically support module-script injection may alternatively use `@jhomra21/mesurer-solid/inject`, but `/inject-script` is the transport-neutral default for generic `browser_eval`, `browser_execute`, or CDP `Runtime.evaluate` APIs.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

The repository's `browser:harness` command is only a Playwright reference adapter for manual testing/CI; it is not the agent integration API. See [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md).

## 2. Injection configuration

Before evaluating the injection payload, a harness may set:

```js
window.__MESURER_CONFIG__ = {
  globalName: "__MESURER__",
  target: "#app",
  excludePlugins: ["color-picker"],
  persistKey: "project:mesurer",
};
```

`target` is a CSS selector and defaults to `document.body`. `globalName` defaults to `__MESURER__`. Other fields are normal mount options except direct `target` elements and the `agent` option.

Reinjection is deterministic: the previous `window.__MESURER_INSTANCE__` is disposed before the new instance mounts.

## 3. What the agent bridge can observe

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

Element inspection includes:

```text
selector/tag/id/classes/text/role/aria-label
rect: left/top/right/bottom/x/y/width/height
margin/padding/border edges
typography: font family/size/weight, line height, letter spacing, text alignment, color
appearance: background, border color/radius, shadow, opacity
layout: display, position, z-index, overflow, flex fields, grid tracks, transform
scroll: client/scroll dimensions and overflow booleans
```

`distance()` returns horizontal/vertical gaps and center deltas between the first matching elements. `viewport()` reports viewport/document dimensions, DPR, scroll position, and page overflow. `feedback()` combines requested element measurements, viewport data, loaded plugin/capability description, and serialized plugin state into one JSON-safe snapshot.

## 4. Required post-edit feedback loop

After each meaningful UI edit or HMR update:

```js
await window.__MESURER__.stable();

const feedback = await window.__MESURER__.feedback([
  "[data-testid='primary-toolbar']",
  "main",
  "[data-testid='inspector']",
]);
```

Then take a screenshot with the **outer browser harness**.

Use both signals:

```text
Mesurer numeric feedback  → geometry, box model, computed styles, overflow, capability state
Outer-harness screenshot  → pixels, composition, clipping, visual regressions
```

Do not infer exact spacing from screenshots when Mesurer can measure it directly. Do not expect Mesurer to take the screenshot for you.

When a selector matches many nodes, use `inspectAll(selector, limit)` or narrow the selector. The default `inspectAll` limit is 50.

## 5. Browser ownership boundary

Mesurer does **not** provide or own:

- navigation;
- clicking or typing;
- screenshots;
- tabs/windows;
- authentication/session management;
- browser process lifetime;
- a network RPC listener;
- source-file editing.

Use the outer harness for those operations.

Mesurer does provide exact page inspection, Mesurer command execution, Mesurer/plugin state, runtime plugin management, and the interactive Mesurer UI.

## 6. Built-in features and stable commands

The default renderer includes:

```text
Select
X-ray
Color Picker
Rulers
Text Inspector
Guides
Distance overlay
Settings
```

The runtime bridge exposes these stable built-in command names:

```text
builtin.select
builtin.xray
builtin.color-picker
builtin.rulers
builtin.text-inspector
builtin.guides
builtin.settings
```

The Distance feature is an overlay capability and does not currently expose a `builtin.distance` command.

Commands use the same behavior path as the visible Mesurer controls.

## 7. Advanced mounted instance

Injection also exposes:

```text
window.__MESURER_INSTANCE__
```

Use `window.__MESURER__` for normal measurement/feedback because it is intentionally small and JSON-safe.

Use `window.__MESURER_INSTANCE__` only when an agent needs advanced operations such as:

```text
pluginHost.load(plugin)
pluginHost.remove(id)
pluginHost.replace(plugin)
pluginHost.describe()
pluginHost.undo()/redo()
```

Wait for `window.__MESURER__.ready()` before relying on the plugin host being fully initialized.

## 8. Plugin runtime

Plugins may register:

- tools;
- commands;
- hooks;
- overlays;
- settings contributions;
- scoped state slices;
- opaque services;
- disposal callbacks.

State slices can opt into:

```ts
history: true
persist: true
```

History-aware state participates in plugin undo/redo. Persisted state is stored beside the configured Mesurer persistence key when a mount uses `persistKey`.

Every registration belongs to the plugin that created it and must disappear when that plugin is removed or replaced.

## 9. Replacing a built-in

A plugin can replace a built-in without changing the agent-facing command name or conventional shortcut.

Register a replacement tool against the same `builtin` slot and give it its own command:

```ts
import { defineMesurerPlugin } from "@jhomra21/mesurer-solid/core";

const replacement = defineMesurerPlugin({
  id: "example.xray",
  provides: ["tool:xray"],
  setup(ctx) {
    ctx.state.register({
      id: "example.xray.enabled",
      initial: false,
      history: true,
    });

    ctx.command.register("example.xray.toggle", () => {
      ctx.state.update<boolean>("example.xray.enabled", (value) => !value);
    });

    ctx.tool.register({
      id: "xray",
      builtin: "xray",
      label: "Replacement X-ray",
      shortcut: "X",
      command: "example.xray.toggle",
      active: () => ctx.state.get("example.xray.enabled") === true,
    });
  },
});

await window.__MESURER__.ready();
await window.__MESURER_INSTANCE__?.pluginHost?.replace(replacement);
await window.__MESURER__.command("builtin.xray");
```

Mesurer hides the legacy control while the replacement is active and delegates the stable `builtin.xray` route to the replacement contribution. Nested command delegation is treated as one history transaction rather than creating duplicate undo checkpoints.

## 10. Renderer-aware plugin UI

After the renderer bridge loads, it provides the opaque service capability:

```text
runtime:solid
```

The public package does **not** currently export a named `MesurerSolidRuntimeService` type. Do not import that type from `@jhomra21/mesurer-solid`.

If a plugin needs renderer-owned UI, request the service structurally through the public plugin service API:

```ts
import { defineMesurerPlugin } from "@jhomra21/mesurer-solid/core";

type RuntimeSolid = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  createInspectorMount(): {
    element: HTMLDivElement;
    dispose(): void;
  };
};

const plugin = defineMesurerPlugin({
  id: "example.overlay-ui",
  requires: ["runtime:solid"],
  setup(ctx) {
    const runtime = ctx.service.get<RuntimeSolid>("runtime:solid");
    if (!runtime) throw new Error("Missing runtime:solid service");

    const mount = runtime.createInspectorMount();
    mount.element.textContent = "Plugin UI";
    ctx.lifecycle.onDispose(() => mount.dispose());
  },
});
```

`createInspectorMount()` marks plugin-owned DOM as inspector UI so Mesurer does not measure or X-ray its own extension surface. Service values never enter plugin history/persistence; `describe()` exposes service IDs, not service object values.

## 11. Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages all use the same public `@jhomra21/mesurer-solid` mount/injection boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's own UI renderer remains implemented in Solid 2, but that runtime is private to the Mesurer browser island.
- Electron main-process code is not a DOM host. Mount or inject only in renderer pages.
- Browser transport and browser ownership belong to the outer harness, not Mesurer.

## 12. Public package contract

Only one npm package is intended for users:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

These are subpath exports of the same npm package, not separate packages.

The root export includes the mount API, agent harness/types, plugin types/helpers, and built-in plugin factories. `/core` contains framework-neutral plugin/runtime primitives. `/inject` is the ES-module side-effect injector. `/inject-script` is the classic self-executing browser-evaluation payload.

## 13. Repository architecture invariants

Internal workspaces may remain separated for maintainability, but they are private implementation details:

- framework-neutral core must not depend on Solid, React, another renderer, Electron, or browser globals;
- DOM helpers own canonical browser measurements;
- `packages/renderer` owns the Solid 2 UI/reactive adapter;
- `packages/mesurer` owns the one public package, isolated mount, public core bundle, and injection payloads;
- built-in and external features use the same plugin host;
- the staged npm artifact must not expose private workspace names or host runtime dependencies;
- default rendering must retain the pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright when the outer harness already has browser execution capability.

## 14. Repository contribution instructions

Use Bun for repository development:

```bash
bun install
bun run dev
```

Before considering source changes complete, run the core validation set:

```bash
bun run typecheck
bun run test
bun run build
```

For changes that affect the browser/package boundary, also inspect the relevant package-smoke, host-compatibility, browser, and visual-parity workflows.

When changing public behavior:

1. update the root README and npm package README when the public capability or API changes;
2. update this file when the agent contract, browser boundary, command surface, or plugin rules change;
3. preserve the one-package public contract unless intentionally redesigning it;
4. keep built-in command names stable when replacing implementation details;
5. add regression coverage for bugs that would otherwise recur silently;
6. do not bypass the pinned visual/interaction parity gates for default-renderer changes.

For normal releases, follow [`RELEASING.md`](./RELEASING.md). Do **not** manually edit the public package version, create release tags, or manually `npm publish` as a substitute for the repository release workflow.

## 15. Development-only injection

`@jhomra21/mesurer-solid/inject` and `@jhomra21/mesurer-solid/inject-script` are intended for development, testing, and coding-agent harnesses. They do not open a network port or expose a remote-control service by themselves.
