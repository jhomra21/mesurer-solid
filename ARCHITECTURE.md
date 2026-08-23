# Architecture

Mesurer Solid is organized as private implementation workspaces behind one public package, plus a thin first-party browser extension that packages the same runtime.

```text
host application / arbitrary browser page
Solid 1 / Solid 2 / React / Vue / Svelte / vanilla / Electron
                              |
                              v
                    @jhomra21/mesurer-solid
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
                                  annotation/context/review
                              |
                              v
                     canonical DOM boundary
```

Solid 2 is an implementation detail of the renderer. Host applications do not need to provide Solid.

## Public distribution

Users install one npm package:

```text
@jhomra21/mesurer-solid
```

It exposes:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

The root export contains the framework-agnostic mount API, plugin factories, context types/helpers, and bundled renderer implementation. `/core` exposes plugin/runtime primitives. `/inject` and `/inject-script` are self-contained harness injection paths.

The package also ships one portable `mesurer-ui` Agent Skill and a generic installer. The installer leaves both `SKILL.md` and the exact built `assets/inject-script.js` under `.agents/skills/mesurer-ui`, so the skill remains usable after a transient package invocation exits. There are no harness-specific Mesurer packages.

## Internal workspaces

### Framework-neutral core

The private core owns domain state/defaults, command model state, observable snapshots, undo/redo, workspace serialization, plugin lifecycle, tools/commands/hooks/overlays/settings/services, plugin-owned state slices, capability introspection, and framework-neutral annotation/context contract types.

It must not import Solid, another renderer, Electron, or browser globals.

### DOM boundary

The private DOM workspace owns owner-document/window helpers, storage adapters, Electron-renderer detection, canonical box-model inspection, deterministic element selectors, fingerprints, and rich DOM inspection.

The visible Select tool, low-level agent inspection API, annotation rebinding, and context capture share these DOM rules instead of developing independent selector/geometry interpretations.

Fingerprints are deliberately conservative. Strong `id`/`data-testid` identity must still match. Weaker rebinding requires compatible tag/classes/accessibility/text identity and a unique candidate; structural position alone is not enough to move a human note to another element.

### Renderer

`packages/renderer` is private and owns the Solid 2 UI/lifecycle adapter. The framework-neutral command model is mirrored into Solid state for JSX while imperative interaction reads the synchronous command snapshot.

Built-ins remain Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings. They can be excluded/replaced through the plugin architecture.

Each renderer owns one built-in controller. Toolbar clicks, human shortcuts, and programmatic `builtin.*` commands converge on that controller. Programmatic commands do not discover toolbar controls by labels, call `.click()`, or synthesize shared-window keyboard events.

Plugin tool contributions flow into the canonical Toolbar and `ToolbarButton` renderer. The plugin layer does not poll the DOM for a toolbar, discover Settings by accessible label, or maintain a second button renderer.

The renderer exposes opaque plugin-facing UI/runtime helpers. It does not decide that context/annotations must exist. The context extension uses those helpers only while its plugin is loaded.

### Public package

`packages/mesurer` is the only publishable workspace. Its build bundles the private core/DOM/renderer into self-contained artifacts. Public JS/declarations must never leak private workspace package names or external Solid runtime dependencies.

The public context types intentionally form a self-contained serialization boundary. Compile-time parity assertions compare the duplicated public JSON-safe annotation shapes against the canonical framework-neutral core contract, preventing silent drift without leaking private workspace imports into published declarations.

## Context is a plugin boundary

The human/agent context workflow is owned by the removable `mesurer.context` plugin:

```text
pluginHost.load(contextPlugin())
             |
             +-- annotation runtime + conservative HMR rebinding
             +-- toolbar/popover UI + shortcuts
             +-- context/review/capture operations
             +-- optional screenshot/send callbacks
             `-- service: context:v1
```

Core `mountMeasurer()` does not create annotation state, render context controls, or capture context itself. Its convenience methods resolve `context:v1` from the live plugin host. If the plugin is absent, those methods report that the capability is unavailable.

Removing `mesurer.context` disposes its UI, listeners, annotation runtime, commands, and service through the same lifecycle used by other plugins. Replacing/reloading it goes through normal `pluginHost` operations.

The injection entry points install `contextPlugin()` by default because human/agent context is the normal injection workflow. Source-mounted applications opt in explicitly through `plugins: [contextPlugin()]`.

## Context data contract

The main public data contract is `MesurerContextV1`.

```text
workspace / selection / annotation
                |
                v
        MesurerContextV1
                |
          deterministic text
              /     \
       clipboard     ACP content blocks
```

Context is JSON-safe. It contains page/viewport state, requested viewport `regions`, inspected targets, relevant visual evidence, and annotation intent when scoped to an annotation. Workspace context leaves `regions` empty; selection/annotation context retains the actual selected/annotated rectangles even when no DOM target exists.

Selection/annotation relevance uses direct element references and geometry only. Mesurer does not use model inference to guess what visual state is relevant. Guide relevance uses the renderer's existing guide-snap tolerance instead of a second independent threshold.

### Annotation identity and observation

While an annotated `HTMLElement` remains connected, the runtime retains that exact element identity. A selector/fingerprint is a replacement fallback for HMR/DOM replacement, not the primary live identity.

Observation is lazy: no annotation MutationObserver/resize/scroll tracking is installed until the first annotation exists, and it is removed after the last annotation is deleted. Attribute observation is restricted to identity/geometry-relevant attributes rather than every page attribute.

After replacement, only an unambiguous compatible target can rebind. Missing or ambiguous targets remain stale.

### Scoped baselines and review

Annotation baselines capture only evidence relevant to the target/region using the same element/geometry rules as current scoped context. A far-away workspace guide therefore cannot later appear as a false “missing” annotation dependency.

Element targets receive immutable annotation target IDs. Fresh DOM inspection may produce a new selector after an edit, but `review()` still matches the target by annotation ID rather than selector text.

`review(annotationId)` compares the immutable scoped baseline with freshly resolved context after an edit/HMR cycle. Relevant target/guide/measurement/distance evidence that disappears is reported explicitly as `kind: "missing"` rather than silently skipped.

## Agent/browser harness boundary

Mesurer remains transport-neutral and does not own browser navigation, clicking, typing, screenshots, tabs, auth, browser process lifetime, source editing, or an ACP process/session.

```text
coding agent
    |
    | existing browser eval
    v
