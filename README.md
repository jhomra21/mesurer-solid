# mesurer-solid

A Solid 2-native port of [ibelick/mesurer](https://github.com/ibelick/mesurer), built for Bun and Solid 2's staged reactive model.

The package lives in `packages/mesurer-solid`; `examples/basic` is the parity playground used to exercise selection, guides, rulers, typography, x-ray, color picking, distance overlays, history and persistence.

## Develop

```bash
bun install
bun run dev
```

Validation:

```bash
bun run typecheck
bun run test
bun run build
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the Solid 2 design and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution.
