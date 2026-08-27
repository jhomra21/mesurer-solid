# Mesurer Solid agent instructions

Mesurer Solid is designed to be used by coding agents through the **same browser harness they already use** to inspect and test an application.

The core rules are:

> The outer harness owns the browser and the coding task. Mesurer owns measurement, inspection, annotations, visual context, commands, and its extension runtime.

> Mesurer is shared visual state between the human and the agent. A human can select, measure, place guides, hold distances, enable X-ray/rulers, or add notes in the real page; the agent reads that same state from `window.__MESURER__`.

> For meaningful UI/design work, the **rendered browser result is the source of truth**. Source CSS and a successful build do not prove rendered spacing, alignment, typography, dimensions, or overflow.

There is no required Mesurer MCP, WebMCP, ACP, localhost feedback daemon, chat/session bridge, or harness-specific agent transport in the normal workflow.

## Zero-mutation default for host projects

**Default host-project mutation budget: zero.** Using Mesurer from an agent should normally require no changes to the target application's source or build.

Use this decision order:

1. Mesurer already exists in the current page → **reuse it and read its state**;
2. existing browser JavaScript execution → inject `/inject-script` only when Mesurer is absent;
3. existing browser/Electron CDP session → attach with the existing harness, then inject only when absent;
4. ordinary packaged app that can be launched with CDP/debug evaluation → launch the **same artifact**, attach, then inject only when absent;
5. only when the user explicitly wants a persistent embedded development tool, or no external renderer-evaluation path exists → consider `mountMeasurer()` from application source.

Do **not** add commands such as `start:mesurer` or `package:mesurer`, special Vite/environment flags, custom browser stacks, new CDP clients, alternate application builds, Electron main/preload wiring, MCP servers, or other project-specific scaffolding merely to make Mesurer available to an agent.

For packaged applications, artifact-faithful inspection means the normal package contains no Mesurer code. Launching that exact artifact with its existing debugging/evaluation channel enabled does not make it a different build.

If an already-running packaged app exposes no renderer-evaluation channel, explain that limitation. Do not mutate the application just to manufacture a Mesurer path unless the user asks for embedded integration.

## Upstream origin and attribution — preserve this

Mesurer Solid is an adaptation and extension of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), originally created by **Julien Thibeaut (`@ibelick`)**. This provenance is part of the repository's identity.

When editing this repository:

- preserve clear attribution to the original Mesurer project and Julien Thibeaut in the README, [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), and documentation that discusses origin/upstream parity;
- never imply that the original Mesurer measurement tool or baseline UI originated in this repository;
- do not remove or obscure the upstream repository link, copyright notice, MIT attribution, or pinned upstream parity references;
- distinguish upstream-derived behavior from Mesurer Solid extensions such as the Solid 2 port, framework-independent public package, agent/context workflow, plugin runtime, host-page isolation, and Trusted Types renderer;
- if documentation is reorganized, **move attribution rather than deleting it**;
- treat weakened upstream attribution as a documentation regression.

The authoritative third-party license notice remains [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## 1. Discover and preserve the current Mesurer instance

Before evaluating an injector, inspect the actual page:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, **use that exact instance**. Do not reinject, dispose, toggle off, or replace plugins merely because the agent began working.

The human may already have valuable live review state:

```text
current element/region selection
multi-selection
measurements
held distances
guides
rulers
X-ray state
saved annotations and baselines
```

That state is part of the user's visual message and must survive agent attachment.

Injected Mesurer also defaults to preserving a matching live injected instance. Deliberate replacement is explicit:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: false,
}
```

Use `reuseExisting: false` only for deliberate HMR/test/tooling replacement. Do not use it while consuming human review state.

## 2. Inject only when Mesurer is absent

A user application does **not** need to import Mesurer for agent use.

The portable Agent Skill includes `assets/inject-script.js`. If the package is already installed, the equivalent path is `mesurer-solid/inject-script`.

In a Node/Bun-side harness:

```js
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
)

const hasMesurer = await browser.evaluate(() => Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
))

if (!hasMesurer) {
  await browser.evaluate(source)
}