window.__MESURER__
    |- ready()/stable()
    |- inspect()/distance()/viewport()/feedback()
    |- capabilities()
    `- context/review/capture methods when context:v1 exists
```

The generic harness integration evaluates the self-contained `inject-script` through the harness's existing JavaScript channel. The installed Agent Skill carries the same artifact locally as `assets/inject-script.js`.

Dynamic capabilities are read after `ready()`, because plugin setup is part of readiness.

A root-scoped agent keeps all inspection primitives consistent. `at()` may use document-level hit testing as a fallback only if the returned element is contained by the configured root; it never exposes a sibling/root-external element merely because `HTMLElement` lacks `elementFromPoint()`.

## Keyboard and instance isolation

Window keyboard listeners inspect `KeyboardEvent.composedPath()` for editable controls. This is required under Shadow DOM retargeting: typing in a Mesurer textarea/input must not toggle Rulers, Guides, X-ray, or another inspection tool.

Multiple Mesurer instances may share one document/window while owning separate renderer models and built-in controllers. Programmatic commands target the owning instance. Full-page X-ray keeps the legacy document appearance but uses reference-counted per-document ownership, so disposing an inactive sibling instance cannot clear another instance's active X-ray. Element/ShadowRoot mounts scope X-ray to their target.

## Screenshot boundary

The context plugin describes screenshots but does not own a browser driver.

`capturePlan()` always returns the viewport and may add a close-up clip. Focus planning unions scoped `regions` with relevant target/measurement/distance evidence, so a region-only whitespace/alignment annotation can still request a useful close-up.

`prepareCapture()` hides control chrome while retaining visual evidence; `finishCapture()` restores the exact prior presentation. The outer harness uses its real screenshot primitive. This avoids DOM-to-canvas rendering differences and keeps browser ownership where it already belongs.

## ACP boundary

ACP is the standardized direct-delivery target. Mesurer exports `toAcpContentBlocks(context, images)` but does not discover agent processes, pick sessions, or maintain OpenCode/Pi/Cursor/Codex adapters.

The ACP client/harness that already owns the session performs capability negotiation and `session/prompt`. Clipboard/context text remains the universal fallback.

## Agent Skill boundary

The Agent Skill teaches behavior rather than transport:

- detect Mesurer for frontend visual work;
- inject the bundled classic asset through the browser channel the harness already owns when Mesurer is absent;
- wait for Mesurer readiness before reading dynamic capabilities;
- read human annotations before editing;
- treat notes as intent and measurements/images as evidence;
- edit source through the normal development workflow;
- wait for HMR/render stability;
- call `review()` and inspect screenshots when available;
- do not claim visual completion based on build/typecheck alone when rendered validation is available.

This is distributed once through the standard skill directory instead of repeated per harness.

## Browser extension

`extension/` is a thin Manifest V3 distribution shell. Its build copies the public package's self-contained `inject-script` artifact into the unpacked extension. Clicking the extension action toggles that same runtime in the active tab.

The extension requests only `activeTab` and `scripting`, avoiding persistent all-sites host access for the basic workflow. Browser-protected pages remain outside the injection boundary.

The extension does not fork Mesurer or own context behavior; the injected `mesurer.context` plugin does.

## Plugin ownership and disposal

Every plugin registration belongs to the plugin that created it. Removing/replacing a plugin disposes registrations, orphaned state, incompatible history, renderer-owned UI, and lifecycle cleanup registered by that plugin.

Renderer-aware plugins can request the opaque `runtime:solid` service without importing private renderer workspaces.

## Scheduler and isolation rules

- `model.current` remains the synchronous command snapshot for imperative interaction.
- `model.state` remains the Solid reactive projection for rendering.
- one renderer instance owns one built-in command controller;
- plugin tools render through the canonical Toolbar path;
- the public mount uses an isolated open ShadowRoot by default;
- top-layer mounting protects Mesurer from ordinary page stacking/clipping;
- root-scoped inspection never crosses the configured root;
- Electron renderer pages use the same browser mount/injection boundary.

## Release invariants

The public workspace stages a sanitized `.publish` directory. Release checks fail if private workspace names leak into public metadata, JS, or declarations. Package-smoke installs the packed artifact into clean consumer apps.

The public package build also smoke-runs the Agent Skill installer in a fresh temporary directory, verifies `SKILL.md` and `assets/inject-script.js`, and byte-compares the installed injector with the exact built `dist/inject-script.js`.

The extension build runs after the public package build so it consumes the same generated injection artifact users, skills, and harnesses receive.

## Visual contract

Architecture changes must not silently change the parity-proven visual behavior of existing Mesurer tools. Existing screenshot and interaction workflows remain regression gates while optional extensions add new behavior through the plugin host.
