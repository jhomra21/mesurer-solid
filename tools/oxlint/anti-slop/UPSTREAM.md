# anti-slop provenance

Source: https://github.com/dmmulroy/anti-slop

Generic and Effect source baseline: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`.

Mesurer vendors the production plugin source under `tools/oxlint/anti-slop/`. Upstream RuleTester files are not copied into this repository.

## Local policy

`rules/no-unknown-parameters.ts` intentionally differs from upstream. Mesurer keeps its existing boundary-predicate exception: an explicit type-predicate or assertion signature may accept unknown parameters. Upstream currently exempts only the predicate subject.

`.oxlintrc.json` also keeps `no-runtime-typeof` with `allowInTypeGuards: true`.

The Effect plugin source is kept in sync for provenance, but it is not registered because this repository has no direct `effect` dependency.

## Verification

Run:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
```

The root CI workflow runs lint before typecheck, tests, and build.
