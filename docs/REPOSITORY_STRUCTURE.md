# Repository structure

This document defines where new code belongs and the structure we want to preserve as Mesurer Solid grows.

[OpenCode](https://github.com/anomalyco/opencode), [Pi](https://github.com/earendil-works/pi), [Diffusion Studio](https://github.com/diffusionstudio/editor), and [Solid Primitives](https://github.com/solidjs-community/solid-primitives) keep domain code inside packages and repository automation in dedicated directories. Mesurer Solid adopts those useful boundaries without copying their monorepo size.

## Top level

```text
.
├── .agents/          agent/plugin distribution metadata
├── .github/          CI and release workflows
├── docs/             user guides and maintainer reference
├── examples/         runnable host/fixture applications
├── extension/        first-party browser extension
├── packages/         publishable/internal workspace packages
├── plugins/          external integration distributions
├── scripts/          repository automation and developer commands
├── tests/            cross-package acceptance and compatibility suites
└── tools/            reusable repository tooling
```

The root should otherwise stay limited to project metadata and the few documents that are useful immediately when landing in the repository: README, contributing/release/validation policy, architecture, changelog, licensing, and agent instructions.

## Package ownership

### `packages/mesurer-core`

Framework-independent domain model, state, events, and plugin/runtime contracts.

Code belongs here only when it can be understood and tested without DOM ownership.

### `packages/mesurer-dom`

DOM inspection and host-document integration helpers that do not own the Solid UI.

Keep browser mechanics here only when they are reusable below the renderer/public package boundary.

### `packages/renderer`

Solid renderer, visual components, interaction state, browser presentation, and renderer-specific runtime behavior.

Its current high-level split is meaningful:

- `components/`. Rendered UI.
- `core/`. Geometry, selection, persistence, targets, and other renderer-domain helpers.
- `model/`. Renderer model construction.
- `plugins/`. Renderer-side first-party plugin implementations.
- `runtime/`. Host and browser interaction coordination.
- `runtime/text-editing/`. Direct-edit intent, editing and presentation coordination, and direct-edit-only UI ownership.
- `runtime/typography/`. Shared Typography inspector code used by both the built-in inspector and direct editing.
- `test/`. Package-local tests.

Cross-cutting browser code such as document mounts, scroll anchoring/stability, nested-scroll compensation, selection channels, presentation preferences, and workspace Context stay at the runtime root because multiple features consume them.

Create another feature/domain directory only when a group has the same kind of stable ownership and a clear internal boundary; do not split `runtime/` merely to reduce file count.

### `packages/mesurer`

The public `mesurer-solid` package. It owns public mounting/injection, first-party plugin factories, Context/Arrange/Codex integration, package staging, and package-facing documentation.

Package scripts that ship with `mesurer-solid` stay here even when a repository-level test exercises them.

## Codex and generated distributions

`packages/mesurer/codex/` is the canonical Codex companion implementation. It owns bridge, connector, and lifecycle behavior.

The npm binaries in `packages/mesurer/scripts/codex-*.mjs` are thin stable-path launchers into that canonical implementation. `plugins/mesurer-codex/scripts/` is a generated standalone distribution because a Codex plugin installation cannot depend on paths outside its own plugin root.

Run `bun run sync:codex-plugin` after changing the canonical companion. `bun run check:codex-plugin` verifies that the generated plugin distribution is current. Do not edit generated plugin scripts directly.

The repository and packaged Mesurer agent skill must remain byte-identical:

- `.agents/skills/mesurer-ui/SKILL.md`
- `packages/mesurer/skills/mesurer-ui/SKILL.md`

## Tests

Use two levels of test placement.

### Package-local tests

Tests for one package stay with that package:

```text
packages/<package>/test/
```

This keeps implementation and focused regression coverage close together.

### Repository-level tests

Cross-package and real-host validation lives under `tests/`:

```text
tests/
├── host-compat/      real host/runtime compatibility smoke tests
├── package-smoke/    packed-package consumer acceptance
└── visual-parity/   browser contracts, visual parity, and interaction parity
```

These suites may exercise examples and multiple packages, so placing them inside one package would give the wrong ownership signal.

Workflow definitions remain in `.github/workflows/`; they should call these suites rather than embed large test programs in YAML.

## Examples

`examples/` exists for runnable applications and browser fixtures. Reusable implementation code belongs in a package.

If an example exists only to reproduce a contract, keep it minimal and let the contract itself live under `tests/`.

## Scripts and tools

Use `scripts/` for repository commands: release automation, identity checks, `scripts/browser-harness/` commands, and similar orchestration.

Use `tools/` for code that behaves like a reusable development tool with its own code and tests, such as the anti-slop oxlint plugin.

A script should not become a second application architecture. If it develops durable domain state or a reusable API, move that ownership into a package.

## Documentation

`docs/README.md` is the documentation index.

User workflow guides belong in `docs/`. Root policy/reference documents may remain at the root when contributors need them before navigating deeper, but the docs index must link them.

When adding a subsystem, document:

1. its owning package or directory;
2. its public entry points;
3. its persistence/lifecycle boundaries when relevant;
4. the acceptance suite that proves it works.

## Reference-codebase lessons

The references are guides, not templates.

- **OpenCode.** Strong package/domain ownership and explicit dependency boundaries.
- **Pi.** Narrow packages, direct code, and repository scripts kept separate from runtime packages.
- **Diffusion Studio.** Apps and reusable packages are visibly distinct.
- **Solid Primitives.** Package-local ownership and tests scale better than a large shared source bucket.

For Mesurer Solid, prefer the smallest existing owner. Keep the root limited to project metadata and shared documents. Reorganize only when the new location makes ownership clearer.
