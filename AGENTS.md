# Mesurer Solid agent instructions

Mesurer Solid is designed to be used by coding agents through the **same browser harness they already use** to inspect and test an application.

The core rules are:

> The outer harness owns the browser and coding task. Mesurer owns measurement, inspection, annotations, visual context, Arrange/text Desired intent, commands, its extension runtime, and optional first-party human screenshot UI.

> Mesurer is shared visual state between the human and the agent. A human can select, measure, place guides, hold distances, enable X-ray/rulers, add notes, arrange elements, directly edit copy/typography into Desired state, or keep a screenshot preview open in the real page; the agent reads the relevant structured state from `window.__MESURER__` and preserves human review state.

> **Context is the expected output of Mesurer agent work.** For meaningful visual work, consume existing human context and saved intent before editing and obtain fresh Mesurer context/review/Live evidence for the affected rendered UI before claiming completion.

> The rendered browser result is the source of truth. Source CSS and a successful build do not prove rendered spacing, alignment, typography, copy, dimensions, or overflow.

There is no required Mesurer MCP, WebMCP, ACP, localhost feedback daemon, chat/session bridge, or harness-specific transport in the normal workflow.

The optional `mesurer.screenshot` camera is a human capture tool/service, not an agent-delivery channel. Ordinary coding-agent screenshot evidence continues to use the existing outer harness. See [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md).

Direct text editing is documented in [`docs/TEXT_EDITING.md`](./docs/TEXT_EDITING.md). It is a Mesurer Solid extension of the existing Select/Text Inspector workflow, not a competing top-level tool.

## Launch Evolution

Mesurer-solid has launched and has no users or production data in the deployed app that is needed or to worry about. Revisit this policy before the first production deployment.

- Optimize for the smallest coherent design that represents the product today.
- Remove obsolete code, schemas, APIs, configuration, aliases, and transitional paths directly.
- Do not add backward-compatibility shims, legacy aliases, dual-read or dual-write paths, or data-preserving backfills unless the user explicitly asks for them.
- Internal interfaces are not public compatibility contracts. Update their callers and tests atomically when they change.
- Development and test data are disposable. Prefer recreating those databases over complicating the product to preserve local data.
- Treat migration history as a replaceable development baseline, but keep the checked-in migration chain and setup workflow coherent. Do not rewrite an already-applied migration without also resetting affected development and test databases.
- Preserve database invariants, transactional safety, migration idempotence, and deterministic setup. These are correctness properties, not backward-compatibility requirements.
- Consolidate the migration baseline only as an explicit, coordinated change rather than as incidental work in a feature branch.

## Zero-mutation default for host projects

Default host-project mutation budget is zero. Using Mesurer from an agent should normally require no changes to the target application's source or build.

Use this decision order:

1. Mesurer already exists in the current page → reuse it and read its state;
2. existing browser JavaScript execution → inject `/inject-script` only when Mesurer is absent;
3. existing browser/Electron CDP session → attach through the existing harness, then inject only when absent;
4. ordinary packaged app with a renderer-evaluation/debug channel → use the same artifact and inject only when absent;
5. only when the user explicitly wants persistent embedded tooling, or no external renderer-evaluation path exists → consider `mountMesurer()` from application source.

Do not add `start:mesurer`, `package:mesurer`, special Vite/environment flags, custom browser stacks, new CDP clients, alternate application builds, Electron main/preload wiring, MCP servers, or other project-specific scaffolding merely to make Mesurer available to an agent.

If an already-running packaged app exposes no renderer-evaluation channel, explain the limitation. Do not mutate the application merely to manufacture a Mesurer path unless the user requests embedded integration.

## Upstream origin and attribution — preserve this

