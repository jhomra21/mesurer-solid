# Mesurer Solid repository instructions

These instructions are for agents and contributors changing this repository. They intentionally do not duplicate the full workflow for using Mesurer against another application.

For the canonical human/agent UI-review workflow, read:

- [Agent Integration](./packages/mesurer/AGENT_INTEGRATION.md) for the detailed integration and verification contract.
- [Mesurer UI skill](./.agents/skills/mesurer-ui/SKILL.md) for the portable instructions shipped to coding agents.
- [Context](./docs/CONTEXT_WORKFLOW.md), [Edit](./docs/EDIT.md), [Arrange compatibility](./docs/ARRANGE.md), [Layout Guides](./docs/LAYOUT_GUIDES.md), [Measurements](./docs/MEASUREMENTS.md), [Text Editing](./docs/TEXT_EDITING.md), [Screenshots](./docs/SCREENSHOTS.md), and [Recording](./docs/RECORDING.md) for feature-specific behavior.
- [Design language](./docs/DESIGN_LANGUAGE.md) for the shared visual and interaction review contract for new Mesurer UI.

Do not maintain a third copy of those procedures in this file. Keep this document focused on repository ownership, architectural invariants, validation, and contribution rules.

## Repository principles

Mesurer Solid is an interaction-heavy browser tool and a Solid 2 port/extension of upstream Mesurer. Prefer the smallest coherent design that matches the product today.

- Use Bun for workspace commands.
- Keep domain ownership explicit and package-local.
- Prefer direct code over framework layers that exist only for future possibilities.
- Add abstractions when they name a stable concept, isolate a real boundary, or remove duplicated behavior.
- Do not reorganize files only to reduce directory size.
- Do not preserve backward compatibility for internal APIs unless the user explicitly asks for it.
- Preserve public compatibility only where the published package contract or documented migration requires it.
- Do not make production code accommodate missing jsdom/browser APIs merely to satisfy tests.
- Browser-visible correctness must be proven in the real rendered topology, not inferred from source or mocks.
- Renderer source aliased into the basic example must parse under the root `bun run dev` Vite dependency scan. A production transform passing is not enough.

Read [CONTRIBUTING.md](./CONTRIBUTING.md), [Repository structure](./docs/REPOSITORY_STRUCTURE.md), and [VALIDATION.md](./VALIDATION.md) before broad changes.

## Compatibility evolution

Keep internal compatibility only when a released contract requires it. Public package APIs, documented persistence behavior, extension/session recovery, and agent or Codex integration are release contracts. Private workspaces and internal ids can still change atomically when no public or persisted contract depends on them.

When changing internal behavior:

- remove obsolete internal code, schemas, aliases, and transitional paths directly when no released contract depends on them;
- update internal callers and tests atomically instead of adding compatibility shims;
- treat development and test data as disposable unless a test is proving released persistence compatibility;
- keep migrations, persistence invariants, and deterministic setup coherent;
- do not rewrite release history or public compatibility promises casually.

## Host-project mutation boundary

When using Mesurer to inspect another application, the default host-project mutation budget is zero.

Reuse an existing Mesurer instance or the browser/evaluation channel already available before adding application source integration. Do not add Mesurer-specific dev servers, browser stacks, Electron wiring, MCP servers, or build variants merely to make inspection possible.

The exact reuse/injection/verification order belongs in [Agent Integration](./packages/mesurer/AGENT_INTEGRATION.md), not here.

## Repository ownership

### `packages/mesurer-core`

Framework-independent domain model, state, events, plugin contracts, and runtime contracts. It must not depend on Solid, React, Electron, DOM globals, or renderer implementation.

### `packages/mesurer-dom`

Canonical DOM inspection, browser measurements, and conservative target identity helpers that are reusable below the renderer/public package boundary.

### `packages/renderer`

Private Solid 2 UI and browser interaction runtime. It owns rendered components, selection/measurement presentation, browser coordination, direct text editing, Typography presentation, renderer-aware plugin UI, and host isolation behavior.

