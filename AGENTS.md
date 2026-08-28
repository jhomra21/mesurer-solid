# Mesurer Solid agent instructions

Mesurer Solid is designed to be used by coding agents through the **same browser harness they already use** to inspect and test an application.

The core rules are:

> The outer harness owns the browser and coding task. Mesurer owns measurement, inspection, annotations, visual context, commands, and its extension runtime.

> Mesurer is shared visual state between the human and the agent. A human can select, measure, place guides, hold distances, enable X-ray/rulers, or add notes in the real page; the agent reads that same state from `window.__MESURER__`.

> **Context is the expected output of Mesurer agent work.** For meaningful visual work, consume existing human context before editing and obtain fresh Mesurer context/review for the affected rendered UI before claiming completion.

> The rendered browser result is the source of truth. Source CSS and a successful build do not prove rendered spacing, alignment, typography, dimensions, or overflow.

There is no required Mesurer MCP, WebMCP, ACP, localhost feedback daemon, chat/session bridge, or harness-specific transport in the normal workflow.

## Zero-mutation default for host projects

Default host-project mutation budget is zero. Using Mesurer from an agent should normally require no changes to the target application's source or build.

Use this decision order:

1. Mesurer already exists in the current page → reuse it and read its state;
2. existing browser JavaScript execution → inject `/inject-script` only when Mesurer is absent;
3. existing browser/Electron CDP session → attach through the existing harness, then inject only when absent;
4. ordinary packaged app with a renderer-evaluation/debug channel → use the same artifact and inject only when absent;
5. only when the user explicitly wants persistent embedded tooling, or no external renderer-evaluation path exists → consider `mountMeasurer()` from application source.

Do not add `start:mesurer`, `package:mesurer`, special Vite/environment flags, custom browser stacks, new CDP clients, alternate application builds, Electron main/preload wiring, MCP servers, or other project-specific scaffolding merely to make Mesurer available to an agent.

If an already-running packaged app exposes no renderer-evaluation channel, explain the limitation. Do not mutate the application merely to manufacture a Mesurer path unless the user requests embedded integration.

## Upstream origin and attribution — preserve this

Mesurer Solid is an adaptation and extension of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), originally created by **Julien Thibeaut (`@ibelick`)**. This provenance is part of the repository's identity.

When editing this repository:

- preserve clear attribution to the original Mesurer project and Julien Thibeaut in the README, [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), and documentation discussing origin/upstream parity;
- never imply the original Mesurer measurement tool or baseline UI originated in this repository;
- do not remove or obscure the upstream repository link, copyright notice, MIT attribution, or pinned upstream parity references;
- distinguish upstream-derived behavior from Mesurer Solid extensions such as the Solid 2 port, framework-independent public package, agent/context workflow, plugin runtime, host-page isolation, and Trusted Types renderer;
- if documentation is reorganized, move attribution rather than deleting it;
- treat weakened upstream attribution as a documentation regression.

The authoritative third-party notice is [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## 1. Discover and preserve the current Mesurer instance

Before evaluating an injector:

```js
const hasMesurer = Boolean(
  window.__MESURER__ &&
  window.__MESURER_INSTANCE__?.element?.isConnected
)

if (hasMesurer) {
  await window.__MESURER__.ready()
}
```

If Mesurer exists, use that exact instance. Do not reinject, dispose, toggle off, or replace plugins merely because the agent began working.

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

That state is part of the user's visual message. Read it before changing selection yourself.

Injected Mesurer defaults to preserving a live injected instance. Deliberate replacement is explicit:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: false,
}
```

Use that only for deliberate tests/tooling replacement, not while consuming human review state.

## 2. Inject only when Mesurer is absent

A user application does not need to import Mesurer for agent use.

The portable Agent Skill includes `assets/inject-script.js`. If the package is installed, the equivalent path is `mesurer-solid/inject-script`.

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

Harnesses that specifically support module injection may use `mesurer-solid/inject`, but `/inject-script` is the portable default for generic page-evaluation APIs.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

The repository's browser harness is a reference/CI adapter, not the agent integration API.

## 3. Context-returning agent contract

The `/inject` and `/inject-script` entry points load removable `mesurer.context` by default. Source-mounted applications opt in with `plugins: [contextPlugin()]`.

Always wait for readiness before dynamic capabilities:

```js
await window.__MESURER__.ready()
const capabilities = window.__MESURER__.capabilities()
```

The context-oriented capability surface is:

```text
context
select
annotations
review
capturePlan
```

`select` is programmatic agent/harness functionality. It does not add a human context toolbar button. Human context controls remain Copy Context, Copy Selection, and Add Note.

There is no `sendContext()` or send/delivery capability.

### Context acquisition precedence

When Mesurer is available, use this exact order.

#### A. Existing human context → consume it first

```js
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

