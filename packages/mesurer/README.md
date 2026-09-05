# mesurer-solid

Framework-agnostic UI inspection, measurement, visual intent, and agent-readable rendered context for browser applications.

Mesurer Solid ships its own isolated Solid 2 renderer. Host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

## Installation

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

## Usage

Mount Mesurer from browser code:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

For Vite, put this in the existing browser entry such as `src/main.tsx`, `src/main.ts`, or `src/index.tsx`. In Electron, use the renderer entry. In SSR applications, mount from a client-only module or lifecycle.

`src/dev/mesurer.ts` is an optional organization pattern, not a required filename or directory. Do not mount Mesurer from `vite.config.ts`, server/API code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

Full placement examples: [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md).

## First-party plugins

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    contextPlugin(),
    arrangePlugin(),
    screenshotPlugin(),
  ],
})
```

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, Settings, plugin hosting, direct text editing, and the low-level inspection API. Native Color Picker is available only when the host exposes an operational `EyeDropper`.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, context plugin, public types, agent surface |
| `mesurer-solid/arrange` | Arrange layout-intent plugin |
| `mesurer-solid/screenshot` | Screenshot capture plugin |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic browser injection |
| `mesurer-solid/inject-script` | Built classic injection artifact |
| `mesurer-skill` | Install the portable coding-agent skill |

## Features

- Select one or many rendered elements and inspect exact geometry.
- Measure distance and pairwise multi-selection spacing.
- Use X-ray, guides, rulers, and persisted settings.
- Inspect Typography and preview reversible direct copy/style changes.
- Arrange selected UI into a Desired position without changing source.
- Capture visible-tab regions through the optional Screenshot plugin.
- Read selection, measurements, guides, annotations, layout, styles, and saved human intent through Context and agent APIs.
- Extend the runtime with tools, settings, overlays, commands, hooks, state, and services.
- Compact the toolbar to active controls without changing tool state or order.

Arrange is not a toolbar mode. It can be activated before a selection exists and enables Select automatically. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Direct text editing respects native editing boundaries. Descendants of an editable ancestor remain native, while a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the normal direct-text rules pass.

Mesurer previews text, styles, and Arrange transforms only while it still owns the value it applied. Host-authored changes take ownership and are preserved through undo/redo, Live review, cleanup, and disposal.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `M` | Toggle Mesurer |
| `S` | Select |
| `X` | X-ray |
| `P` | Native Color Picker when supported |
| `R` | Rulers |
| `A` | Typography |
| `G` | Guides |
| `H` / `V` | Horizontal / vertical guide orientation |
| `Alt` / `Option` | Distance overlay |
| `Cmd/Ctrl + ,` | Settings |
| `Shift + A` | Arrange |
| `Shift + S` | Screenshot |
| `C` | Copy Context |
| `Shift + C` | Copy Selection |
| `N` | Add Note |

Plugin shortcuts are active only when their plugin is mounted and enabled.

## Agent integration

Enable `agent: true` to expose rendered state through the mounted API and `window.__MESURER__`.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select("#pricing-card")
```

Install the portable Agent Skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

The skill preserves existing human state, reads Arrange/text/annotation intent before source changes, and verifies the real Live result after implementation.

See [Agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/packages/mesurer/AGENT_INTEGRATION.md).

## Documentation

- [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md)
- [Direct text editing and Typography](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TEXT_EDITING.md)
- [Arrange](https://github.com/jhomra21/mesurer-solid/blob/main/docs/ARRANGE.md)
- [Screenshots](https://github.com/jhomra21/mesurer-solid/blob/main/docs/SCREENSHOTS.md)
- [Context workflow](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CONTEXT_WORKFLOW.md)
- [Browser harness](https://github.com/jhomra21/mesurer-solid/blob/main/docs/BROWSER_HARNESS.md)
- [Host isolation](https://github.com/jhomra21/mesurer-solid/blob/main/docs/HOST_ISOLATION.md)
- [Trusted Types](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TRUSTED_TYPES.md)

Mesurer Solid is a source-first Solid port and extension of [Mesurer](https://github.com/ibelick/mesurer). Upstream adoption and deliberate differences are tracked in [Upstream parity](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md).

## License

MIT.