Create feature directories here only when files have clear shared ownership and an internal boundary. Keep cross-cutting browser code such as scrolling, document mounts, and selection channels outside feature folders when multiple features depend on them.

### `packages/mesurer`

Public `mesurer-solid` package. It owns mounting/injection, first-party public plugin factories, package staging, public agent APIs, and Codex integration.

Codex implementation stays under its plugin ownership:

```text
packages/mesurer/src/plugins/codex/index.ts
packages/mesurer/src/plugins/codex/bridge.mjs
packages/mesurer/src/plugins/codex/bridge.d.ts
```

The renderer plugin owns UI and Context delivery. The native Codex Bridge owns process/socket access and is published as `mesurer-solid/plugins/codex/bridge`. Do not add a separate Mesurer Codex process, localhost server, marketplace distribution, or hook-owned copy.

### Repository-level areas

- `examples/`. runnable hosts and browser fixtures, not reusable library code.
- `tests/`. cross-package/browser/package acceptance suites.
- `scripts/`. repository automation and developer commands, including the optional local Mesurer MCP server.
- `skills/`. portable Agent Plugins skill copies used by the repository-level ChatGPT/Codex plugin.
- `plugin.json`, `mcp.json`, and `.codex-plugin/`. portable/current-compatibility plugin manifests.
- `tools/`. reusable development tooling.
- `plugins/`. standalone integration distributions.
- `extension/`. first-party browser extension.
- `docs/`. user guides and maintainer reference.

## Public package contract

One npm package is intended for users:

```text
mesurer-solid
mesurer-solid/plugins
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
mesurer-solid/mediabunny-vendor
mesurer-solid/electron
mesurer-solid/plugins/codex/bridge
mesurer-solid/plugins/codex/preload
mesurer-solid/plugins/recording/bridge
mesurer-solid/plugins/recording/preload
```

The root export owns mounting, public domain types, and the agent API. `/plugins` owns first-party plugin factories and contracts. `/core` stays framework-neutral. Injection entries are for development, testing, and agent-controlled browser evaluation. The current stable public baseline is `0.2.1`; install-facing docs use the `latest` dist-tag rather than prerelease tags.

Do not expose private workspace package names or renderer-specific types through the staged public artifact.

Public plugin factories use direct feature names such as `context()`, `edit()`, `screenshot()`, `recording()`, `codex()`, `select()`, and `typography()`. `arrange()` remains a compatibility alias for existing integrations. Do not reintroduce redundant `*Plugin` factory aliases or one-plugin-per-subpath exports.

Select and Edit are the top-level toolbar modes. Select owns selection-first inspection/capture tools such as X-ray, Color Picker, Typography, Screenshot, and Recording. Edit owns movement and direct text/style editing. Rulers, ordinary Guides, and Layout Guides remain available in both modes; Context and Codex remain visible in both modes. Keep mode-switch motion at 150 ms and preserve the existing Arrange ids, state, services, persistence, and agent methods behind the public Edit terminology.

Screenshot capture-source selection is internal. Application-owned native hosts may expose `window.__MESURER_HOST__.captureScreenshot`; the Chromium extension uses its private adapter; ordinary browser pages fall back to `getDisplayMedia()`. The built-in Color Picker also uses the native host capability when present and must not invoke the screen-wide browser `EyeDropper` on that path. Do not add host-specific Screenshot or Color Picker factories or a new public provider option. The older provider hook and low-level Screenshot helpers remain compatibility-only. Once Screenshot selects a host path, capture errors stay on that path instead of silently opening a different permission flow.

Recording capture-source selection is also internal. The browser may use `getDisplayMedia()`; the Chromium extension may mint a one-use current-tab stream id with `tabCapture` and pass it through its private bridge. Those paths acquire pixels only. MediaBunny owns initial encoding, inspection, trim, resize, conversion, and WebM/MP4 export. Do not add host-specific Recording factories, an offscreen recorder, or `MediaRecorder`.

