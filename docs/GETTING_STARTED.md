# Getting started

Mesurer runs in the browser. Mount it once from code that executes in the page you want to inspect.

The most important setup rule is:

> Put Mesurer in a client/browser entry path, not in server code, build configuration, or an Electron main process.

There is **no required Mesurer directory or filename**. `src/dev/mesurer.ts` is an optional organization pattern, not a special location Mesurer needs.

## Common browser entry locations

Put Mesurer in the file that starts the page or renderer you want to inspect, or in a helper module loaded from that file.

| Application | Typical place to mount or load Mesurer |
| --- | --- |
| React + Vite | `src/main.tsx` |
| Solid + Vite | `src/index.tsx`, `src/main.tsx`, or the project's browser entry |
| Vue + Vite | `src/main.ts` |
| Svelte + Vite | `src/main.ts` |
| Vanilla Vite | `src/main.ts` or `src/main.js` |
| Electron | the renderer entry, such as `src/renderer.ts` or `src/renderer/main.tsx` |
| SSR / metaframework | a client-only module or component lifecycle that never executes during server rendering |

You can choose either of these valid patterns:

1. **Mount Mesurer directly in that existing browser entry.** This is the simplest setup.
2. **Extract Mesurer into a helper such as `src/dev/mesurer.ts`.** This keeps inspector-specific setup separate, but the helper is still loaded from the same browser entry.

## Option 1: mount directly in the existing browser entry

### React + Vite

If your app already starts in `src/main.tsx`, Mesurer can live directly in that file:

```tsx
import { createRoot } from "react-dom/client"
import { mountMesurer } from "mesurer-solid"
import { App } from "./App"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

createRoot(document.getElementById("root")!).render(<App />)
```

Nothing about the React startup changes. The Mesurer mount simply sits beside it in the same browser entry.

### Solid + Vite

If the project starts in `src/main.tsx` or `src/index.tsx`, use the same pattern around the existing `render(...)` call:

```tsx
import { render } from "solid-js/web"
import { mountMesurer } from "mesurer-solid"
import App from "./App"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

render(() => <App />, document.getElementById("root")!)
```

### Vue + Vite

A Vue app can mount Mesurer in its existing `src/main.ts` next to `createApp(...)`:

```ts
import { createApp } from "vue"
import { mountMesurer } from "mesurer-solid"
import App from "./App.vue"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

createApp(App).mount("#app")
```

### Svelte + Vite and vanilla Vite

Use the existing `src/main.ts` or `src/main.js`. The Mesurer part is the same regardless of how the application itself starts:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

// Keep the app's existing browser startup code here as usual.
```

### Electron renderer

Mesurer belongs in the renderer entry because that is where the DOM exists:

```ts
// src/renderer.ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}

// Existing renderer startup follows.
```

Do not put that code in the Electron main-process entry.

`import.meta.env.DEV` and `import.meta.hot` are provided by Vite. If your project uses another bundler, use that bundler's build-time development flag and HMR cleanup mechanism instead.

## Option 2: extract Mesurer into a development helper

If you prefer to keep inspector setup separate from app startup, a Vite project can look like this:

```text
src/
├── main.tsx
└── dev/
    └── mesurer.ts
```

Your actual entry filename may be `src/main.ts`, `src/index.tsx`, `src/index.ts`, or something similar. Use whichever file currently starts your browser application.

Create `src/dev/mesurer.ts`:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()

if (import.meta.hot) {
  import.meta.hot.dispose(() => mesurer.dispose())
}
```

Then load that helper from the existing browser entry:

```ts
if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}
```

For example, a React/Vite entry using the extracted helper might look like:

```tsx
import { createRoot } from "react-dom/client"
import { App } from "./App"

if (import.meta.env.DEV) {
  void import("./dev/mesurer")
}

createRoot(document.getElementById("root")!).render(<App />)
```

The helper pattern does not change where Mesurer runs. It only moves Mesurer-specific setup out of the browser entry file.

## Add plugins in the same place you mount Mesurer

Whether you mount directly in `src/main.tsx` or use an extracted helper, keep plugin setup with `mountMesurer()`.

For example, a direct browser-entry setup with Context, Arrange, and Screenshot can be:

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

The exact same `mountMesurer({ ... })` block can instead live inside `src/dev/mesurer.ts` if you chose the extracted-module pattern.

You do not need separate app-level files for Context, Arrange, Screenshot, or other Mesurer plugins unless that organization is useful to your project.