Mesurer Solid is an adaptation and extension of [`ibelick/mesurer`](https://github.com/ibelick/mesurer), originally created by **Julien Thibeaut (`@ibelick`)**. This provenance is part of the repository's identity.

When editing this repository:

- preserve clear attribution to the original Mesurer project and Julien Thibeaut in the README, [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), and documentation discussing origin/upstream parity;
- never imply the original Mesurer measurement tool or baseline UI originated in this repository;
- do not remove or obscure the upstream repository link, copyright notice, MIT attribution, or pinned upstream parity references;
- distinguish upstream-derived behavior from Mesurer Solid extensions such as the Solid 2 port, framework-independent public package, agent/context workflow, plugin runtime, Arrange, direct text editing, host-page isolation, and Trusted Types renderer;
- for screenshot work, preserve the upstream-parity record: region capture/copy/download/extension capture came from the newer upstream product delta, while Mesurer Solid adapted it to the plugin architecture and extended the persistent preview/viewer behavior;
- direct text editing is a Mesurer Solid extension that deliberately reuses the adopted Text Inspector typography/card primitives and canonical Mesurer toolbar visual language; do not describe it as upstream parity unless a future source audit establishes that;
- if documentation is reorganized, move attribution rather than deleting it;
- treat weakened upstream attribution as a documentation regression.

The authoritative third-party notice is [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md). Current parity/product decisions are pinned in [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md).

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
Arrange Before/Desired intents
saved text/style Before/Desired intents
screenshot thumbnail/viewer state
```

That state is part of the user's visual message. Read structured context and saved intent before changing selection yourself, and do not dismiss/replace a human screenshot preview unless the task explicitly involves it.

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

Normal injection keeps the optional screenshot camera disabled. When the task explicitly requires that human tool, set this before first injection:

```js
window.__MESURER_CONFIG__ = { screenshot: true }
```

The first-party Chrome extension enables `mesurer.screenshot` automatically. Do not reinject over a live instance merely to change screenshot configuration; preserve human state and use the plugin host deliberately if the feature must be added to an already-mounted instance.

Within this repository:

```bash
bun run build
bun run browser:inject-script > /tmp/mesurer-inject.js
```

The repository's browser harness is a reference/CI adapter, not the agent integration API.

## 3. Context and saved-intent agent contract

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

When direct text editing is available, capabilities also reports:

```text
textEdit
```

and the public agent methods include:

```text
textEdits()
textEdit(id)
```

When the first-party Arrange plugin is mounted, capabilities also reports `arrange` and exposes its saved-intent/presentation/review methods.

`select` is programmatic agent/harness functionality. It does not add a human context toolbar button. Human context controls remain Copy Context, Copy Selection, and Add Note. Direct text editing also does not add a competing top-level Text Edit tool; the human enters it by double-click/double-tap while Select or Text Inspector is active.

There is no `sendContext()` or send/delivery capability. There is also no `screenshots` delivery capability: the screenshot plugin contributes a separate human camera tool and typed plugin service rather than adding image transport to `window.__MESURER__`.

### Broad Mesurer/context requests mean a full intent sweep

If the user says “check Mesurer,” “check Measure,” “look at Mesurer context,” “see what I highlighted/moved/annotated/edited,” or otherwise refers broadly to current Mesurer state, do not assume `context()` alone is the whole message.

Inventory all live human-intent channels first:

```js
const capabilities = window.__MESURER__.capabilities().capabilities
const workspace = await window.__MESURER__.context()
const annotations = await window.__MESURER__.annotations()
const arrangements = capabilities.arrange
  ? await window.__MESURER__.arrangements()
  : []
const textEdits = capabilities.textEdit
  ? await window.__MESURER__.textEdits()
  : []

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

Then resolve the relevant saved records instead of stopping at their lists:

```js
const annotationContexts = await Promise.all(
  annotations.map((annotation) =>
    window.__MESURER__.context({ annotation: annotation.id })
  ),
)

const arrangeIntents = await Promise.all(
  arrangements.map((intent) => window.__MESURER__.arrange(intent.id)),
)

const textEditIntents = await Promise.all(
  textEdits.map((intent) => window.__MESURER__.textEdit(intent.id)),
)
```

Treat the combined relevant state as one human visual message: current selection, target-bound notes, Arrange Before/Desired geometry, text Before/Desired copy/style deltas, guides, measurements, held distances, rendered typography/layout, rulers/X-ray state, and preserved screenshot UI.

Do not clear or overwrite any channel before consuming its relevant evidence.

### Context acquisition precedence

After preserving Arrange/text-edit intent, use this order for ordinary target context.

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

Annotation notes, Arrange Desired geometry, and text/style Desired edits are human intent. Geometry, computed styles, guides, measurements, distances, and screenshots are supporting evidence. Screenshot blobs are not part of `MesurerContextV1`.

## 5. Consume direct text/style Desired intent correctly

Direct text editing is a reversible human specification, not a source editor.

The human interaction is:

```text
Select or Text Inspector active
  → double-click direct text (double-tap touch/pen)
  → current text selected in full
  → in-place editor + Mesurer-style formatting toolbar
  → automatic Text Inspector information for the same field
  → Enter keeps Desired / Escape cancels
```

Arrange keeps Select active, so the same editing flow can happen while Arrange remains selected.

The current target contract is deliberately narrow: ordinary elements with one unambiguous non-empty **direct text node**. Do not assume this is a generic rich-text engine. Native `<input>`, `<textarea>`, `<select>`, `contenteditable`, and ambiguous mixed/nested rich text retain their normal page/browser behavior.

The automatic Text Inspector card is transient human UI. It shows Family, Size, Weight, Line, Tracking, target/text information, and CSS-variable references when available, but it does not create a separate durable context/intent record. The durable machine-readable record is:

```js
const edits = await window.__MESURER__.textEdits()
const intent = await window.__MESURER__.textEdit(textEditId)
```

A text-edit intent contains target identity, Before/Desired copy, and style deltas such as font family/size/weight/style, color, and text decoration.

Page-derived font/size/weight/color options are useful evidence because they come from styles already rendered in the app. They are **not** an implementation prescription. Inspect source and use the semantic component prop, class, theme/design token, CSS variable, or stylesheet rule when one exists. Do not blindly paste Mesurer's temporary inline preview values into production source.

### Verify real Live source, not the Desired preview

While Select or Text Inspector is active, Mesurer can preview saved Desired copy/style. That preview can make an unfinished source change look correct.

After source edits:

1. retain the relevant `textEdit(id)` record;
2. wait for the application render to settle;
3. deactivate the previewing Select/Text Inspector mode **without clearing text-edit history**;
4. inspect the target's actual rendered text and computed typography;
5. compare those Live values with the saved Desired copy/style deltas;
6. reactivate Select only if continued review is useful.

A correct implementation survives with Mesurer's preview inactive. Mesurer also relinquishes preview ownership when the host application itself changes a value; do not fight that ownership model to make a test pass.

See [`docs/TEXT_EDITING.md`](./docs/TEXT_EDITING.md).

## 6. Multi-selection is relational

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

## 7. Understand both screenshot paths

Mesurer has two intentionally different screenshot workflows.

### Coding-agent screenshot evidence

For ordinary agent verification, the outer harness owns screenshot bytes while Mesurer plans clean evidence:

```js
const plan = await window.__MESURER__.capturePlan({ scope: "selection" })
await window.__MESURER__.prepareCapture()
try {
  // Capture through the existing browser harness.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture preparation hides Mesurer control chrome. Active direct-editor controls and its transient automatic Text Inspector card are inspector chrome rather than host-app evidence.

Use both signals:

```text
Mesurer structured context → exact geometry, styles, distances, overflow
saved human intent          → annotation / Arrange / text Desired state
outer-harness screenshot    → pixels, composition, hierarchy, clipping, appearance
```

### Human screenshot plugin

`mesurer.screenshot` is an optional first-party plugin exposed from `mesurer-solid/screenshot`. Its camera tool lets the human drag a viewport region and captures a real PNG with HiDPI-aware CSS-to-bitmap cropping. It temporarily hides its own control chrome, restores the previous presentation, and then applies persistent best-effort copy/download preferences.

A successful capture leaves a persistent draggable thumbnail with native image right-click behavior and a dismiss control. Clicking it opens a larger viewer with Copy, Save, and Close actions; Escape/backdrop closes the viewer without discarding the thumbnail. Capture/output status is shown separately so an unavailable clipboard/download does not discard a valid image.

Normal browsers use `getDisplayMedia()` with stream reuse. A browser may show a permission prompt or screen/tab chooser before the first capture; pause and wait for the user to approve it. If the current harness already has a validated tab with capture permission, reuse that tab for later captures instead of creating a new tab for every attempt. The first-party Chrome extension enables the plugin automatically and captures through `chrome.tabs.captureVisibleTab()` via its isolated-world bridge, avoiding the screen-share chooser and a broad `<all_urls>` permission.

The typed screenshot service is available through the mounted plugin host under service id `screenshot`. It is not a context/delivery capability.

Only automate the screenshot plugin itself when the task is specifically about that feature. Otherwise use the outer harness for task screenshots, and preserve an existing human screenshot preview.

See [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md).

## 8. Edit through the normal project workflow

After reading initial visual state, edit the real implementation using the project's normal tools.

Do not mutate human guides, measurements, distances, annotations, Arrange history, text-edit history, selection, or screenshot preview/viewer state just to make evidence match the implementation.

Let the normal dev server/HMR update the page. If the application must be relaunched, use the harness's ordinary flow.

## 9. Fresh Live evidence is required after meaningful visual changes

Meaningful visual changes include layout, spacing, sizing, alignment, typography, copy, responsiveness, overflow/clipping, component geometry, hierarchy, and design recreation/polish.

After editing:

```js
await window.__MESURER__.stable()
```

Then obtain fresh evidence using the strongest relevant paths.

### Arrange intent exists

Use the saved Arrange id, switch to Live, and review the real geometry:

```js
await window.__MESURER__.showArrange(arrangeId, "live")
const review = await window.__MESURER__.reviewArrange(arrangeId)
```

Do not clear Arrange history to reveal Live.

### Text/style intent exists

Keep the saved text intent, deactivate its Select/Text Inspector preview, and compare the target's real source-rendered copy/computed typography against Desired as described above.

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

A visual task is not complete merely because Mesurer drew an outline or Desired preview. The agent must consume the returned/retained evidence and reason from the **real Live result**.

## 10. HMR and stale-target handling

Annotations keep the exact live DOM node while connected and rebind conservatively after DOM replacement. Arrange and text-edit intents also use conservative target identity; do not silently transfer human intent to another element.

If an annotation/Arrange target reports `stale` or `partial`, or a text-edit target can no longer be resolved uniquely, use the stored intent/baseline, current DOM, and screenshot; if identity remains ambiguous, ask the human to reselect/re-edit.

An unsaved selection can disappear when HMR replaces nodes. Preserve initial context before editing. After render, use exact known selectors with `select()` when unambiguous or ask the user when identity is uncertain.

## 11. Completion standard

For meaningful visual work this is insufficient by itself:

```text
lint passed
typecheck passed
tests passed
build passed
```

Those are implementation checks, not rendered proof.

A strong completion cites evidence actually observed, for example:

```text
- selected cards now measure 320px wide
- rendered horizontal distance is 24px
- selected left edges differ by 0px
- document horizontal overflow is false
- annotation review reports 37px → 24px
- Arrange review reports Live matched Desired
- source-rendered label/typography matches saved text Desired intent with preview inactive
- current screenshot shows no clipping regression
```

If Mesurer is available and the affected rendered UI can be identified, finishing without fresh Mesurer context/review/Live intent verification is a workflow failure.

See [`docs/DESIGN_FEEDBACK_LOOP.md`](./docs/DESIGN_FEEDBACK_LOOP.md), [`docs/CONTEXT_WORKFLOW.md`](./docs/CONTEXT_WORKFLOW.md), [`docs/TEXT_EDITING.md`](./docs/TEXT_EDITING.md), [`docs/ARRANGE.md`](./docs/ARRANGE.md), and [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md).

## 12. Browser ownership boundary

Mesurer does not provide or own the outer harness's general-purpose:

- navigation;
- clicking or typing in the host app;
- task screenshots/artifact storage;
- tabs/windows;
- authentication/session management;
- browser process lifetime;
- agent chat/thread/task routing;
- MCP/WebMCP/ACP transport;
- source editing;
- dev-server ownership.

Use the outer harness for those operations.

Mesurer provides exact page inspection, programmatic selection, annotations/context/review, Arrange/text Desired intent, commands, plugin state/runtime management, the interactive UI, and—when explicitly enabled—the `mesurer.screenshot` human region-capture plugin. That plugin does not turn Mesurer into a browser driver or agent screenshot transport.

## 13. Host-page isolation rule

Do not fix website-specific occlusion bugs with hostname checks or selectors for that website.

The public mount boundary must defend against browser primitives. Current invariants include protected outer-host styles, ShadowRoot isolation, browser top-layer promotion, reassertion above later popovers/fullscreen changes, temporary reparenting into active modal dialogs, and a hardened fixed/max-z-index fallback.

Plugin overlays/previews and transient direct-editor UI must obey the same isolation rules. The editor textarea, formatting toolbar, and automatic Text Inspector card must remain visible/interactable without becoming host-page targets or blockers. Screenshot selection, status, thumbnail, and viewer UI follow the same rule, and screenshot/capture presentation must exclude Mesurer control chrome from pixels before restoring prior presentation.

When a host-page bug appears, reduce it to the browser primitive, add a regression, and fix the shared mount/runtime boundary. See [`docs/HOST_ISOLATION.md`](./docs/HOST_ISOLATION.md).

## 14. Built-in features and stable commands

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

Direct text editing is not another top-level built-in/command. It extends Select/Text Inspector interaction in the renderer bridge and records intent through the `text-edit` service.

Screenshot is intentionally **not** another permanent built-in. `screenshotPlugin()` contributes the camera tool through the normal plugin host.

`window.__MESURER__.select(...)` is different from the `builtin.select` tool command: it is a context-layer agent helper that selects exact rendered targets and returns scoped context.

## 15. Advanced mounted instance

Injection also exposes:

```text
window.__MESURER_INSTANCE__
```

Use `window.__MESURER__` for normal JSON-safe context, saved intent, and measurement work.

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

The optional screenshot service is resolved through the plugin host under service id `screenshot`; it is not added to the context global. Direct text-edit intent is exposed through the normal JSON-safe `window.__MESURER__` agent surface and should not require reaching into renderer internals.

Do not remove/replace plugins on a human's live review instance unless the task explicitly involves modifying Mesurer itself.

## 16. Plugin/runtime architecture

Plugins may register tools, commands, hooks, overlays, settings contributions, scoped state, services, and lifecycle cleanup. State slices may opt into history/persistence. Every registration belongs to its plugin and must disappear when that plugin is removed/replaced.

Prefer plugins for project-specific Mesurer extensions. Modify core only when behavior is genuinely a shared platform capability.

`mesurer.screenshot` is a first-party example of the plugin architecture: camera tool, settings, service, capture resource, preview/viewer UI, and cleanup all belong to the plugin rather than permanent core state.

Direct text editing is intentionally different: it extends shared renderer Select/Text Inspector behavior and reuses `TypographyInspector` plus the existing Text Inspector card renderer. The renderer bridge owns the direct-edit runtime, state/service connection, editor session, and formatting surface; the Text Inspector tool does **not** secretly own/restyle the direct editor after focus.

## 17. Replacing a built-in

A plugin can replace a built-in while retaining the stable `builtin.*` command and conventional shortcut by registering against the same `builtin` slot.

Nested command delegation is one history transaction rather than duplicate undo checkpoints.

## 18. Renderer-aware plugin UI

After the renderer bridge loads it provides opaque service capability:

```text
runtime:solid
```

The public package does not expose private renderer workspace types. Request the service structurally through the public plugin service API and use `createInspectorMount()` for plugin-owned inspector UI.

Plugin service object values never enter history/persistence; `describe()` exposes service IDs only.

Screenshot's region overlay, thumbnail, viewer, and status UI use renderer-owned mounts behind this opaque boundary. Public consumers import only `mesurer-solid/screenshot`.

The direct text editor also uses a renderer-owned inspector mount. Its automatic Text Inspector card is presentation derived from the active target, not a new plugin UI registration or persistent Text Inspector pin.

## 19. Framework rules

- Solid 1, Solid 2, React, Vue, Svelte, vanilla browser apps, and Electron renderer pages use the same public boundary.
- There is no public framework-specific Mesurer package.
- Mesurer's UI renderer remains Solid 2 internally but private to its isolated browser island.
- Direct text editing acts on rendered DOM/text/computed styles and therefore works across those host frameworks without knowing their component runtime.
- Electron main-process code is not a DOM host; mount/inject only in renderer pages.
- For packaged apps, prefer the ordinary artifact plus an existing renderer-evaluation/debug channel over a Mesurer-specific build.
- Browser transport and ownership belong to the outer harness.

## 20. Public package contract

One npm package is intended for users:

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/screenshot
mesurer-solid/inject
mesurer-solid/inject-script
```

The root export contains the mount API, agent/context and text-edit intent types, plugin helpers, and built-in plugin factories. `/core` is framework-neutral. `/screenshot` is the optional first-party screenshot plugin/service entry. `/inject` is the ES-module injector. `/inject-script` is the classic self-executing browser-evaluation payload.

The published artifact includes `AGENT_INTEGRATION.md`, the portable Agent Skill, and its injector asset.

## 21. Repository architecture invariants

Internal workspaces are private implementation details:

- framework-neutral core must not depend on Solid, React, another renderer, Electron, or browser globals;
- DOM helpers own canonical browser measurements and conservative selector/fingerprint identity;
- `packages/renderer` owns the private Solid 2 UI/reactive adapter, direct text-edit runtime/presentation, and renderer-aware screenshot UI implementation;
- direct text editing remains a renderer-bridge interaction/service, not a competing toolbar plugin;
- Text Inspector and direct editing share typography/card primitives without hidden lifecycle ownership;
- direct text target scope remains ordinary unambiguous direct text unless deliberately redesigned/tested/documented;
- `packages/mesurer` owns the public package and injection artifacts;
- built-in and external features use the same plugin host;
- screenshot remains optional plugin state rather than permanent measurement-core state;
- staged npm artifacts must not expose private workspace names or host runtime dependencies;
- staged declarations must expose public-safe text-edit intent types/methods and the `./screenshot` entry;
- default rendering must retain pinned upstream visual/behavioral parity gates;
- agent integrations must not require Playwright or another transport when the outer harness already has page execution;
- agent integrations must preserve a live human Mesurer instance by default, including Arrange/text-edit/screenshot review state;
- programmatic agent selection must use canonical renderer selection/measurement semantics and return structured context;
- agent docs must teach full intent acquisition/consumption, text Live verification, and the screenshot boundary, not mere UI activation;
- host-page occlusion fixes target browser primitives, not specific websites;
- direct text editing and screenshot behavior remain covered by dedicated rendered browser contracts.

## 22. Repository contribution instructions

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

For browser/package-boundary changes, inspect package-smoke, host-compatibility, browser-contract, screenshot-contract, and visual-parity workflows.

When changing public behavior:

1. update root/package README documentation when public capability/API changes;
2. update this file, `packages/mesurer/AGENT_INTEGRATION.md`, and the canonical `mesurer-ui` skill when the agent contract changes;
3. keep repository/package skill copies byte-identical;
4. for direct-text changes, update `docs/TEXT_EDITING.md` plus Arrange/context/browser/host/upstream docs where their shared contract changes, and keep the dedicated Chromium text-edit contract authoritative;
5. for screenshot changes, update `docs/SCREENSHOTS.md`, `extension/README.md`, architecture/browser/context docs, and screenshot-contract expectations where relevant;
6. preserve the one-package public contract unless intentionally redesigning it;
7. keep built-in command names stable when replacing implementation details;
8. add regression coverage for silent failure modes;
9. reduce host compatibility bugs to browser primitives rather than site-specific patches;
10. do not bypass pinned visual/interaction parity gates for default-renderer changes;
11. preserve upstream Mesurer/Julien Thibeaut attribution and `THIRD_PARTY_LICENSES.md`;
12. keep direct existing-harness integration ahead of source integration in agent-facing docs;
13. when Mesurer agent selection/context/text-intent semantics change, test both the public returned data and visible/live behavior;
14. before stable releases, ensure canonical docs use stable install commands and no longer present `@beta` as the default path.

For releases, follow [`RELEASING.md`](./RELEASING.md). Do not manually edit public package versions, create release tags, or manually `npm publish` as a substitute for the release workflow.

## 23. Development-only injection

`mesurer-solid/inject` and `mesurer-solid/inject-script` are for development, testing, and coding-agent harnesses. They do not open a network port, expose a remote-control service, or require an agent transport by themselves.

The direct integration remains:

```text
existing agent harness
  ↕ browser evaluate / screenshot
existing rendered page
  ↕
window.__MESURER__
  ↳ context / Arrange / text-edit intent / review
```

The optional screenshot plugin adds a human camera tool on that same page; it does not change the direct agent transport model.

**Context is the output.**