For relevant annotations:

```js
const annotationContext = await window.__MESURER__.context({
  annotation: annotation.id,
})
```

Do not overwrite a meaningful human selection until you have retained its context in the current task.

#### B. No relevant selection + intended target ambiguous → ask the user

If you cannot confidently map the user's request to exact rendered target(s) or a region, ask the user to select the intended element(s) or region in Mesurer. Then immediately read:

```js
const selection = await window.__MESURER__.context({ scope: "selection" })
```

Do not guess simply to avoid asking for visual disambiguation.

#### C. No relevant selection + exact target known → use `select()`

If you know exactly which rendered elements correspond to the change, select them yourself:

```js
const context = await window.__MESURER__.select("#pricing-card")
```

or:

```js
const context = await window.__MESURER__.select([
  "#pricing-card",
  "#pricing-cta",
])
```

`select()`:

1. enables Mesurer and switches to Select;
2. visibly highlights the targets;
3. makes them the live selection;
4. waits for the visual state to settle;
5. **returns selection-scoped `MesurerContextV1`**.

Consume that return value. Do not call `select()` only to draw outlines and then ignore the context.

Every selector must resolve to exactly one target inside the page target. Invalid, missing, or ambiguous selectors throw. Refine the selector or ask the user to select the target; do not guess.

Do not ask the user to select something the agent can identify exactly itself.

## 4. Read and interpret context correctly

`MesurerContextV1` is JSON-safe and uses `viewport-css-px` coordinates. Major fields are:

```text
scope
page
viewport + devicePixelRatio + scroll
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
  scroll / overflow
visualContext
  guides[]
  measurements[]
  distances[]
```

Prefer these exact numbers over screenshot estimates or source assumptions.

Examples:

- target left edges differ by `4px` → not aligned;
- rendered gap is `37px` → do not claim `24px` merely because CSS declares `gap: 24px`;
- width is `318px` → do not report `320px` until the browser actually measures it;
- overflow flags are true → the rendered result is overflowing even if source math looked correct.

Annotation notes are human intent. Geometry, styles, guides, measurements, distances, and screenshots are supporting evidence.

## 5. Multi-selection is relational

When multiple targets are selected, do not collapse them to a count or inspect only the first element.

For every selected target consume:

```text
selector / identity / text / accessibility
rect: x / y / left / top / right / bottom / width / height
margin / padding / border
typography
appearance
layout / flex / grid / gap / transform / overflow
scroll/client dimensions
```

Then inspect useful relationships. Use `selection.visualContext.distances` first. For a needed pair not represented there:

```js
window.__MESURER__.distance(selectorA, selectorB)
```

For small selections, return useful unique pair relationships. For large repeated selections, focus on adjacent/repeated/user-relevant pairs instead of dumping O(n²) output.

## 6. Capture real screenshots through the outer harness

Mesurer plans evidence but does not own screenshot capture.

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // Capture through the existing browser harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture preparation hides Mesurer control chrome while preserving selection/annotation markers, rulers, guides, measurements, held distances, and pixel labels.

Use both signals:

```text
Mesurer structured context → exact geometry, styles, distances, overflow
outer-harness screenshot    → pixels, composition, hierarchy, clipping, appearance
```

## 7. Edit through the normal project workflow