## Try direct text editing

Direct text editing is part of the mounted renderer; there is no extra text-edit plugin to import.

1. Press **S** to activate Select, or **A** to use Text Inspector.
2. Double-click ordinary direct text on desktop, or double-tap it with touch/pen.
3. The current text is selected in full and an in-place editor opens using that target's rendered typography.
4. Mesurer automatically shows Text Inspector information for that exact field.
5. Use the compact **B / I / U / Text ▾** bar. B/I/U apply direct formatting; Text opens the detailed typography menu.
6. In **Text ▾**, choose Text or an available Heading 1/2/3 preset. Those presets come from the dominant rendered style for semantic levels the page actually uses; non-dominant page variants remain available through Font/Size/Weight/Color choices.
7. Press **Enter** to keep the edit as Desired intent or **Shift+Enter** for a newline. If the Text menu is open, **Escape** closes it first; Escape again cancels the edit session.

Arrange keeps Select active, so this also works while arranging a selected element without switching tools.

While the editor has focus, `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, and `Cmd/Ctrl+U` toggle formatting. Text/H1/H2/H3 presets use `Option+Cmd+0/1/2/3` on macOS and `Alt+Ctrl+0/1/2/3` elsewhere.

The current contract intentionally targets ordinary elements with one unambiguous non-empty direct text node. Native form controls and `contenteditable` keep their own editing behavior. Link/list structural editing is intentionally not exposed until Mesurer has a proper rich-text intent model for it.

See [`TEXT_EDITING.md`](./TEXT_EDITING.md) for the full human interaction, semantic preset rules, automatic inspector/toolbar behavior, Before/Desired/Live semantics, agent API, and validation contract.

## Files that should not mount Mesurer

Do not put `mountMesurer()` in files such as:

- `vite.config.ts` or other build configuration;
- API routes or server handlers;
- Node-only scripts;
- an Electron main-process entry;
- a shared SSR module that is also evaluated on the server.

Mesurer needs browser globals and is intended to inspect a rendered page.

## If you want Mesurer enabled outside local development

If the inspector should be present whenever that browser bundle runs, mount it in the same browser entry or client-only module without the development guard:

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer()
```

Keep the returned instance if you need to call its API or dispose it later.

For most application development, keeping Mesurer development-only is useful because it is commonly installed as a dev dependency:

```bash
bun add -d mesurer-solid
```

## HMR cleanup

During local development, hot module replacement can evaluate the module containing Mesurer more than once. Dispose the previous Mesurer instance when that module is replaced:

```ts
if (import.meta.hot) {
  import.meta.hot.dispose(() => mesurer.dispose())
}
```

If your tooling does not provide `import.meta.hot`, use its equivalent cleanup hook or explicitly dispose the instance when your development integration is torn down.

## SSR and client-only applications

If a framework can execute the same module on both the server and browser, do not call `mountMesurer()` at module scope in that shared module.

Instead, make the Mesurer setup client-only using the framework's normal client boundary or client-side lifecycle. The exact mechanism differs by framework, but the rule is the same: `mountMesurer()` must execute in the browser, not during server rendering.

If the project already has a dedicated client entry, that is the natural place to mount Mesurer directly or load an extracted Mesurer helper.

## Electron

Mesurer belongs in the renderer process because that is where the DOM exists.

```text
Electron main process     → no Mesurer
preload script            → normally no Mesurer
renderer/browser page     → mount Mesurer here
```

Use the renderer's actual browser entry and the same development guard your Electron/Vite setup already uses.

## Next steps

- [`TEXT_EDITING.md`](./TEXT_EDITING.md) — direct copy/typography editing and automatic Text Inspector context
- [`ARRANGE.md`](./ARRANGE.md) — Arrange visual layout intent, `Shift+A`, and Before/Desired/Live review
- [`SCREENSHOTS.md`](./SCREENSHOTS.md) — screenshot plugin behavior, `Shift+S`, and capture providers
- [`CONTEXT_WORKFLOW.md`](./CONTEXT_WORKFLOW.md) — selection, context, review notes, and review
- [`UPSTREAM_PARITY.md`](./UPSTREAM_PARITY.md) — current upstream audit and stable-release parity blockers
- [`HOST_ISOLATION.md`](./HOST_ISOLATION.md) — browser/host isolation guarantees
- [`../packages/mesurer/AGENT_INTEGRATION.md`](../packages/mesurer/AGENT_INTEGRATION.md) — coding-agent integration
