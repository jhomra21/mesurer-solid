# Architecture

Mesurer Solid is organized as private implementation workspaces behind one public package, plus a thin first-party browser extension that packages the same runtime.

```text
host application / arbitrary browser page
Solid 1 / Solid 2 / React / Vue / Svelte / vanilla / Electron
                              |
                              v
                        mesurer-solid
          mount · core · inject · inject-script
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
 framework-neutral core   Solid 2 UI       plugin host
 state/history/contracts  isolated island  tools/extensions
                                              |
                                              v
                                      mesurer.context
                              annotation/context/select/review
                                              |
                                              v
                                      window.__MESURER__
                                              |
                               existing browser harness
```

Solid 2 is an implementation detail of the renderer. Host applications do not need to provide Solid.

## Public distribution

Users install one npm package:

```text
mesurer-solid
```

It exposes the root mount API plus `/core`, `/inject`, and `/inject-script` subpaths.

The package also ships one portable `mesurer-ui` Agent Skill and a generic installer. The installer leaves both `SKILL.md` and the exact built `assets/inject-script.js` under `.agents/skills/mesurer-ui`, so the skill remains usable after the transient package invocation exits. There are no harness-specific Mesurer agent packages.

## Internal workspaces

### Framework-neutral core

The private core owns domain state/defaults, command model state, observable snapshots, undo/redo, workspace serialization, plugin lifecycle, tools/commands/hooks/overlays/settings/services, plugin-owned state slices, capability introspection, and framework-neutral annotation/context contract types.

It must not import Solid, another renderer, Electron, or browser globals.

### DOM boundary

The private DOM workspace owns owner-document/window helpers, storage adapters, Electron-renderer detection, canonical box-model inspection, deterministic element selectors, fingerprints, and rich DOM inspection.

The visible Select tool, low-level agent inspection API, annotation rebinding, programmatic context selection, and context capture share these DOM rules instead of developing independent selector/geometry interpretations.

Fingerprints are deliberately conservative. Strong `id`/`data-testid` identity must still match. Weaker rebinding requires compatible tag/classes/accessibility/text identity and a unique candidate; structural position alone is not enough to move human intent to another element.

### Renderer

`packages/renderer` is private and owns the Solid 2 UI/lifecycle adapter. The framework-neutral command model is mirrored into Solid state for JSX while imperative interaction reads the synchronous command snapshot.

Built-ins remain Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings. They can be excluded/replaced through the plugin architecture.

Each renderer owns one built-in controller. Toolbar clicks, human shortcuts, and programmatic `builtin.*` commands converge on that controller. Programmatic commands do not discover toolbar controls by labels, call `.click()`, or synthesize shared-window keyboard events.

Plugin tools render through the canonical Toolbar and `ToolbarButton` path. The plugin layer does not poll the DOM for a toolbar or maintain a second button renderer.

### Public package

`packages/mesurer` is the only publishable workspace. Its build bundles the private core/DOM/renderer into self-contained artifacts. Public JS/declarations must never leak private workspace package names or external Solid runtime dependencies.

The public context types form a self-contained JSON serialization boundary. Compile-time parity assertions keep the duplicated public annotation shapes aligned with canonical framework-neutral contracts.

## Context is a plugin boundary

The human/agent context workflow is owned by removable `mesurer.context`:

```text
pluginHost.load(contextPlugin())
             |
             +-- annotation runtime + conservative HMR rebinding
             +-- Copy Context / Copy Selection / Add Note UI + shortcuts
             +-- context/select/review/capture-plan operations
             `-- service: context:v1
```

Core `mountMeasurer()` does not create annotation state, render context controls, or capture context itself. Convenience methods resolve `context:v1` from the live plugin host.

Removing `mesurer.context` disposes its UI, listeners, annotation runtime, commands, and service through the same lifecycle used by other plugins.

The injection entry points install `contextPlugin()` by default because human/agent context is the normal injection workflow. Source-mounted applications opt in explicitly through `plugins: [contextPlugin()]`.

The plugin has **no agent-delivery callback**. There is no Send-to-agent toolbar action, no `sendContext()` method, and no send/delivery capability bit. Programmatic `select()` changes only the shared page selection and returns scoped context; it does not deliver a message to an agent conversation.

## Shared visual state is the agent boundary

The key architecture decision is that Mesurer does **not** require context delivery to an agent conversation.

The page itself is shared state:

```text
human reviewer                        coding agent
     |                                     |
     | uses visible Mesurer                | existing browser evaluate
     v                                     v
selection / measurements / guides    window.__MESURER__
     |                                     |
     +-----------------+-------------------+
                       |
                       v
               same live page state
