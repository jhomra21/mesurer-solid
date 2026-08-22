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
 framework-neutral core   Solid 2 UI      context/review
 state/plugins/history    isolated island  annotation/evidence
             |                |                |
             +----------------+----------------+
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

The root export contains framework-agnostic mount/context APIs and bundled renderer implementation. `/core` exposes plugin/runtime primitives. `/inject` and `/inject-script` are self-contained harness injection paths.

The package also ships one portable `mesurer-ui` Agent Skill and a generic installer that copies it to `.agents/skills/mesurer-ui`. There are no harness-specific Mesurer packages.

## Internal workspaces

### Framework-neutral core

The private core owns domain state/defaults, command model state, observable snapshots, undo/redo, workspace serialization, plugin lifecycle, tools/commands/hooks/overlays/settings/services, plugin-owned state slices, and capability introspection.

It must not import Solid, another renderer, Electron, or browser globals.

### DOM boundary

The private DOM workspace owns owner-document/window helpers, storage adapters, Electron-renderer detection, canonical box-model inspection, deterministic element selectors, fingerprints, and rich DOM inspection.

The visible Select tool, original agent inspection API, annotation rebinding, and context capture share these DOM rules instead of developing independent selector/geometry interpretations.

### Renderer

`packages/renderer` is private and owns the Solid 2 UI/lifecycle adapter. The framework-neutral command model is mirrored into Solid state for JSX while imperative interaction reads the synchronous command snapshot.

Built-ins remain Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, and Settings. They can still be excluded/replaced through the plugin architecture.

The renderer also owns the live workspace context adapter used by the public package. That adapter reads selection/guide/measurement/distance state, stores human annotations, refreshes durable targets after DOM mutations, and switches Mesurer between normal and clean-capture presentation.

### Public package

`packages/mesurer` is the only publishable workspace. Its build bundles the private core/DOM/renderer into self-contained artifacts. Public JS/declarations must never leak private workspace package names or external Solid runtime dependencies.

## Context boundary

The main new contract is `MesurerContextV1`.

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

Context is JSON-safe. It contains page/viewport state, inspected targets, relevant visual evidence, and annotation intent when scoped to an annotation.

Selection/annotation relevance uses direct element references and geometry only. Mesurer deliberately does not use model inference to guess what visual state is relevant.

### Annotations and HMR

Human annotations store the note plus target selector/fingerprint/last rect and a baseline snapshot. Mutation/resize/scroll refresh resolves a target conservatively: exactly one selector match must also be fingerprint-compatible. Missing or ambiguous targets remain stale.

`review(annotationId)` compares the immutable baseline with freshly resolved context after an edit/HMR cycle.

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
    |- context()/contextText()
    |- annotations()
    |- review()
    |- capturePlan()
    |- prepareCapture()/finishCapture()
    `- sendContext() only when the host explicitly supplies a sender
```

The default generic harness integration remains evaluating `@jhomra21/mesurer-solid/inject-script` through the harness's existing JavaScript channel.

## Screenshot boundary

Mesurer describes screenshots but does not own a browser driver.

`capturePlan()` returns the viewport plus an optional close-up clip. `prepareCapture()` hides control chrome while retaining visual evidence; `finishCapture()` restores the exact prior presentation.

The outer harness uses its real screenshot primitive. This avoids DOM-to-canvas rendering differences and keeps browser ownership where it already belongs.

## ACP boundary

ACP is the single standardized direct-delivery target. Mesurer exports `toAcpContentBlocks(context, images)` but does not discover agent processes, pick sessions, or maintain OpenCode/Pi/etc. adapters.

The ACP client/harness that already owns the session performs capability negotiation and `session/prompt`.

## Agent Skill boundary

The Agent Skill teaches behavior rather than transport:

- detect Mesurer for frontend visual work;
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

The extension is not another Mesurer implementation and does not import private renderer source.

## Plugin ownership and disposal

Every plugin registration belongs to the plugin that created it. Removing/replacing a plugin disposes registrations, orphaned state, and incompatible history. Renderer-aware plugins can request the opaque `runtime:solid` service without importing private renderer workspaces.

## Scheduler and isolation rules

- `model.current` remains the synchronous command snapshot for imperative interaction.
- `model.state` remains the Solid reactive projection for rendering.
- the public mount uses an isolated open ShadowRoot by default;
- top-layer mounting protects Mesurer from ordinary page stacking/clipping;
- Electron renderer pages use the same browser mount/injection boundary.

## Release invariants

The public workspace stages a sanitized `.publish` directory. Release checks fail if private workspace names leak into public metadata, JS, or declarations. Package-smoke installs the packed artifact into clean consumer apps.

The extension build runs after the public package build so it consumes the same generated injection artifact users and harnesses receive.

## Visual contract

Architecture changes must not silently change the parity-proven visual behavior of existing Mesurer tools. Existing screenshot and interaction workflows remain regression gates while annotations/context are added as an orthogonal human/agent layer.