await browser.evaluate(() => window.__MESURER__.ready())
```

`inject-script.js` is self-contained. Mesurer's private Solid 2 renderer/runtime mounts in an isolated ShadowRoot and does not share or replace the host application's framework runtime.

On browsers with Popover API support, the outer host is promoted into the browser top layer so ordinary application stacking contexts and ancestor clipping cannot cover the inspector. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

Harnesses that specifically support module-script injection may use `mesurer-solid/inject`, but `/inject-script` is the portable default for generic page-evaluation APIs.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

The repository's `browser:harness` command is only a Playwright reference adapter for manual testing/CI; it is not the agent integration API. See [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md).

## 3. Read human visual context before editing

The `/inject` and `/inject-script` entry points load removable `mesurer.context` by default. Source-mounted applications opt in with `plugins: [contextPlugin()]`.

Always wait for readiness before dynamic capabilities:

```js
await window.__MESURER__.ready()
const capabilities = window.__MESURER__.capabilities()
```

When context is available, gather the human's state **before changing source**.

### Workspace

```js
const workspace = await window.__MESURER__.context()
```

Workspace context contains the meaningful rendered state, including:

```text
page + viewport + DPR + scroll
rulers/X-ray visibility
selected/referenced targets
guides
measurements
held distances
exact target rects
margin/padding/border
typography
appearance
flex/grid/layout properties
scroll dimensions and overflow
```

This is the right path for requests such as “look at the measurements I made” or “my layout is broken; inspect what I marked.”

### Current selection

Try selection-scoped context as well:

```js
let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {
  // No current selection is valid.
}
```

A selection may be one or more elements or a dragged viewport region. `regions` preserves element-free whitespace/alignment selections.

Do not require a human to save an annotation before their live selection, measurements, guides, or distances become useful.

### Saved annotations

```js
const annotations = await window.__MESURER__.annotations()

const annotationContexts = []
for (const annotation of annotations) {
  annotationContexts.push(
    await window.__MESURER__.context({ annotation: annotation.id })
  )
}
```

An annotation note is **human intent**. Geometry, computed styles, guides, measurements, distances, and screenshots are evidence supporting that intent.

If multiple annotations exist, do not silently inspect only the first one.

### Context data contract

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates. Its major fields are:

```text
scope
page
viewport
coordinateSpace
regions
visualState
  rulersVisible
  xrayVisible
targets[]
  ref
  inspection.selector
  inspection.rect
  margin / padding / border
  typography
  appearance
  layout
  scroll
visualContext
  guides[]
  measurements[]
  distances[]
```

Prefer these exact numbers over estimating geometry from screenshots or assuming CSS declarations match the rendered result.

## 4. Interpret Mesurer evidence correctly

Examples:

- target left edges differ by `4px` → they are not aligned;
- a held horizontal distance says `37px` → do not claim the gap is `24px` merely because a CSS rule declares `gap: 24px`;
- a guide crossing targets is useful alignment evidence;
- rulers/X-ray state explains how the human is inspecting the page but is not automatically a design requirement;
- a selected region with no DOM target can still express whitespace/alignment intent;
- exact `margin`, `padding`, `border`, `fontSize`, `lineHeight`, grid/flex values, and overflow come from the browser's computed state.

The rendered page is the source of truth.

## 5. Capture real screenshots through the outer harness

Mesurer plans evidence but does not own browser screenshot capture.

For an annotation:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Capture the real viewport and optional focus clip through the existing harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

For the current selection, use `{ scope: "selection" }`.

Capture preparation hides Mesurer control chrome while preserving selection/annotation markers, rulers, guides, measurements, held distances, and pixel labels.

Use both signals:

```text
Mesurer structured data → geometry, box model, computed styles, overflow
outer-harness screenshot → pixels, composition, hierarchy, clipping, appearance
```

Do not use DOM-to-canvas approximations when the harness can capture the real rendered browser.

## 6. Edit through the normal project workflow

After reading initial visual state, edit the real implementation using the normal source-editing tools for the project.

Do not mutate human guides/measurements merely to make evidence match your implementation. They are review state, not test fixtures.

Let the normal dev server/HMR update the page. If the application must be relaunched, use the harness's ordinary flow rather than creating a Mesurer-specific one.

## 7. Revalidate after every meaningful visual change

A meaningful visual change includes layout, alignment, spacing, sizing, typography, responsive behavior, overflow/clipping, component geometry, visual hierarchy, or recreating/polishing a design.

After the edit/render:

```js
await window.__MESURER__.stable()
```

### Annotation baseline

When the human created an annotation:

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` compares the immutable baseline against fresh rendered evidence using stable annotation target/evidence identity. It reports exact before/current/delta pixel values and explicit `kind: "missing"` evidence when relevant baseline targets/guides/measurements/distances disappear.