```

The human can point at a problem using the visible UI. The agent reads the exact same state through its existing browser harness. If there is no relevant human selection and the agent knows the exact affected rendered targets, it can call `select()` to visibly highlight them and receive selection-scoped context. If target identity is ambiguous, the agent asks the human to select instead of guessing. After editing source, the agent reads the page again to prove the result.

Mesurer therefore does not need to know the agent vendor, current chat/thread/task/session, model, MCP/WebMCP/ACP connection, localhost feedback server, or how the harness edits source for the normal context-first workflow.

## Existing-instance preservation

A live Mesurer instance can contain valuable human review state. Agent attachment must not erase it.

Injected Mesurer defaults to reusing the canonical injected instance whenever `globalThis.__MESURER_INSTANCE__?.element.isConnected` is true:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: true, // default
}
```

Explicit replacement remains available:

```js
window.__MESURER_CONFIG__ = {
  reuseExisting: false
}
```

Replacement is for deliberate HMR/tests/tooling. The Agent Skill first discovers `window.__MESURER__` and does not reinject when it is already present.

CI has a real-browser invariant for this behavior: it stores live instance/plugin/selection state, evaluates the injector again, proves the exact same instance/agent/state remain, and separately verifies the explicit replacement path.

## Context data contract

The main public data contract is `MesurerContextV1`.

```text
workspace / selection / annotation
                |
                v
        MesurerContextV1
                |
                v
        window.__MESURER__
                |
      harness browser evaluation
                |
                v
            agent task
```

Context is JSON-safe. It contains page/viewport state, requested viewport `regions`, inspected targets, relevant visual evidence, and annotation intent when scoped to an annotation.

Workspace context captures the meaningful current visual workspace. Selection context answers what the person or harness is pointing at now. Annotation context adds a durable human note and immutable scoped baseline.

`select(selector | selectors)` is a context-returning operation: every supplied selector must resolve to exactly one rendered target, the targets become Mesurer's visible live selection, and the returned value is selection-scoped `MesurerContextV1`. Missing or ambiguous selectors fail without silently choosing another target.

Selection/annotation relevance uses direct element references and geometry only. Mesurer does not use model inference to guess which evidence matters. Guide relevance uses the renderer's existing snap tolerance.

## Multi-selection is relational state

A multi-selection is not represented to the agent as only a count. Every selected target contributes its complete computed inspection, and the relationships between targets are part of the evidence.

```text
selected targets
   ├─ target A full inspection
   ├─ target B full inspection
   ├─ target C full inspection
   └─ relevant visualContext distances
          + focused distance(A,B), distance(A,C), distance(B,C) as needed
```

For small selections, the Agent Skill directs the harness to read all useful pairwise pixel gaps/center relationships. For large selections, it focuses on adjacent/repeated/user-relevant pairs to avoid useless O(n²) output.

This makes a human action like selecting three components a precise request to inspect their sizes, box models, typography/layout state, and spatial relationships together. The same relational contract applies when an agent selects exact changed targets programmatically.

## Human state can be unsaved

Annotations are not mandatory for direct agent use.

A person can simply select one or more elements, drag a region, place guides, create measurements/held distances, enable rulers/X-ray, and ask the agent to inspect the page.

The agent reads:

```js
const workspace = await window.__MESURER__.context()

let selection = null
try {
  selection = await window.__MESURER__.context({ scope: "selection" })
} catch {}
```

The agent stores that initial context inside its current task before editing. After HMR it re-reads a still-relevant human selection, or when it knows the exact changed targets it calls:

```js
const current = await window.__MESURER__.select(changedSelectors)
```

That leaves the affected UI visibly highlighted and returns the fresh scoped context used for completion evidence. `inspect()` / `distance()` remain available for focused before/after validation.

## Annotation identity and observation

While an annotated `HTMLElement` remains connected, the runtime retains that exact element identity. A selector/fingerprint is a replacement fallback for HMR/DOM replacement, not the primary live identity.

Observation is lazy and attribute observation is restricted to identity/geometry-relevant attributes.

After replacement, only an unambiguous compatible target can rebind. Missing or ambiguous targets remain stale.

## Scoped baselines and review

Annotation baselines capture only evidence relevant to the target/region using the same element/geometry rules as current scoped context.

Element targets receive immutable annotation target IDs. Fresh DOM inspection may produce a new selector after an edit, but `review()` still matches the target by annotation ID rather than selector text.

`review(annotationId)` compares the immutable scoped baseline with freshly resolved context after an edit/HMR cycle. Relevant target/guide/measurement/distance evidence that disappears is reported explicitly as `kind: "missing"`.

```text
human baseline
  → agent edit
  → stable render
  → review()
  → exact before/current/delta pixels
  → iterate
```

