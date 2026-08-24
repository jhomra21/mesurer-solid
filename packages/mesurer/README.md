# mesurer-solid

Framework-agnostic UI measurement, annotation, inspection, and agent-ready visual context for browser applications.

The renderer is implemented privately in Solid 2, but consumers can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

```bash
bun add -d mesurer-solid@beta
# or
npm install -D mesurer-solid@beta
```

> **Package rename:** prereleases through `0.1.0-beta.11` were published as `@jhomra21/mesurer-solid`. New releases use the canonical unscoped package name `mesurer-solid`. The API is unchanged; update dependency and import specifiers to the new name.

## Mount the base inspector

```ts
import { mountMeasurer } from "mesurer-solid";

const mesurer = mountMeasurer();
```

The base inspector contains Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, the plugin host, and the low-level agent inspection API.

## Enable context, copy actions, and annotations

Context and annotation features are provided by the removable `mesurer.context` plugin. Source-mounted applications opt in explicitly:

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "mesurer-solid";

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
});
```

With the default `contextPlugin()` UI enabled, Mesurer adds these controls to the existing draggable toolbar:

| Action | Shortcut | What it does |
| --- | --- | --- |
| Copy Context | `C` | Copies the current workspace context. |
| Copy Selection | `Shift+C` | Copies context scoped to the selected element(s) or dragged region. |
| Add Note | `N` | Creates an annotation for the current element selection or dragged region. |
| Send selection | `Cmd/Ctrl+Enter` | Appears only when `sendContext` is configured and sends scoped context through the host callback. |

### Annotating elements, multi-selection, and regions

For one element, select it and use the floating annotation button, **Add Note** in the toolbar, or `N`.

For multiple elements, Shift-select the elements you want to annotate. The floating annotation button starts on the first selected element and follows the selected element currently under the pointer. The composer shows the selected-element count, and the saved annotation keeps **all** selected targets in its context rather than only the element that hosted the button.

Saved annotation markers can be clicked to reopen their note panel. The note composer and saved annotation panels can both be dragged by their header, while the underlying selection remains intact. Saved panels also show how many elements the note applies to.

For an arbitrary dragged region with no element target, use **Add Note** in the toolbar or `N`. Region-only notes are fully supported even though the small floating annotation button is element-selection focused.

### Use the same context programmatically

`contextPlugin()` provides the `context:v1` service and owns annotation state, Copy Context/Copy Selection/Add Note UI, shortcuts, review/capture behavior, optional delivery callbacks, and cleanup.

```ts
const workspace = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const annotation = await mesurer.context({ annotation: annotationId });
await mesurer.copyContext({ annotation: annotationId });
```

A scoped context includes `regions`, the viewport rectangles the person actually selected or annotated. That keeps arbitrary-area feedback useful even when no DOM element is inside the region, and gives screenshot planning the same focus area the structured context uses.

After a source edit/HMR cycle:

```ts
const review = await mesurer.review(annotationId);
```

Review uses stable annotation target IDs, conservatively rebinds replaced DOM, and reports relevant baseline evidence that disappears with `kind: "missing"`.

### Context without visible UI

If a host wants the context/review APIs but not the Copy/Add Note toolbar controls or annotation UI, keep the plugin and disable only its UI:

```ts
const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin({ ui: false })],
});
```

Remove the complete feature through the same plugin host used by every extension:

```ts
mesurer.pluginHost?.remove("mesurer.context");
console.log(mesurer.agent.capabilities().capabilities.context); // false
```

The mounted/browser convenience methods resolve `context:v1`; they do not maintain a second hidden context implementation.

## Coding-agent browser API

With `agent: true` and the context plugin loaded, wait for plugin initialization before reading dynamic capabilities:

```js
await window.__MESURER__.ready()
window.__MESURER__.capabilities()
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
await window.__MESURER__.stable()
await window.__MESURER__.review(annotationId)
```

The original low-level inspection API remains available regardless of the context plugin:

```text
inspect / inspectAll / at
distance / viewport / feedback
describe / command / state / stable
```

## Inject into an existing harness

Do not create another browser or change application source just for Mesurer when the harness already has a page JavaScript-evaluation primitive.

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = await readFile(
  fileURLToPath(import.meta.resolve("mesurer-solid/inject-script")),
  "utf8",
);

await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

Injection installs `contextPlugin()` **by default**, so Copy Context, Copy Selection, Add Note, annotation markers, and the context/review APIs are available without extra configuration. To inject only the base/low-level inspector:

```js
window.__MESURER_CONFIG__ = { context: false };
```

See [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Clean screenshot evidence

The context plugin does not own a screenshot engine. It prepares the actual page so the outer harness can capture real pixels:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Capture the real viewport and optional focus crop.
} finally {
  await window.__MESURER__.finishCapture()
}
```

The focus crop includes scoped `regions`, so element-free area annotations still get close-up evidence. Capture mode hides Mesurer controls while preserving guides, rulers, measurements, distances, annotation/selection markers, and pixel labels.

## Optional host delivery

Screenshot and direct-send capabilities belong to the plugin configuration rather than core mount options:

```ts
const mesurer = mountMeasurer({
  agent: true,
  plugins: [
    contextPlugin({
      evidenceProvider: async ({ context, plan }) => {
        // Use the host/harness real screenshot primitive.
        return [];
      },
      sendContext: async ({ context, text, images }) => {
        // Deliver with the ACP client/session already owned by the host.
      },
    }),
  ],
});
```

Without `sendContext`, the plugin does not render a Send control.

## Portable Agent Skill

There are no Mesurer packages for individual harnesses. The npm package ships one canonical `mesurer-ui` Agent Skill:

```bash
npx --yes --package=mesurer-solid@beta mesurer-skill install
```

The transient installer leaves a self-contained skill at `.agents/skills/mesurer-ui/`, including `assets/inject-script.js`. An Agent-Skills-compatible harness can therefore discover the workflow and inject Mesurer through its existing browser evaluation channel without keeping the npm package installed in the application.

## ACP

Mesurer does not discover agents, manage processes, or choose sessions. The ACP client/harness that already owns a target session sends Mesurer output.

```ts
import { toAcpContentBlocks } from "mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one context text block plus optional labeled image blocks. If image prompts are unavailable, send the text block only. Copy Context remains the universal fallback.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "mesurer-solid/core";
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, renderer-owned UI, and lifecycle cleanup. Built-ins can be excluded/replaced without forking the renderer. Plugin tools render through the same canonical toolbar button path as built-ins; programmatic built-in commands use the owning renderer instance rather than toolbar DOM labels or synthetic keyboard events.

## Public surface

```text
mesurer-solid
mesurer-solid/core
mesurer-solid/inject
mesurer-solid/inject-script
```

The package is self-contained. Private core/DOM/renderer workspaces and the internal Solid runtime must not leak into the published consumer surface.

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
