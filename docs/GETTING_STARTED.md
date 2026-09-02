# Getting started

Mesurer runs in the browser. Mount it once from code that executes in the page you want to inspect.

The most important setup rule is:

> Put Mesurer in a client/browser entry path, not in server code, build configuration, or an Electron main process.

## Recommended local-development setup

For a Vite application, keep the Mesurer setup in a small development-only module and load that module from your browser entry file.

A typical project can look like this:

```text
src/
├── main.tsx
└── dev/
    └── mesurer.ts
```

Your actual entry filename may be `src/main.ts`, `src/index.tsx`, `src/index.ts`, or something similar. Use whichever file currently starts your browser application.

### 1. Create the Mesurer module

Create `src/dev/mesurer.ts`:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()

import.meta.hot?.dispose(() => {
  mesurer.dispose()
})
```

This file is where Mesurer-specific setup belongs. Add `contextPlugin()`, `arrangePlugin()`, `screenshotPlugin()`, or other Mesurer plugins here too.

For example:

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

import.meta.hot?.dispose(() => {
  mesurer.dispose()
})
```

### 2. Load it from the browser entry only in development

In a Vite browser entry such as `src/main.tsx`:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

Keep the rest of your existing application startup code in that file as usual.

For example, a React/Vite entry might conceptually look like:

```tsx
import { createRoot } from "react-dom/client"
import { App } from "./App"

if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}

createRoot(document.getElementById("root")!).render(<App />)
```

A Solid/Vite entry follows the same pattern around its existing `render(...)` call.

`import.meta.env.DEV` is provided by Vite. If your project uses another bundler, use that bundler's build-time development flag instead. The important part is that the Mesurer module is loaded only by browser/client code in the environments where you want the inspector available.

## Common file locations

There is no required filename. Put the development guard in the file that starts the page or renderer you want to inspect.

| Application | Typical place to load Mesurer |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/index.tsx`, `src/main.tsx`, or the project's browser entry |
| Vue + Vite | `src/main.ts` |
| Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | the renderer entry, such as `src/renderer.ts` or `src/renderer/main.tsx` |
| SSR / metaframework | a client-only module or component that never executes during server rendering |

Do not put `mountMesurer()` in files such as:

- `vite.config.ts` or other build configuration;
- API routes or server handlers;
- Node-only scripts;
- an Electron main-process entry;
- a shared SSR module that is also evaluated on the server.

Mesurer needs browser globals and is intended to inspect a rendered page.

## If you want Mesurer enabled outside local development

If the inspector should be present whenever that browser bundle runs, you can mount it directly in the browser entry instead of using a development-only dynamic import:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

That code belongs in the same kind of client/browser entry described above. Keep the returned instance if you need to call its API or dispose it later.

For most application development, the development-only module is preferable because Mesurer is commonly installed as a dev dependency:

```bash
bun add -d mesurer-solid
```

## HMR cleanup

During local development, hot module replacement can evaluate a development module more than once. Dispose the previous Mesurer instance when the module is replaced:

```ts
import.meta.hot?.dispose(() => {
  mesurer.dispose()
})
```

This is why the recommended `src/dev/mesurer.ts` example keeps the value returned by `mountMesurer()`.

If your tooling does not provide `import.meta.hot`, use its equivalent cleanup hook or explicitly dispose the instance when your development integration is torn down.

## Plugin setup goes in the same module

Treat the Mesurer mounting module as the single place where you decide what the inspector includes.

Base inspector only:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

Context and review notes:

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

Arrange visual intent:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrangePlugin } from "mesurer-solid/arrange"

const mesurer = mountMesurer({
  plugins: [arrangePlugin()],
})
```

Screenshot capture:

```ts
import { mountMesurer } from "mesurer-solid"
import { screenshotPlugin } from "mesurer-solid/screenshot"

const mesurer = mountMesurer({
  plugins: [screenshotPlugin()],
})
```

You do not need separate app-level files for each plugin unless that organization is useful to your project.

## SSR and client-only applications

If a framework can execute the same module on both the server and browser, do not call `mountMesurer()` at module scope in that shared module.

Instead, make the Mesurer setup client-only using the framework's normal client boundary or client-side lifecycle. The exact mechanism differs by framework, but the rule is the same: `mountMesurer()` must execute in the browser, not during server rendering.

If the project already has a dedicated client entry, loading `src/dev/mesurer.ts` from that entry is usually the simplest option.

## Electron

Mesurer belongs in the renderer process because that is where the DOM exists.

```text
Electron main process     → no Mesurer
preload script            → normally no Mesurer
renderer/browser page     → mount Mesurer here
```

Load the development module from the renderer's entry file using the same development guard your Electron/Vite setup already uses.

## Next steps

- [`ARRANGE.md`](./ARRANGE.md) — Arrange visual layout intent, `Shift+A`, and Before/Desired/Live review
- [`SCREENSHOTS.md`](./SCREENSHOTS.md) — screenshot plugin behavior, `Shift+S`, and capture providers
- [`CONTEXT_WORKFLOW.md`](./CONTEXT_WORKFLOW.md) — selection, context, review notes, and review
- [`UPSTREAM_PARITY.md`](./UPSTREAM_PARITY.md) — current upstream audit and stable-release parity blockers
- [`HOST_ISOLATION.md`](./HOST_ISOLATION.md) — browser/host isolation guarantees
- [`../packages/mesurer/AGENT_INTEGRATION.md`](../packages/mesurer/AGENT_INTEGRATION.md) — coding-agent integration
