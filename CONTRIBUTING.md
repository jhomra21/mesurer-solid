# Contributing

Mesurer Solid is a Bun workspace with package-local source/tests and a small set of repository-level browser, package, and compatibility contracts.

## Development setup

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
```

Use `bun run dev` for the basic renderer playground.

For focused work, run the owning package's test command. Browser-visible regressions still require the matching end-to-end contract described in [VALIDATION.md](./VALIDATION.md).

## Repository layout

Read [Repository structure](./docs/REPOSITORY_STRUCTURE.md) before adding a new top-level directory, package, integration, or cross-package test suite.

The important ownership rules are:

- `packages/mesurer-core` owns framework-independent domain state and plugin contracts.
- `packages/mesurer-dom` owns DOM inspection helpers.
- `packages/renderer` owns the Solid renderer and browser interaction runtime.
- `packages/mesurer` owns the public package, injection entries, first-party integrations, and package staging.
- `examples` contains runnable consumers and contract fixtures, not reusable library code.
- `tests` contains cross-package/browser/package compatibility suites; package-local unit tests stay beside their package.
- `scripts` contains repository automation and developer tooling.
- `tools` contains reusable repository tooling such as the oxlint plugin.

Do not create a new root directory when an existing package, `tests`, `scripts`, `docs`, or `tools` area already owns the concern.

## Documentation

When user-facing behavior changes, update the owning guide in `docs/`. Update the root or package README when its public examples change. Add a `CHANGELOG.md` entry when the change belongs in release notes. Keep detailed agent procedure in `packages/mesurer/AGENT_INTEGRATION.md` and the portable skill.

Keep the two Agent Skill copies byte-identical:

- `.agents/skills/mesurer-ui/SKILL.md`
- `packages/mesurer/skills/mesurer-ui/SKILL.md`

Codex companion implementation lives in `packages/mesurer/codex/`. The files in `plugins/mesurer-codex/scripts/` are generated standalone distribution files. After changing the canonical companion, run `bun run sync:codex-plugin`. `bun run check:codex-plugin` fails when the generated copy is stale. The npm binaries under `packages/mesurer/scripts/` are small launchers that preserve stable bin paths.

## Validation

Follow [VALIDATION.md](./VALIDATION.md). In particular:

- unit/jsdom tests support a change but do not replace browser acceptance for interaction regressions;
- reproduce the actual failed topology for manual regressions;
- keep browser warnings/errors at zero on accepted flows;
- use packed-consumer checks for published-package changes;
- keep visual parity and interaction parity green when renderer behavior changes.

## Pull requests

Keep changes scoped. Prefer mechanical repository moves separately from behavioral refactors so review can distinguish path churn from runtime changes.

For public package changes, keep release notes and package-facing docs current in the same PR. Release mechanics are documented in [RELEASING.md](./RELEASING.md).

## Upstream attribution

Mesurer Solid is an adaptation and extension of [Mesurer](https://github.com/ibelick/mesurer) by Julien Thibeaut. Preserve the attribution and upstream-parity records described in [AGENTS.md](./AGENTS.md), [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md), and [docs/UPSTREAM_PARITY.md](./docs/UPSTREAM_PARITY.md).
