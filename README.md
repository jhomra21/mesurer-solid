# mesurer-solid

A Solid 2-native port of [ibelick/mesurer](https://github.com/ibelick/mesurer), built for Bun and Solid 2's current reactive model.

The goal is framework-only divergence: the public behavior **and visual design** track upstream Mesurer, while the implementation underneath is Solid 2 rather than React.

The package lives in `packages/mesurer-solid`; `examples/basic` is the parity playground used to exercise selection, guides, rulers, typography, x-ray, color picking, distance overlays, history and persistence.

## Visual parity

The Solid port shares upstream Mesurer's Tailwind v4 design source and ports its visible component structure directly:

- toolbar dimensions, ordering, drag behavior, SVG iconography and delayed tooltips
- guide orientation flyout
- 272px settings popover, tabs, switches, sliders, color fields and control spacing
- compact native color-picker result popover
- 18px rulers, tick/label treatment and edge reveal
- measurement, selection, guide and distance overlays
- text-inspector card sizing, typography and shadows
- light color scheme, ink palette, shadows, radii and `#0d99ff` active state

There is intentionally no Solid-specific redesign or alternate dark-mode skin.

## Develop

```bash
bun install
bun run dev
```

`bun run dev` regenerates the injected Mesurer stylesheet from the shared Tailwind design source before starting the playground.

Validation:

```bash
bun run typecheck
bun run test
bun run build
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the Solid 2 design and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution.
