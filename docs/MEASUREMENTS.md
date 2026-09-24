# Measurements and distance geometry

Mesurer reports spacing from the rendered page. It does not infer layout intent from source code.

Use the Distance tool for interactive spacing evidence, or read the same geometry through Context and the agent API.

## Interactive distance

Select a rendered target, then hold `Alt` / `Option`.

Mesurer measures the selected target against the current hover target. The hover target may be another element or an ordinary horizontal or vertical guide.

When the hover target contains the selected element, Mesurer switches to container spacing instead of treating the two boxes as unrelated peers.

## Box-to-box geometry

Element measurements use rendered viewport rectangles.

For separated boxes, a horizontal or vertical distance line is anchored inside the overlap shared by the two boxes on the perpendicular axis when that overlap exists. This keeps the line attached to the part of the two rendered boxes that actually faces each other.

For overlapping boxes, Mesurer compares corresponding start and end edges and keeps the edge distances as evidence. The primary visible line uses the shorter valid edge distance.

Multi-selection keeps geometry for every unique selected pair. The visible overlay can de-emphasize blocked horizontal or vertical projections while preserving the pairwise evidence. A pair separated on both axes can also carry one Euclidean diagonal segment for the diagonal spacing view.

## Guide-to-element geometry

Ordinary Guides are measured as lines, not as boxes with arbitrary thickness.

When a guide is outside an element, Mesurer reports the distance from the guide line to the nearest facing edge.

When a guide crosses the element, Mesurer can report distances from the line to both opposing edges. The shorter valid edge distance is used as the primary visible distance.

The same rule applies horizontally and vertically.

## Container spacing

When Mesurer shows spacing between a selected element and its containing element, the container boundary is the container's padding box.

That means the container border thickness is excluded from the spacing value. For the document root or body, the viewport is used as the container boundary.

Values are clamped to zero when the selected box reaches or crosses that boundary.

## Programmatic evidence

The browser agent API exposes direct pair measurement:

```js
const distance = await window.__MESURER__.distance(
  "#pricing-card",
  "#pricing-cta",
)
```

For a multi-selection, prefer the relationships already captured in:

```js
selection.visualContext.distances
```

Context measurements are rendered evidence, not an instruction to reproduce a particular CSS property. A 24px gap may come from `gap`, margin, padding, grid tracks, absolute positioning, or another application-owned layout rule.

Inspect the live page and implement the visual relationship through the application's real layout system.

## Coordinate model

Measurement values are CSS-pixel geometry from the rendered viewport and may be fractional.

Mesurer retains element identity where possible so distance overlays can be recomputed after resize. Page-owned measurements follow the same route-scoped workspace model as other page evidence.

See [Context](./CONTEXT_WORKFLOW.md), [Capabilities](./CAPABILITIES.md), and [Validation](../VALIDATION.md).
