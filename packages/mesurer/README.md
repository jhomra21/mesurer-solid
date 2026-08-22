# @jhomra21/mesurer-solid

Framework-agnostic UI measurement, annotation, inspection, and agent-ready visual context for browser applications.

The renderer is implemented privately in Solid 2, but consumers can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

```bash
bun add -d @jhomra21/mesurer-solid@beta
# or
npm install -D @jhomra21/mesurer-solid@beta
```

## Mount the base inspector

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer();
```

The base inspector contains Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, the plugin host, and the low-level agent inspection API.

## Add annotations and agent context as a plugin

```ts
import {
  contextPlugin,
  mountMeasurer,
} from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({
  agent: true,
  plugins: [contextPlugin()],
});
```

`contextPlugin()` is a normal removable Mesurer extension. It provides the `context:v1` service and owns annotation state, Copy Context/Copy Selection/Add Note UI, shortcuts, review/capture behavior, optional delivery callbacks, and cleanup.

```ts
const workspace = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const annotation = await mesurer.context({ annotation: annotationId });
await mesurer.copyContext({ annotation: annotationId });
```

After a source edit/HMR cycle:

```ts
const review = await mesurer.review(annotationId);
```

Remove the complete feature through the same plugin host used by every extension:

```ts
mesurer.pluginHost?.remove("mesurer.context");
console.log(mesurer.agent.capabilities().capabilities.context); // false
```

The mounted/browser convenience methods resolve `context:v1`; they do not maintain a second hidden context implementation.

## Coding-agent browser API

With `agent: true` and the context plugin loaded:

```js
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
  fileURLToPath(import.meta.resolve("@jhomra21/mesurer-solid/inject-script")),
  "utf8",
);

await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);
```

Injection installs `contextPlugin()` by default and disposes a previous injected instance before remounting. To inject only the base/low-level inspector:

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

Capture mode hides Mesurer controls while preserving guides, rulers, measurements, distances, annotation/selection markers, and pixel labels.

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
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

It writes `.agents/skills/mesurer-ui/SKILL.md` for Agent-Skills-compatible harnesses.

## ACP

Mesurer does not discover agents, manage processes, or choose sessions. The ACP client/harness that already owns a target session sends Mesurer output.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one context text block plus optional labeled image blocks. If image prompts are unavailable, send the text block only. Copy Context remains the universal fallback.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, renderer-owned UI, and lifecycle cleanup. Built-ins can be excluded/replaced without forking the renderer.

## Public surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

The package is self-contained. Private core/DOM/renderer workspaces and the internal Solid runtime must not leak into the published consumer surface.

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