After reading initial visual state, edit the real implementation using the project's normal tools.

Do not mutate human guides, measurements, distances, annotations, or selection just to make evidence match the implementation.

Let the normal dev server/HMR update the page. If the application must be relaunched, use the harness's ordinary flow.

## 8. Fresh context is required after meaningful visual changes

Meaningful visual changes include layout, spacing, sizing, alignment, typography, responsiveness, overflow/clipping, component geometry, hierarchy, and design recreation/polish.

After editing:

```js
await window.__MESURER__.stable()
```

Then obtain fresh evidence using the strongest path.

### Human annotation exists

```js
const review = await window.__MESURER__.review(annotationId)
```

`review()` compares immutable baseline against fresh rendered evidence and reports exact before/current/delta values and missing evidence.

### Human selection still represents the changed UI

```js
const after = await window.__MESURER__.context({ scope: "selection" })
```

Re-check the same target dimensions and pair relationships recorded before the edit.

### Agent knows exact affected rendered target(s)

Proactively highlight them and receive fresh context:

```js
const after = await window.__MESURER__.select([
  changedSelectorA,
  changedSelectorB,
])
```

This is the preferred completion path when there was no human selection. The user can see what the agent changed and the agent receives exact rendered context in the same operation.

### Affected target is ambiguous after the change

Ask the user to select the intended result, then read selection context. Do not manufacture confidence from a guessed selector.

A visual task is not complete merely because Mesurer drew an outline. The agent must consume the returned context and reason from it.

## 9. HMR and stale-target handling

Annotations keep the exact live DOM node while connected and rebind conservatively after DOM replacement.

If `targetStatus` is `stale` or `partial`, do not silently transfer human intent to another element. Use the note, stored baseline/selectors, current DOM, and screenshot; if identity remains ambiguous, ask the human to reselect.

An unsaved selection can disappear when HMR replaces nodes. Preserve initial context before editing. After render, use exact known selectors with `select()` when unambiguous or ask the user when identity is uncertain.

## 10. Completion standard

For meaningful visual work this is insufficient by itself:

```text
lint passed
typecheck passed
tests passed
build passed
```

Those are implementation checks, not rendered proof.

A strong completion cites measurements actually observed, for example:

```text
- selected cards now measure 320px wide
- rendered horizontal distance is 24px
- selected left edges differ by 0px
- document horizontal overflow is false
- annotation review reports 37px → 24px
- current screenshot shows no clipping regression
```

If Mesurer is available and the affected rendered UI can be identified, finishing without fresh Mesurer context/review is a workflow failure.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md) and [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md).

## 11. Browser ownership boundary

Mesurer does not provide or own:

- navigation;
- clicking or typing in the host app;
- screenshots;
- tabs/windows;
- authentication/session management;
- browser process lifetime;
- agent chat/thread/task routing;
- MCP/WebMCP/ACP transport;
- source editing;
- dev-server ownership.

Use the outer harness for those operations.

Mesurer provides exact page inspection, programmatic selection, annotations/context/review, commands, plugin state/runtime management, and the interactive UI.

## 12. Host-page isolation rule

Do not fix website-specific occlusion bugs with hostname checks or selectors for that website.

The public mount boundary must defend against browser primitives. Current invariants include protected outer-host styles, ShadowRoot isolation, browser top-layer promotion, reassertion above later popovers/fullscreen changes, temporary reparenting into active modal dialogs, and a hardened fixed/max-z-index fallback.

When a host-page bug appears, reduce it to the browser primitive, add a regression, and fix the shared mount boundary. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

## 13. Built-in features and stable commands

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

Stable command routes:

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

`window.__MESURER__.select(...)` is different from the `builtin.select` tool command: it is a context-layer agent helper that selects exact rendered targets and returns scoped context.

## 14. Advanced mounted instance

Injection also exposes:

```text
window.__MESURER_INSTANCE__
```

Use `window.__MESURER__` for normal JSON-safe context and measurement work.

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

## 15. Plugin runtime