MediaBunny is MPL-2.0 and must remain on its separate distribution boundary. Public ESM output keeps exact `mediabunny@1.59.0` external. Raw classic injection and the extension load `mediabunny-vendor.js` before Mesurer. Do not fold MediaBunny code into Mesurer's MIT-labeled generated bundles or remove the vendor/source notice.

The visible tool is **Typography**; the internal compatibility id/command remains `text-inspector` / `builtin.text-inspector`. Typography stays in Select and is inspection-only. Direct text and typography changes belong to Edit.

## Plugin/runtime invariants

Built-in and external features use the same plugin host. Registrations belong to their plugin and must clean up when that plugin is removed/replaced.

Keep these distinctions:

- Context is the structured human/agent review API.
- Edit stores reversible Before/Desired movement intent through the existing Arrange state and agent contracts.
- Layout Guides remain plugin-owned, page-scoped alignment evidence and stay usable in Select and Edit.
- Direct text editing stores reversible copy/typography intent and extends Select/Typography rather than becoming a competing toolbar plugin.
- Screenshot remains an optional first-party plugin, not permanent measurement-core state.
- Recording remains a first-party capture plugin with the typed `recording:v1` lifecycle; its encoded-media implementation stays in MediaBunny.
- Codex is an optional delivery integration; it does not redefine Context or agent inspection.

Renderer-aware plugin UI must cross the existing opaque renderer service boundary rather than publishing private renderer workspace types.

## Codex lifecycle invariants

The accepted Codex integration has specific correctness properties. Preserve them unless deliberately redesigning the feature and its acceptance suite.

- Codex is Mesurer's own human-triggered local delivery plugin; do not conflate it with the Mesurer Solid OpenAI agent plugin.
- Electron hosts with `window.__MESURER_HOST__.codexBridge` start Codex enabled. Browser hosts keep it registered in Settings but default it off and use the local loopback companion when enabled.
- Keep the public Codex service runtime-neutral. Callers must not choose browser/Electron, CLI/Desktop, or a concrete transport.
- Electron renderer code crosses only the narrow `window.__MESURER_HOST__.codexBridge(request)` capability. Native filesystem, process, and socket access stay in the host process.
- Browser renderer code may talk only to the loopback Mesurer Codex Bridge companion. Keep it bound locally, origin-restricted, and limited to the existing bounded Codex operations.
- Browser code must verify bridge identity, protocol, required capabilities, and the exact companion process identity through health before sending target, queue, delivery, or restore requests. Bind follow-up browser requests to that verified process so a restart or port takeover cannot inherit trust. Treat stale helpers, changed instances, and unrelated port occupants as explicit fail-closed states.
- The optional `plugins/mesurer-codex` helper may start/reuse the browser companion and register local Codex sessions. Keep it separate from the repository-level Mesurer Solid agent plugin.
- A connector may replace a stale Mesurer Codex Bridge only when that bridge advertises idle-safe shutdown and reports zero registered owners and zero queued/working deliveries. Never interrupt a busy older bridge merely because its source hash differs.
- Native enablement remains transactional: acquire a renderer lease and prove readiness before committing enabled state. Browser enablement persists immediately, self-heals when a compatible companion appears, and may remain on in a clear unavailable/conflict/update state.
- Disabling Codex removes that page's service/UI, timers, polling, and tool registrations. Native hosts release their lease exactly once first. Browser pages must not unregister Codex-owned sessions or kill a shared companion.
- Codex SessionStart/SessionEnd own browser-companion thread registration. The companion may shut down only after the final owner is gone and no queued/working delivery remains.
- Bind native leases to one host renderer. `installMesurerCodexHost()` must require application sender validation, reject subframes and unapproved senders, and release a renderer's leases on navigation, renderer exit, or destruction.
- Do not stop Codex's shared app-server when a Mesurer lease is released or when the browser Codex toggle is turned off. Mesurer does not own that shared daemon.
- Discover sendable destinations from Codex's shared local app-server; `thread/loaded/list` is authoritative.
- Shared-app-server delivery queues exactly once through `thread/queue/add` and preserves the queued-submission id.
- When the native host inherited both `CODEX_THREAD_ID` and `CODEX_APP_TOOLS_PIPE_PATH` from a Codex Desktop thread, the plugin may use the resolved Codex executable only for `codex queue --thread <that exact thread>` and then wake that same thread with `codex://threads/<id>`. This Desktop fallback must not accept another destination.
- `CODEX_APP_TOOLS_PIPE_PATH` is an ownership signal only. Never connect to, proxy, relay, or invoke Desktop's private app-tools pipe.
- Outside that exact Desktop fallback, do not shell through `codex queue`. Never create threads, use `turn/steer`, delete/requeue native items during recovery, or start a parallel app-server for delivery.
- Correlate lifecycle from the same shared daemon using the exact queued prompt and bounded turn history.
- Preserve interrupted or failed review evidence; remove only the exact annotations included in a matched completed delivery.
- Persist browser delivery/routing state across same-tab reloads and fail closed on ambiguous routing.
- Mesurer may start Codex's shared daemon when its control socket is absent only through a complete standalone Codex installation. Check managed packages under `CODEX_HOME` before `PATH`. Do not use a bare executable from ChatGPT.app, Codex.app, or another Desktop bundle as a daemon bootstrap.
- A private Codex Desktop stdio app-server is not the shared transport. The current-thread Desktop fallback works from inherited thread ownership without attaching to the private app-tools pipe or starting a parallel Codex server.
- Mesurer must not stop Codex's shared daemon when Mesurer closes.
- The native Codex Bridge must remain safe to bundle into an Electron main process as CommonJS. Do not rely on `import.meta.url`, `process.execPath`, or sibling runtime-file discovery.

