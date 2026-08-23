# Mesurer Solid agent instructions

Mesurer Solid is designed to be attached by coding agents from the **same browser harness they already use** to inspect and test a user's application.

The core rules are simple:

> The outer harness owns the browser. Mesurer owns measurement, inspection, Mesurer commands, and the extension runtime.

> For meaningful UI/design work, the **rendered browser result is the source of truth**. Do not claim a layout, spacing, alignment, typography, or overflow result is correct merely because the source CSS looks correct. Measure the rendered result with Mesurer and pair it with a screenshot.

Do not build a second browser-control stack around Mesurer.

## Zero-mutation default for host projects

**Default host-project mutation budget: zero.** Using Mesurer from an agent should normally require no changes to the target application's source or build.

If the existing browser, Electron, WebView, or automation harness can evaluate JavaScript in the target renderer, install/resolve `@jhomra21/mesurer-solid` in the agent environment, read `@jhomra21/mesurer-solid/inject-script`, and evaluate that payload through the harness that already owns the page.

Use this decision order:

1. existing browser JavaScript execution → inject `/inject-script`;
2. existing browser/Electron CDP session → attach with the existing harness, then inject;
3. ordinary packaged app that can be launched with CDP/debug evaluation → launch the **same artifact**, attach, then inject;
4. only when the user explicitly wants a persistent embedded development tool, or no external renderer-evaluation path exists → consider `mountMeasurer()` from application source.

Do **not** add commands such as `start:mesurer` or `package:mesurer`, Vite/environment flags, custom Playwright adapters, new CDP clients, alternate app builds, Electron main/preload wiring, or other project-specific scaffolding as the default way to use Mesurer. Such conveniences are optional only after the canonical injection path works and only when the user explicitly wants that persistent workflow.

For packaged applications, artifact-faithful inspection means the normal package contains no Mesurer code. Launching that exact artifact with a debugging/evaluation channel enabled does not make it a different build. Prefer that workflow over compiling Mesurer into a special inspection package.

If an already-running packaged app exposes no renderer-evaluation channel, explain that limitation. Do not mutate the application just to manufacture a Mesurer path unless the user asks for embedded integration.

## Upstream origin and attribution — preserve this

Mesurer Solid is an adaptation and extension of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), originally created by **Julien Thibeaut (`@ibelick`)**. This provenance is part of the repository's identity, not incidental boilerplate.

When editing this repository:

- preserve clear attribution to the original Mesurer project and Julien Thibeaut in the README, [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), and any documentation that discusses the project's origin or upstream parity;
- never rewrite documentation, package copy, release notes, or outreach material in a way that implies Mesurer Solid, the baseline Mesurer UI, or the original measurement tool originated in this repository;
- do not remove or obscure the upstream repository link, copyright notice, MIT license attribution, or references to the pinned upstream visual/behavioral contract;
- distinguish upstream-derived work from later Mesurer Solid extensions. It is appropriate to describe this repository's Solid 2 port, framework-independent package boundary, agent bridge, plugin runtime, host-page isolation, Trusted Types renderer, and other new work as extensions, but do not retroactively attribute those additions to the upstream author;
- if documentation is reorganized, **move attribution rather than deleting it**, and keep it easy for users to discover;
- treat a change that weakens or hides upstream attribution as a documentation regression that must be corrected before merge.

