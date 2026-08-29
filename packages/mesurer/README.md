# mesurer-solid

A Solid 2 port and extension of [Mesurer](https://github.com/ibelick/mesurer) for visual inspection, measurement, screenshots, and rendered UI context.

The Solid 2 renderer is bundled internally. Consumer apps can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron without providing Solid.

## Install

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

## Quick start

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

The base inspector includes Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, and the plugin runtime.

## Screenshot capture

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  plugins: [
    screenshotPlugin({
      copy: true,
      download: false,
    }),
  ],
})
```

The screenshot tool supports dragged viewport regions, HiDPI/Retina-aware PNG crops, persisted copy/download settings, a draggable thumbnail, and a Copy/Save viewer.

## Programmatic selection and context

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"

const mesurer = mountMesurer({
  agent: true,
  plugins: [contextPlugin()],
})
```

Read rendered state:

```ts
const workspace = await mesurer.context()
const selected = await mesurer.context({ scope: "selection" })
```

Select exact rendered targets from code:

```ts
const selected = await mesurer.select([
  "#pricing-card",
  "#pricing-cta",
])
```

Every selector must resolve to exactly one rendered element. Missing or ambiguous selectors reject instead of guessing.

## Annotations and review

```ts
const annotations = await mesurer.annotations()
const annotation = await mesurer.context({ annotation: annotationId })
const review = await mesurer.review(annotationId)
```

Annotations preserve a note and rendered baseline that can be reviewed after the page changes.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core"
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, renderer-owned UI, and lifecycle cleanup.

## Agent integration

For coding-agent injection, state-preservation rules, and the full context/review workflow, use the dedicated docs and portable skill instead of the package README:

- `packages/mesurer/AGENT_INTEGRATION.md`
- `.agents/skills/mesurer-ui/SKILL.md`

Install the skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

## Public entry points

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/screenshot
mesurer-solid/inject
mesurer-solid/inject-script
```

## Compatibility

`mountMesurer()` and the `Mesurer`-spelled types are the canonical API. The older `mountMeasurer()` / `Measurer` aliases remain temporarily for backwards compatibility and are deprecated.

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