Examples:

```text
horizontal gap: 37px → 24px
left-edge mismatch: 4px → 0px
card width: 318px → 320px
expected target/guide/measurement missing
```

If the intended result is still wrong, keep editing.

### Unsaved selection/workspace

If the human did not save an annotation, retain the initial workspace/selection object in the agent task and re-read current context after the edit:

```js
const currentWorkspace = await window.__MESURER__.context()
```

For focused checks, use selectors from the initial context:

```js
window.__MESURER__.inspect(selector)
window.__MESURER__.inspectAll(selector)
window.__MESURER__.distance(selectorA, selectorB)
window.__MESURER__.viewport()
await window.__MESURER__.feedback([selectorA, selectorB])
```

The before/after snapshots already live inside the current agent task. No network delivery protocol is required.

## 8. HMR and stale-target handling

Annotations keep the exact live DOM node while it remains connected. After DOM replacement/HMR, Mesurer rebinds conservatively:

- strong identity such as `id`/`data-testid` must remain compatible;
- weaker fingerprints require compatible tag/classes/accessibility/text identity;
- weak matches must resolve uniquely;
- ambiguous/incompatible replacements remain stale.

If `targetStatus` is `stale` or `partial`, do not silently transfer the human's intent to another element. Use the note, stored baseline/selectors, current DOM, and screenshot; if identity is genuinely ambiguous, ask the human to reselect.

An unsaved selection may disappear when HMR replaces its node. This is why the agent must gather initial context **before** editing.

## 9. Completion standard

For visual work, this is insufficient by itself:

```text
lint passed
typecheck passed
tests passed
build passed
```

Those are implementation checks, not rendered proof.

A strong completion can cite evidence actually measured, for example:

```text
- target cards now measure 320px wide
- horizontal distance is 24px
- selected left edges differ by 0px
- document horizontal overflow is false
- annotation review reports the requested geometry change
- current screenshot shows no clipping/regression
```

Only claim measurements you actually observed.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## 10. Browser ownership boundary

Mesurer does **not** provide or own:

- navigation;
- clicking or typing;
- screenshots;
- tabs/windows;
- authentication/session management;
- browser process lifetime;
- agent chat/thread/task routing;
- MCP/WebMCP/ACP transport;
- source-file editing;
- dev-server ownership.

Use the outer harness for those operations.

Mesurer provides exact page inspection, annotations/context/review, Mesurer command execution, Mesurer/plugin state, runtime plugin management, and the interactive UI.

## 11. Host-page isolation rule

Do not fix website-specific occlusion bugs with hostname checks or selectors for that website.

The public mount boundary must defend against browser primitives. Current invariants include:

- protected outer-host styles;
- ShadowRoot renderer isolation;
- browser top-layer promotion through a manual popover when supported;
- reassertion above later observable popovers/fullscreen changes;
- temporary reparenting into active modal dialogs so Mesurer does not become inert;
- hardened fixed/max-`z-index` compatibility fallback.

Package-smoke tests adversarial host CSS, transformed/paint-contained/overflow-clipped ancestors, extreme z-index overlays, later popovers, and modal dialogs using the exact packed npm artifact.

When a host-page bug appears, reduce it to the browser primitive, add a regression for that primitive, and fix the shared mount boundary. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

## 12. Built-in features and stable commands

Default renderer:

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

Stable built-in command routes:

```text
builtin.select
builtin.xray
builtin.color-picker
builtin.rulers
builtin.text-inspector
builtin.guides
builtin.settings
```

Distance is currently an overlay capability and does not expose `builtin.distance`.

Commands use the same behavior path as visible Mesurer controls.

## 13. Advanced mounted instance

Injection also exposes:

```text
window.__MESURER_INSTANCE__
```

Use `window.__MESURER__` for normal JSON-safe measurement/context work.

Use `window.__MESURER_INSTANCE__` only for advanced operations such as:

```text
hostLayer
bringToFront()
pluginHost.load(plugin)
pluginHost.remove(id)
pluginHost.replace(plugin)
pluginHost.describe()
pluginHost.undo()/redo()
```