The authoritative third-party license notice remains [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

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

On browsers with Popover API support, the outer Mesurer host is also promoted into the browser top layer so ordinary application stacking contexts and ancestor clipping cannot cover the inspector. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

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
  topLayer: true,
  excludePlugins: ["color-picker"],
  persistKey: "project:mesurer",
};
```

`target` is a CSS selector and defaults to `document.body`. `globalName` defaults to `__MESURER__`. `topLayer` defaults to `true`. Other fields are normal mount options except direct `target` elements and the `agent` option.

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

### Context, annotations, review, and capture

The `/inject` and `/inject-script` entry points load the removable `mesurer.context` plugin by default. Source-mounted applications opt in with `plugins: [contextPlugin()]`. Set `window.__MESURER_CONFIG__ = { context: false }` before injection only when deliberately using the low-level inspector without context UI.

Dynamic capabilities are part of plugin readiness, so always wait before reading them:

```js
await window.__MESURER__.ready();
const capabilities = window.__MESURER__.capabilities();
```

When `capabilities.capabilities.context` is true, the same bridge exposes:

```ts
context(request?: MesurerContextRequest): Promise<MesurerContextV1>
contextText(request?: MesurerContextRequest): Promise<string>
annotations(): Promise<MesurerAnnotation[]>
review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>
capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>
prepareCapture(): Promise<void>
finishCapture(): Promise<void>
sendContext(request?: MesurerContextRequest): Promise<void>
```

Use the smallest useful scope:

```js
await window.__MESURER__.context(); // workspace
await window.__MESURER__.context({ scope: "selection" });
await window.__MESURER__.context({ annotation: annotationId });
```

`MesurerContextV1.regions` carries explicit selected/annotated viewport rectangles, including region-only annotations with no DOM target. `visualContext` contains only the guides, measurements, and held distances relevant to that scope. The note is human intent; rendered geometry and screenshots are evidence.

Annotations retain the exact live DOM node while it remains connected. After DOM replacement/HMR, rebinding is deliberately conservative and is restricted to the configured page target/tree. Strong identity or a unique compatible weaker fingerprint may rebind; ambiguous or out-of-scope candidates must leave the annotation stale rather than attach human intent to the wrong element.

`review(annotationId)` compares the immutable scoped baseline against the current render using stable annotation/evidence IDs. Evidence that moves outside current annotation relevance is still compared through the complete live workspace and is **not** called missing. `kind: "missing"` means that baseline evidence no longer exists in the workspace.

Mesurer plans screenshot evidence but does not own screenshot capture. Use the outer harness and always restore Mesurer presentation in `finally`:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId });
await window.__MESURER__.prepareCapture();
try {
  // Capture the real viewport, and plan.captures focus clip when present,
  // using the browser/Electron harness that already owns the page.
} finally {
  await window.__MESURER__.finishCapture();
}
```

Capture preparation hides Mesurer chrome while retaining useful evidence, and restoration must preserve the exact prior inline presentation. Do not replace this with DOM-to-canvas rendering or add a second browser driver.

The portable Agent Skill installer leaves both `SKILL.md` and the exact built `assets/inject-script.js` under `.agents/skills/mesurer-ui`, so an agent can inject that asset through its existing browser channel without keeping Mesurer in the host application's dependencies.

## 4. Required design feedback loop

For every **meaningful visual change**, use Mesurer before claiming completion.

A meaningful visual change includes layout, alignment, spacing, sizing, typography, responsive behavior, overflow/clipping, component geometry, visual hierarchy, or recreating/polishing a design.

