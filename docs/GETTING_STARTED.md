# Getting started

Mesurer runs in the browser. Mount it once from the browser entry for the page or renderer you want to inspect.

## Install

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

## Mount Mesurer

For Vite, put the mount next to the code that starts your browser app:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

Typical entry files:

| Application | Browser entry |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/main.tsx`, `src/index.tsx`, or the project browser entry |
| Vue + Vite | `src/main.ts` |
| Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | renderer entry such as `src/renderer.ts` |
| SSR / metaframework | client-only module or lifecycle |

Mesurer does not require a `dev/` directory or a `mesurer.ts` filename. If you prefer to keep development tooling out of the main entry, extract the same mount into a helper such as `src/dev/mesurer.ts` and load it from the browser entry:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

`import.meta.env.DEV` and `import.meta.hot` are Vite APIs. Other bundlers should use their development flag and cleanup lifecycle.

## Add plugins

Keep plugin setup with the Mesurer mount:

```ts
import {
  contextPlugin,
  mountMesurer,
} from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"
import { screenshotPlugin } from "mesurer-solid/screenshot"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer({
    agent: true,
    plugins: [
      contextPlugin(),
      arrangePlugin(),
      screenshotPlugin(),
    ],
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

You do not need separate application files for Context, Arrange, or Screenshot unless that organization helps your project.

## Browser-only boundaries

Do not call `mountMesurer()` from:

- `vite.config.ts` or other build configuration;
- API routes, server handlers, or Node-only scripts;
- an Electron main process;
- a shared module that also executes during SSR.

For SSR frameworks, mount from the framework's normal client-only boundary or lifecycle. For Electron, mount from the renderer process where the DOM exists.

If Mesurer should ship in a browser build rather than remain development-only, call `mountMesurer()` without the development guard and keep the returned instance so it can be disposed later.

## Try the inspector

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, Settings, direct text editing, and plugin hosting. Native Color Picker appears only when `EyeDropper` is operational in the current host.

Press `S` and click elements to select them. Hold Shift while selecting to build a multi-selection. Hold `Alt`/`Option` for the distance overlay.

The toolbar can be compacted without changing tool state. In compact mode, inactive controls collapse while every active tool remains visible. Expanding restores the full toolbar in the same order.

## Try direct text editing

With Select or Typography active:

1. Double-click ordinary direct text.
2. Type to replace the selected copy.
3. Use B/I/U, Font, Size, Weight, rendered-page colors, or the Text/Heading preset control.
4. Press Enter to keep the change as Desired intent, or Escape to cancel.

Mesurer does not take over native form editing or content that inherits `contenteditable`. A nested `contenteditable="false"` boundary ends inherited editability; text inside that boundary can use Mesurer editing when it otherwise satisfies the direct-text target rules.

See [Direct text editing and Typography](./TEXT_EDITING.md) for history, ownership, agent APIs, and Live verification.

## Try Arrange

Mount `arrangePlugin()`, then click Arrange or press `Shift+A`. Arrange can be activated with no selection and enables Select automatically. Select an element and drag it to the desired position.

Turning Arrange off leaves Select active. Turning Select off while Arrange is active also exits Arrange because Arrange requires selection interaction.

See [Arrange](./ARRANGE.md) for snapping, persistence, Before/Desired/Live state, transform ownership, and agent review.

## Agent setup

Enable `agent: true` and mount `contextPlugin()` when a coding agent should consume Mesurer state.

```ts
const workspace = await mesurer.context()
const selection = await mesurer.context({ scope: "selection" })
```

Install the packaged skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

The skill tells compatible agents to preserve existing human state, inspect saved intent before editing source, and verify the real Live page afterward.

See [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md).

## Next steps

- [Direct text editing and Typography](./TEXT_EDITING.md)
- [Arrange](./ARRANGE.md)
- [Screenshots](./SCREENSHOTS.md)
- [Context workflow](./CONTEXT_WORKFLOW.md)
- [Browser harness](./BROWSER_HARNESS.md)
- [Documentation index](./README.md)
