# Repository structure

This document defines where new code belongs and the structure we want to preserve as Mesurer Solid grows.

[OpenCode](https://github.com/anomalyco/opencode), [Pi](https://github.com/earendil-works/pi), [Diffusion Studio](https://github.com/diffusionstudio/editor), and [Solid Primitives](https://github.com/solidjs-community/solid-primitives) keep domain code inside packages and repository automation in dedicated directories. Mesurer Solid adopts those useful boundaries without copying their monorepo size.

## Top level

```text
.
├── .agents/          agent/plugin marketplace metadata
├── .codex-plugin/    Codex compatibility plugin manifest
├── .github/          CI and release workflows
├── docs/             user guides and maintainer reference
├── examples/         runnable host/fixture applications
├── extension/        first-party browser extension
├── packages/         publishable/internal workspace packages
├── plugins/          external integration distributions
├── scripts/          repository automation, browser harness, and local Mesurer MCP
├── skills/           portable Agent Plugins skills
├── tests/            cross-package acceptance and compatibility suites
├── tools/            reusable repository tooling
├── plugin.json       portable Agent Plugins manifest
└── mcp.json          portable local MCP declaration
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
- `plugins/`. Renderer-side first-party plugin implementations. Layout Guides, Screenshot, and Recording UI/lifecycle live here; Screenshot/Recording host selection and native, extension, and browser adapters stay private.
- `runtime/`. Host and browser interaction coordination.
- `runtime/text-editing/`. Direct-edit intent, editing and presentation coordination, and direct-edit-only UI ownership.
- `runtime/typography/`. Shared Typography inspector code used by both the built-in inspector and direct editing.
- `test/`. Package-local tests.

Cross-cutting browser code such as document mounts, scroll anchoring/stability, nested-scroll compensation, selection channels, presentation preferences, and workspace Context stay at the runtime root because multiple features consume them.

Create another feature/domain directory only when a group has the same kind of stable ownership and a clear internal boundary; do not split `runtime/` merely to reduce file count.

### `packages/mesurer`

The public `mesurer-solid` package. It owns public mounting/injection, first-party plugin factories, Context/Edit/Layout Guides/Screenshot/Recording/Codex integration, Electron helper entrypoints, package staging, and package-facing documentation.

Package scripts that ship with `mesurer-solid` stay here even when a repository-level test exercises them.

## Codex plugin

Codex stays under the Mesurer plugin boundary:

```text
packages/mesurer/src/plugins/codex/index.ts
packages/mesurer/src/plugins/codex/bridge.mjs
packages/mesurer/src/plugins/codex/bridge.d.ts
```

The TypeScript plugin owns renderer-facing UI, routing, Context composition, and the `codex:v1` service. The native bridge is published as `mesurer-solid/plugins/codex/bridge` and owns only the host-side Codex app-server transport.

There is no separate `packages/mesurer/codex/` subsystem, standalone `mesurer-codex` process, generated marketplace distribution, or hook-owned copy.

The portable-plugin, repository, and packaged Mesurer agent skill must remain byte-identical:

- `skills/mesurer-ui/SKILL.md`
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
├── package-smoke/    packed-package consumers, including real Electron acceptance
└── visual-parity/    browser contracts, visual parity, and interaction parity
```

These suites may exercise examples and multiple packages, so placing them inside one package would give the wrong ownership signal.

The Codex native integration stays inside the public Mesurer package:

```text
packages/mesurer/src/plugins/codex/
├── index.ts       renderer plugin
├── bridge.mjs     native transport and Electron main adapter
├── bridge.d.ts    native host contract
├── preload.mjs    bundle-friendly preload adapter
├── preload.cjs    CommonJS preload adapter
└── preload.d.ts   preload types
```

The package smoke bundles both Electron main and preload before launch.

Workflow definitions remain in `.github/workflows/`; they should call these suites rather than embed large test programs in YAML.

## Examples

`examples/` exists for runnable applications and browser fixtures. Reusable implementation code belongs in a package.

If an example exists only to reproduce a contract, keep it minimal and let the contract itself live under `tests/`. The Electron documentation example explains application wiring; executable Electron acceptance stays under `tests/package-smoke/`.

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