After the edit or HMR update:

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
Outer-harness screenshot  → pixels, composition, hierarchy, clipping, visual regressions
```

Do not infer exact spacing from screenshots when Mesurer can measure it directly. Do not assume a CSS declaration proves the browser rendered the intended result. Do not expect Mesurer to take the screenshot for you.

Validate the claims that matter to the user's request. Examples:

- “These two edges align” → compare their rendered rect edges.
- “The gap is 16 px” → use `distance()` and/or box-model measurements.
- “All cards are the same width” → use `inspectAll()` and compare widths.
- “The font is correct” → check computed typography after fonts settle.
- “There is no horizontal overflow” → inspect `viewport()` and relevant scroll metrics.
- “This responsive layout works at this viewport” → inspect rendered flex/grid/rect state at that viewport.

When a selector matches many nodes, use `inspectAll(selector, limit)` or narrow the selector. The default `inspectAll` limit is 50.

The full design workflow is documented in [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md).

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

## 6. Host-page isolation rule

Do not fix website-specific occlusion bugs with hostname checks or selectors for that website.

The public mount boundary must defend against the underlying browser primitive. Current invariants include:

- protected outer-host styles;
- ShadowRoot renderer isolation;
- browser top-layer promotion through a manual popover when supported;
- reassertion above later observable popovers/fullscreen changes;
- temporary reparenting into observable active modal dialogs so Mesurer does not become inert;
- a hardened fixed/max-`z-index` compatibility fallback.

Package-smoke tests adversarial classes such as global `!important` host CSS, transformed/paint-contained/overflow-clipped ancestors, extreme `z-index` overlays, later popovers, and modal dialogs using the exact packed npm artifact.

When a new host-page bug is reported, reduce it to the browser primitive that caused it, add a regression for that primitive, and fix the shared mount boundary. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

## 7. Built-in features and stable commands

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

## 8. Advanced mounted instance

Injection also exposes:

```text
window.__MESURER_INSTANCE__
```

Use `window.__MESURER__` for normal measurement/feedback because it is intentionally small and JSON-safe.

Use `window.__MESURER_INSTANCE__` only when an agent needs advanced operations such as:

```text
hostLayer
bringToFront()
pluginHost.load(plugin)
pluginHost.remove(id)
pluginHost.replace(plugin)
pluginHost.describe()
pluginHost.undo()/redo()
```

`hostLayer` reports `"top-layer"` or `"fixed"`. `bringToFront()` reasserts the Mesurer host in the browser top layer when an integration knows another overlay has just been opened.

Wait for `window.__MESURER__.ready()` before relying on the plugin host being fully initialized.

## 9. Plugin runtime

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

### Prefer plugins for project-specific requests

A user may ask their coding agent to extend Mesurer in plain language, for example:

> “Add a Mesurer plugin that reports cards that do not align to our 8 px grid.”

> “Add a tool that highlights overflowing containers.”

> “Replace X-ray with an overlay that labels our design-system components.”

Implement project-specific inspection behavior as a plugin by default. Modify Mesurer core only when the missing behavior is genuinely a platform capability shared by integrations.

## 10. Replacing a built-in

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

## 11. Renderer-aware plugin UI

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

## 12. Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages all use the same public `@jhomra21/mesurer-solid` mount/injection boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's own UI renderer remains implemented in Solid 2, but that runtime is private to the Mesurer browser island.
- Electron main-process code is not a DOM host. Mount or inject only in renderer pages.
- For packaged apps, prefer the ordinary artifact plus an existing renderer-evaluation/debugging channel over a Mesurer-specific package build.
- Browser transport and browser ownership belong to the outer harness, not Mesurer.

## 13. Public package contract

Only one npm package is intended for users:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

These are subpath exports of the same npm package, not separate packages.

The root export includes the mount API, agent harness/types, plugin types/helpers, and built-in plugin factories. `/core` contains framework-neutral plugin/runtime primitives. `/inject` is the ES-module side-effect injector. `/inject-script` is the classic self-executing browser-evaluation payload.

The published npm artifact also includes a concise `AGENT_INTEGRATION.md` so agents inspecting only the installed package still receive the inject-first contract.

## 14. Repository architecture invariants

Internal workspaces may remain separated for maintainability, but they are private implementation details:

- framework-neutral core must not depend on Solid, React, another renderer, Electron, or browser globals;
- DOM helpers own canonical browser measurements;
- `packages/renderer` owns the Solid 2 UI/reactive adapter;
- `packages/mesurer` owns the one public package, isolated mount, public core bundle, and injection payloads;
- built-in and external features use the same plugin host;
- the staged npm artifact must not expose private workspace names or host runtime dependencies;
- default rendering must retain the pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright when the outer harness already has browser execution capability;
- agent integrations should not mutate the host project when an existing renderer-evaluation path is available;
- host-page occlusion fixes must target browser primitives, not specific websites.

## 15. Repository contribution instructions

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
2. update this file and the shipped `packages/mesurer/AGENT_INTEGRATION.md` when the agent contract or integration priority changes;
3. preserve the one-package public contract unless intentionally redesigning it;
4. keep built-in command names stable when replacing implementation details;
5. add regression coverage for bugs that would otherwise recur silently;
6. reduce host-page compatibility bugs to browser primitives instead of adding site-specific patches;
7. do not bypass the pinned visual/interaction parity gates for default-renderer changes;
8. preserve the upstream Mesurer/Julien Thibeaut attribution invariant above and the authoritative notice in `THIRD_PARTY_LICENSES.md`;
9. keep runtime injection ahead of source integration in agent-facing documentation unless the public contract intentionally changes.

For normal releases, follow [`RELEASING.md`](./RELEASING.md). Do **not** manually edit the public package version, create release tags, or manually `npm publish` as a substitute for the repository release workflow.

## 16. Development-only injection

`@jhomra21/mesurer-solid/inject` and `@jhomra21/mesurer-solid/inject-script` are intended for development, testing, and coding-agent harnesses. They do not open a network port or expose a remote-control service by themselves.
