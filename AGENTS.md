# Mesurer Solid repository instructions

These instructions are for agents and contributors changing this repository. They intentionally do not duplicate the full workflow for using Mesurer against another application.

For the canonical human/agent UI-review workflow, read:

- [Agent Integration](./packages/mesurer/AGENT_INTEGRATION.md) for the detailed integration and verification contract.
- [Mesurer UI skill](./.agents/skills/mesurer-ui/SKILL.md) for the portable instructions shipped to coding agents.
- [Context](./docs/CONTEXT_WORKFLOW.md), [Arrange](./docs/ARRANGE.md), [Layout Guides](./docs/LAYOUT_GUIDES.md), [Measurements](./docs/MEASUREMENTS.md), [Text Editing](./docs/TEXT_EDITING.md), and [Screenshots](./docs/SCREENSHOTS.md) for feature-specific behavior.
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

## Launch evolution

Mesurer Solid has launched but currently has no production data or user state that requires migration-preserving internal designs. Revisit this rule before the first production deployment that creates such obligations.

Until then:

- remove obsolete internal code, schemas, aliases, and transitional paths directly;
- update internal callers/tests atomically instead of adding compatibility shims;
- treat development/test data as disposable;
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

Public `mesurer-solid` package. It owns mounting/injection, first-party public plugin factories, package staging, public agent APIs, and the canonical Codex companion implementation.

The canonical Codex companion source is:

```text
packages/mesurer/codex/
```

The npm bin files under `packages/mesurer/scripts/codex-*.mjs` are tiny stable launchers. The standalone plugin files under `plugins/mesurer-codex/scripts/` are generated distribution artifacts. Change the canonical source, then run:

```bash
bun run sync:codex-plugin
bun run check:codex-plugin
```

Do not edit the generated plugin scripts independently.

### Repository-level areas

- `examples/`. runnable hosts and browser fixtures, not reusable library code.
- `tests/`. cross-package/browser/package acceptance suites.
- `scripts/`. repository automation and developer commands.
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
```

The root export owns mounting, public domain types, and the agent API. `/plugins` owns first-party plugin factories and contracts. `/core` stays framework-neutral. Injection entries are for development, testing, and agent-controlled browser evaluation.

Do not expose private workspace package names or renderer-specific types through the staged public artifact.

Public plugin factories use direct feature names such as `context()`, `arrange()`, `screenshot()`, `codex()`, `select()`, and `typography()`. Do not reintroduce redundant `*Plugin` factory aliases or one-plugin-per-subpath exports.

Screenshot capture-source selection is internal. Application-owned native hosts may expose `window.__MESURER_HOST__.captureScreenshot`; the Chromium extension uses its private adapter; ordinary browser pages fall back to `getDisplayMedia()`. Do not add host-specific Screenshot factories or a new public provider option. The older provider hook and low-level Screenshot helpers remain compatibility-only. Once Screenshot selects a host path, capture errors stay on that path instead of silently opening a different permission flow.

The visible tool is **Typography**; the internal compatibility id/command remains `text-inspector` / `builtin.text-inspector`.

## Plugin/runtime invariants

Built-in and external features use the same plugin host. Registrations belong to their plugin and must clean up when that plugin is removed/replaced.

Keep these distinctions:

- Context is the structured human/agent review API.
- Arrange stores reversible Before/Desired geometry intent.
- Direct text editing stores reversible copy/typography intent and extends Select/Typography rather than becoming a competing toolbar plugin.
- Screenshot remains an optional first-party plugin, not permanent measurement-core state.
- Codex is an optional delivery integration; it does not redefine Context or agent inspection.

Renderer-aware plugin UI must cross the existing opaque renderer service boundary rather than publishing private renderer workspace types.

## Codex lifecycle invariants

The accepted Codex Desktop integration has specific correctness properties. Preserve them unless deliberately redesigning the feature and its acceptance suite.

- Queue exactly once through Codex's native durable queue.
- Preserve the exact queued-submission id.
- Do not delete/requeue an existing native item during recovery.
- Open/resume the existing Desktop thread rather than creating another thread.
- Correlate lifecycle using the exact queued prompt/turn history.
- Treat synthetic history `interrupted` without terminal timing as nonterminal.
- Treat genuine ended interruption/failure as terminal and preserve annotations for retry.
- Remove only the exact annotations included in a matched completed delivery.
- Persist browser delivery/routing state across same-tab reloads.
- Fail closed on ambiguous thread/delivery recovery.
- Desktop lifecycle does not trust legacy per-turn lifecycle hooks; the trusted plugin hook is `SessionStart`.

Bridge and connector tests clear ambient Codex thread, app-tools-pipe, Desktop-opener, and home state. A test adds only the state it needs.

Any change to these rules requires the Codex bridge/plugin regressions plus real lifecycle acceptance when behavior changes.

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

Mesurer Solid extensions include the Solid 2/private renderer architecture, framework-independent public package, agent/context workflow, plugin runtime, Arrange, direct text editing, host isolation work, Trusted Types support, and optional Codex integration.

Do not describe an extension as upstream parity unless a source audit establishes it.

## Reference codebases

Use these projects to understand patterns and tradeoffs, not as templates to copy.

### OpenCode v2

**Repository:** `anomalyco/opencode`

Reference for package/domain ownership, Solid application structure, service boundaries, persistence, command/action design, and keeping UI state separate from lower-level runtime services.

### Pi

**Repository:** `earendil-works/pi`

Reference for narrow interfaces, small composable building blocks, direct code, package boundaries, and avoiding unnecessary abstraction.

### Diffusion Studio

**Repository:** `diffusionstudio/editor`, plus authorized `monorepo-new` when available.

Reference for editor architecture, media/application boundaries, worker/background processing, and larger product organization.

### DialKit

**Repository:** `joshpuckett/dialkit`

Reference for fine-grained interactive controls, parameter editing, reactive UI APIs, and small composable building blocks.

### Solid Primitives

**Repository:** `solidjs-community/solid-primitives`

Reference for Solid API design, browser behavior, storage/persistence, lifecycle/cleanup, and package-local ownership.

### OpenTUI

**Repository:** `anomalyco/opentui`

Reference for explicit command/result contracts, keyboard and interaction ownership, renderer/core separation, package-facing API surfaces, and cleanup-aware interactive systems.

### DAW Browser Convex

**Repository:** `jhomra21/daw-browser-convex`

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
- `.agents/skills/mesurer-ui/SKILL.md` is the portable operational skill; its packaged copy must remain byte-identical.
- feature behavior belongs in its guide under `docs/`.
- `ARCHITECTURE.md` describes system boundaries.
- `docs/REPOSITORY_STRUCTURE.md` describes directory ownership.
- this file describes repository rules/invariants.

When public behavior changes, update the canonical docs that own that behavior instead of appending another duplicate explanation here.

## Contribution and release

Use [CONTRIBUTING.md](./CONTRIBUTING.md) for development/review conventions and [RELEASING.md](./RELEASING.md) for publishing.

Do not manually publish, create release tags, or bypass the release PR/OIDC workflow. Preserve release integrity checks and upstream-attribution gates.
