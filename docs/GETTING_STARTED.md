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

With Vite, place the mount next to the code that starts the browser app:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

Typical locations:

| Application | Browser entry |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/main.tsx`, `src/index.tsx`, or the project browser entry |
| Vue / Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | renderer entry such as `src/renderer.ts` |
| SSR / metaframework | client-only module or lifecycle |

`import.meta.env.DEV` and `import.meta.hot` are Vite APIs. With another bundler, use its development flag and cleanup lifecycle.

### Optional separate module

Mesurer does not require a `dev/` directory or a `mesurer.ts` filename. If you want the setup out of your main entry, move the same mount code into a helper such as `src/dev/mesurer.ts` and load it from the browser entry:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

## Add first-party plugins

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

Context, Arrange, and Screenshot do not require separate application files.

## Browser-only boundary

Do not call `mountMesurer()` from build configuration, API/server code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

For SSR frameworks, use the framework's normal client-only boundary. For Electron, use the renderer process where the DOM exists. If Mesurer should ship in the browser build instead of being development-only, remove the development guard and keep the returned instance so it can be disposed later.

## Verify the setup

Once mounted:

- press `S` and click an element to select it;
- hold Shift while selecting to build a multi-selection;
- hold `Alt` / `Option` for the distance overlay;
- use the compact control to hide inactive toolbar items without changing active tool state.

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, Settings, direct text editing, and plugin hosting. Native Color Picker appears only when `EyeDropper` is operational in the current host.

First-party plugin shortcuts are available only when their plugin is mounted and enabled: `Shift+A` for Arrange, `Shift+S` for Screenshot, and `C` / `Shift+C` / `N` for Context actions.

## Next

- [Direct text editing and Typography](./TEXT_EDITING.md)
- [Arrange](./ARRANGE.md)
- [Screenshots](./SCREENSHOTS.md)
- [Context](./CONTEXT_WORKFLOW.md)
- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md)
- [Documentation index](./README.md)