## Agent/browser harness boundary

Mesurer does not own browser navigation, clicking, typing, screenshots, tabs, auth, browser process lifetime, source editing, dev servers, or agent conversation routing.

```text
coding agent
    |
    | existing browser evaluate
    v
window.__MESURER__
    |- ready()/stable()
    |- capabilities()
    |- context()/select()/annotations()/review()
    |- capturePlan()/prepareCapture()/finishCapture()
    `- inspect()/distance()/viewport()/feedback()
```

The generic harness integration evaluates the self-contained `inject-script` only when Mesurer is absent. The installed Agent Skill carries the same artifact locally as `assets/inject-script.js`.

Dynamic capabilities are read after `ready()`, because plugin setup is part of readiness.

A root-scoped agent keeps all inspection primitives consistent. `at()` may use document hit testing as a fallback only when the returned element is contained by the configured root.

## Screenshot boundary

The context plugin describes screenshot scope but does not own a browser driver or image-delivery abstraction.

`capturePlan()` always returns the viewport and may add a close-up clip. Focus planning unions scoped regions with relevant target/measurement/distance evidence.

`prepareCapture()` hides control chrome while retaining visual evidence; `finishCapture()` restores the exact prior presentation. The outer harness uses its real screenshot primitive.

```text
Mesurer geometry → exact spacing/alignment/box model/computed state
real screenshot  → composition/hierarchy/clipping/appearance
```

## Agent Skill boundary

The Agent Skill teaches behavior rather than transport:

- discover and reuse existing human Mesurer state;
- inject only when absent through the browser channel the harness already owns;
- read workspace, selection, and annotations before editing;
- preserve and consume an existing human selection before changing it;
- when exact changed targets are known, use context-returning `select()` to visibly highlight and verify them;
- when target identity is ambiguous, ask the human to select instead of guessing;
- read every selected target and relevant pairwise relationships for multi-selection;
- treat notes as intent and numeric/page data as evidence;
- preserve initial context across HMR;
- edit source through the normal project workflow;
- wait for rendered stability;
- use `review()` for annotation baselines;
- obtain fresh Mesurer context for the affected rendered UI before claiming completion;
- use the harness's real screenshot primitive;
- do not claim visual completion based only on build/typecheck;
- do not look for or start MCP/WebMCP/ACP/session-routing/Send-to-agent infrastructure for the normal direct-state workflow.

## Browser extension

`extension/` is a thin Manifest V3 distribution shell. Its build copies the public package's self-contained `inject-script` artifact into the unpacked extension.

The extension does not fork Mesurer or own agent transport. It is a convenient way for a human to place Mesurer into a page; an agent with page evaluation then reads the same `window.__MESURER__` state.

## Keyboard and instance isolation

Window keyboard listeners inspect `KeyboardEvent.composedPath()` for editable controls so typing in Mesurer UI does not trigger inspection shortcuts across Shadow DOM retargeting.

Multiple Mesurer instances may share one document/window while owning separate renderer models and built-in controllers. Programmatic commands target the owning instance.

## Plugin ownership and disposal

Every plugin registration belongs to the plugin that created it. Removing/replacing a plugin disposes registrations, orphaned state, incompatible history, renderer-owned UI, and lifecycle cleanup registered by that plugin.

Renderer-aware plugins can request the opaque `runtime:solid` service without importing private renderer workspaces.

## Scheduler and isolation rules

- `model.current` remains the synchronous command snapshot for imperative interaction;
- `model.state` remains the Solid reactive projection for rendering;
- one renderer instance owns one built-in command controller;
- plugin tools render through the canonical Toolbar path;
- the public mount uses an isolated open ShadowRoot by default;
- top-layer mounting protects Mesurer from ordinary page stacking/clipping;
- root-scoped inspection never crosses the configured root;
- Electron renderer pages use the same browser mount/injection boundary.

## Release invariants

The public workspace stages a sanitized `.publish` directory. Release checks fail if private workspace names leak into public metadata, JS, or declarations. Package-smoke installs the packed artifact into clean consumer apps.

The public package guard also asserts the context-first public declaration surface, including context-returning `select(string | string[])` and the `select` capability bit, and keeps the repository/package Agent Skill copies byte-identical.

The public package build smoke-runs the Agent Skill installer in a fresh temporary directory, verifies `SKILL.md` and `assets/inject-script.js`, and byte-compares the installed injector with the exact built `dist/inject-script.js`.

The extension build runs after the public package build so it consumes the same generated injection artifact users, skills, and harnesses receive.

## Visual contract

Architecture changes must not silently change the parity-proven visual behavior of existing Mesurer tools. Existing screenshot and interaction workflows remain regression gates while extensions add new behavior through the plugin host.