Do not remove/replace plugins on a human's live review instance unless the task explicitly involves modifying Mesurer itself.

## 14. Plugin runtime

Plugins may register:

- tools;
- commands;
- hooks;
- overlays;
- settings contributions;
- scoped state slices;
- opaque services;
- disposal callbacks.

State slices can opt into history/persistence. Every registration belongs to the plugin that created it and must disappear when that plugin is removed or replaced.

### Prefer plugins for project-specific Mesurer extensions

A user may ask:

> “Add a Mesurer plugin that reports cards that do not align to our 8 px grid.”

> “Add a tool that highlights overflowing containers.”

> “Replace X-ray with an overlay that labels our design-system components.”

Implement project-specific inspection behavior as a plugin by default. Modify core only when the missing behavior is genuinely a shared platform capability.

## 15. Replacing a built-in

A plugin can replace a built-in while retaining the stable `builtin.*` command and conventional shortcut by registering against the same `builtin` slot.

Nested command delegation is one history transaction rather than duplicate undo checkpoints.

## 16. Renderer-aware plugin UI

After the renderer bridge loads it provides opaque service capability:

```text
runtime:solid
```

The public package does not expose private renderer workspace types. Request the service structurally through the public plugin service API and use `createInspectorMount()` for plugin-owned inspector UI.

Plugin service object values never enter history/persistence; `describe()` exposes service IDs only.

## 17. Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages use the same public `mesurer-solid` mount/injection boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's UI renderer remains Solid 2 internally but is private to its isolated browser island.
- Electron main-process code is not a DOM host; mount/inject only in renderer pages.
- For packaged apps, prefer the ordinary artifact plus an existing renderer-evaluation/debug channel over a Mesurer-specific build.
- Browser transport and ownership belong to the outer harness.

## 18. Public package contract

One npm package is intended for users:

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

These are subpath exports of the same package.

The root export includes mount API, agent/context types, plugin types/helpers, and built-in plugin factories. `/core` contains framework-neutral plugin/runtime primitives. `/inject` is the ES-module injector. `/inject-script` is the classic self-executing browser-evaluation payload.

The published artifact includes `AGENT_INTEGRATION.md`, the portable Agent Skill, and the exact skill injector asset.

## 19. Repository architecture invariants

Internal workspaces are private implementation details:

- framework-neutral core must not depend on Solid, React, another renderer, Electron, or browser globals;
- DOM helpers own canonical browser measurements;
- `packages/renderer` owns the private Solid 2 UI/reactive adapter;
- `packages/mesurer` owns the one public package and injection artifacts;
- built-in and external features use the same plugin host;
- staged npm artifacts must not expose private workspace names or host runtime dependencies;
- default rendering must retain pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright or another transport when the outer harness already has page execution;
- agent integrations must preserve a live human Mesurer instance by default;
- host-page occlusion fixes target browser primitives, not specific websites.

## 20. Repository contribution instructions

Use Bun for repository development:

```bash
bun install
bun run dev
```

Before considering source changes complete:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

For browser/package-boundary changes, also inspect relevant package-smoke, host-compatibility, browser, and visual-parity workflows.

When changing public behavior:

1. update root/package README documentation when public capability/API changes;
2. update this file, the shipped `packages/mesurer/AGENT_INTEGRATION.md`, and the canonical `mesurer-ui` skill when the agent contract changes;
3. keep repository/package skill copies identical;
4. preserve the one-package public contract unless intentionally redesigning it;
5. keep built-in command names stable when replacing implementation details;
6. add regression coverage for silent failure modes;
7. reduce host compatibility bugs to browser primitives rather than site-specific patches;
8. do not bypass pinned visual/interaction parity gates for default-renderer changes;
9. preserve upstream Mesurer/Julien Thibeaut attribution and `THIRD_PARTY_LICENSES.md`;
10. keep direct existing-harness integration ahead of source integration in agent-facing docs.

For normal releases, follow [`RELEASING.md`](./RELEASING.md). Do **not** manually edit public package versions, create release tags, or manually `npm publish` as a substitute for the release workflow.

## 21. Development-only injection

`mesurer-solid/inject` and `mesurer-solid/inject-script` are intended for development, testing, and coding-agent harnesses. They do not open a network port, expose a remote-control service, or require an agent transport by themselves.