Codex integration tests use a disposable `CODEX_HOME` and fake transports. Packed runtime smoke must prove that Desktop-bundled executables are not launched during detection, that an inherited Desktop thread invokes the executable only for one exact `queue` operation and one native thread deep link, and that a complete standalone package can start the shared daemon. Packed Electron smoke must bundle the main process with esbuild before launch so the host topology matches real bundled applications.

Any change to these rules requires the Codex process/package regressions plus real lifecycle acceptance when behavior changes.

## Host isolation invariants

Fix host-page bugs by browser behavior, never by hostname or website-specific selectors.

The renderer separates Mesurer UI from page evidence with ShadowRoot isolation where appropriate, browser top-layer promotion, document-backed inspector mounts for source-linked UI, and explicit hit-test ownership.

Context annotations, direct text editing, Typography, screenshot UI, Select evidence, modal/top-layer behavior, nested scrolling, and host-authored ownership must remain covered by browser contracts when shared browser code changes.

See [Host isolation](./docs/HOST_ISOLATION.md).

## Upstream origin and attribution

Mesurer Solid is an adaptation and extension of [Mesurer](https://github.com/ibelick/mesurer), originally created by **Julien Thibeaut (@ibelick)**.

Preserve:

- clear attribution in the root README and [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md);
- the upstream link and MIT attribution;
- pinned source audits in [Upstream parity](./docs/UPSTREAM_PARITY.md);
- distinction between adopted upstream behavior and Mesurer Solid extensions.

Mesurer Solid extensions include the Solid 2/private renderer architecture, framework-independent public package, agent/context workflow, plugin runtime, Edit movement and direct text editing, host isolation work, Trusted Types support, and optional Codex integration.

Do not describe an extension as upstream parity unless a source audit establishes it.

## Reference codebases

Use these projects to understand patterns and tradeoffs, not as templates to copy.

### OpenCode v2

Repository: `anomalyco/opencode`

Reference for package/domain ownership, Solid application structure, service boundaries, persistence, command/action design, and keeping UI state separate from lower-level runtime services.

### Pi

Repository: `earendil-works/pi`

Reference for narrow interfaces, small composable building blocks, direct code, package boundaries, and avoiding unnecessary abstraction.

### Diffusion Studio

Repository: `diffusionstudio/editor`, plus authorized `monorepo-new` when available.

Reference for editor architecture, media/application boundaries, worker/background processing, and larger product organization.

### DialKit

Repository: `joshpuckett/dialkit`

Reference for fine-grained interactive controls, parameter editing, reactive UI APIs, and small composable building blocks.

### Solid Primitives

Repository: `solidjs-community/solid-primitives`

Reference for Solid API design, browser behavior, storage/persistence, lifecycle/cleanup, and package-local ownership.

### OpenTUI

Repository: `anomalyco/opentui`

Reference for explicit command/result contracts, keyboard and interaction ownership, renderer/core separation, package APIs, and cleanup behavior in interactive systems.

### DAW Browser Convex

Repository: `jhomra21/daw-browser-convex`

Reference for browser/runtime boundaries, worker architecture, performance-sensitive state, and editor-style interaction systems.

## Engineering review skills

For broad API, architecture, or refactoring work, use the relevant engineering skills from `mattpocock/skills` as review lenses rather than as templates. In particular:

- `codebase-design` and `improve-codebase-architecture` for ownership, module depth, and dependency direction;
- `code-review` for correctness and regression review;
- `wayfinder` before changing unfamiliar subsystems;
- `tdd` / `implement` when behavior is best driven from a focused contract.

Prefer the smallest subset that materially improves the task.

## Reference policy

When designing a subsystem:

1. find the closest analogous boundary in the references;
2. understand why that boundary exists;
3. adopt only the smallest part that solves this repository's problem;
4. prefer fewer concepts, explicit ownership, type safety, and easy testing;
5. do not copy code or architecture blindly;
6. benchmark performance-sensitive designs instead of inferring performance from structure.

## Validation

Run the smallest relevant checks while iterating, then the repository gates required by the change. On a fresh checkout or in a disposable worktree, run `bun run build:packages` before the root `bun run test`.

Baseline source validation:

```bash
bun run lint
bun run typecheck
bun run build:packages
bun run test
bun run build
```

Follow [VALIDATION.md](./VALIDATION.md). Important rules:

- package/unit/jsdom tests are supporting evidence for browser interaction changes;
- reproduce manually reported failures in the same topology;
- assert rendered geometry/state rather than proxy constants;
- sample motion when the bug is intermediate-frame jitter;
- keep browser/page diagnostics clean;
- use packed-consumer validation for published-package changes;
- keep visual/interaction parity green when default renderer behavior changes;
- manual acceptance remains a separate gate for real interaction paths when requested.

Package-local tests stay in `packages/<package>/test/`. Cross-package browser/package/host suites live under `tests/`.

## Documentation ownership

Avoid copying the same operating procedure into several documents.

- `packages/mesurer/AGENT_INTEGRATION.md` is the canonical detailed agent integration guide.
- `skills/mesurer-ui/SKILL.md`, `.agents/skills/mesurer-ui/SKILL.md`, and the packaged skill are the same operational skill on three distribution surfaces and must remain byte-identical.
- feature behavior belongs in its guide under `docs/`.
- `ARCHITECTURE.md` describes system boundaries.
- `docs/REPOSITORY_STRUCTURE.md` describes directory ownership.
- this file describes repository rules/invariants.

When public behavior changes, update the canonical docs that own that behavior instead of appending another duplicate explanation here.

## Contribution and release

Use [CONTRIBUTING.md](./CONTRIBUTING.md) for development/review conventions and [RELEASING.md](./RELEASING.md) for publishing.

Do not manually publish, create release tags, or bypass the release PR/OIDC workflow. Preserve release integrity checks and upstream-attribution gates.