Plugins may register tools, commands, hooks, overlays, settings contributions, scoped state, services, and lifecycle cleanup. State slices may opt into history/persistence. Every registration belongs to its plugin and must disappear when that plugin is removed/replaced.

Prefer plugins for project-specific Mesurer extensions. Modify core only when behavior is genuinely a shared platform capability.

## 16. Replacing a built-in

A plugin can replace a built-in while retaining the stable `builtin.*` command and conventional shortcut by registering against the same `builtin` slot.

Nested command delegation is one history transaction rather than duplicate undo checkpoints.

## 17. Renderer-aware plugin UI

After the renderer bridge loads it provides opaque service capability:

```text
runtime:solid
```

The public package does not expose private renderer workspace types. Request the service structurally through the public plugin service API and use `createInspectorMount()` for plugin-owned inspector UI.

Plugin service object values never enter history/persistence; `describe()` exposes service IDs only.

## 18. Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages use the same public boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's UI renderer remains Solid 2 internally but private to its isolated browser island.
- Electron main-process code is not a DOM host; mount/inject only in renderer pages.
- For packaged apps, prefer the ordinary artifact plus an existing renderer-evaluation/debug channel over a Mesurer-specific build.
- Browser transport and ownership belong to the outer harness.

## 19. Public package contract

One npm package is intended for users:

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

The root export contains the mount API, agent/context types, plugin helpers, and built-in plugin factories. `/core` is framework-neutral. `/inject` is the ES-module injector. `/inject-script` is the classic self-executing browser-evaluation payload.

The published artifact includes `AGENT_INTEGRATION.md`, the portable Agent Skill, and its injector asset.

## 20. Repository architecture invariants

Internal workspaces are private implementation details:

- framework-neutral core must not depend on Solid, React, another renderer, Electron, or browser globals;
- DOM helpers own canonical browser measurements;
- `packages/renderer` owns the private Solid 2 UI/reactive adapter;
- `packages/mesurer` owns the public package and injection artifacts;
- built-in and external features use the same plugin host;
- staged npm artifacts must not expose private workspace names or host runtime dependencies;
- default rendering must retain pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright or another transport when the outer harness already has page execution;
- agent integrations must preserve a live human Mesurer instance by default;
- programmatic agent selection must use canonical renderer selection/measurement semantics and return structured context;
- agent docs must teach context acquisition/consumption, not mere UI activation;
- host-page occlusion fixes target browser primitives, not specific websites.

## 21. Repository contribution instructions

Use Bun:

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

For browser/package-boundary changes, inspect package-smoke, host-compatibility, browser-contract, and visual-parity workflows.

When changing public behavior:

1. update root/package README documentation when public capability/API changes;
2. update this file, `packages/mesurer/AGENT_INTEGRATION.md`, and the canonical `mesurer-ui` skill when the agent contract changes;
3. keep repository/package skill copies identical;
4. preserve the one-package public contract unless intentionally redesigning it;
5. keep built-in command names stable when replacing implementation details;
6. add regression coverage for silent failure modes;
7. reduce host compatibility bugs to browser primitives rather than site-specific patches;
8. do not bypass pinned visual/interaction parity gates for default-renderer changes;
9. preserve upstream Mesurer/Julien Thibeaut attribution and `THIRD_PARTY_LICENSES.md`;
10. keep direct existing-harness integration ahead of source integration in agent-facing docs;
11. when Mesurer agent selection/context semantics change, test both the returned context and visible/live selection state.

For releases, follow [`RELEASING.md`](./RELEASING.md). Do not manually edit public package versions, create release tags, or manually `npm publish` as a substitute for the release workflow.

## 22. Development-only injection

`mesurer-solid/inject` and `mesurer-solid/inject-script` are for development, testing, and coding-agent harnesses. They do not open a network port, expose a remote-control service, or require an agent transport by themselves.

The direct integration remains:

```text
existing agent harness
  ↕ browser evaluate / screenshot
existing rendered page
  ↕
window.__MESURER__
  ↳ context() / select() / review()
```

**Context is the output.**