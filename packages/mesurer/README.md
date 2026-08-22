# @jhomra21/mesurer-solid

Framework-agnostic UI measurement, annotation, inspection, and agent-ready visual context for browser applications.

The renderer is implemented privately in Solid 2, but consumers can use Solid 1/2, React, Vue, Svelte, vanilla DOM, or Electron renderer pages without providing Solid.

## Install

```bash
bun add -d @jhomra21/mesurer-solid@beta
# or
npm install -D @jhomra21/mesurer-solid@beta
```

## Mount in your app

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer();
```

Mesurer includes Select, X-ray, Color Picker, Rulers, Text Inspector, Guides, Distance, Settings, annotations, Copy Context, and agent-readable context/review APIs.

## Human annotations and context

Select one or more page elements and choose **Add note**. Mesurer anchors the human note to durable selector/fingerprint data and records a visual baseline.

```ts
const workspace = await mesurer.context();
const selected = await mesurer.context({ scope: "selection" });
const annotation = await mesurer.context({ annotation: annotationId });

await mesurer.copyContext({ annotation: annotationId });
```

Scoped context automatically includes relevant guides, measurements, held distances, exact DOM inspection, viewport state, and the user's annotation note. Relevance is deterministic geometry/reference matching rather than model inference.

After a source edit/HMR cycle:

```ts
const review = await mesurer.review(annotationId);
```

`review()` compares the annotation baseline with freshly resolved geometry. Annotation targets only rebind after DOM replacement when the selector has exactly one fingerprint-compatible result; otherwise Mesurer reports them stale.

## Coding-agent browser API

Enable the page global with `agent: true`, or use one of the injection entry points:

```ts
const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;
```

```js
window.__MESURER__.capabilities()
await window.__MESURER__.annotations()
await window.__MESURER__.context({ annotation: annotationId })
await window.__MESURER__.stable()
await window.__MESURER__.review(annotationId)
```

The original low-level inspection API remains available:

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

The injector disposes a previous injected instance before remounting.

See [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md).

## Clean screenshot evidence

Mesurer does not own a browser screenshot engine. It prepares the actual page so the outer harness can capture real pixels:

```js
const plan = await window.__MESURER__.capturePlan({ annotation: annotationId })
await window.__MESURER__.prepareCapture()
try {
  // Capture the real viewport and optional plan.focus rectangle.
} finally {
  await window.__MESURER__.finishCapture()
}
```

Capture mode hides Mesurer controls while preserving evidence such as guides, rulers, measurements, distances, annotation/selection markers, and rendered pixel labels.

## Portable Agent Skill

There are no Mesurer packages for individual harnesses.

The npm package ships one canonical `mesurer-ui` Agent Skill. Install it into the current repository with:

```bash
npx --yes --package=@jhomra21/mesurer-solid@beta mesurer-skill install
```

It writes `.agents/skills/mesurer-ui/SKILL.md`, where Agent-Skills-compatible harnesses can discover the human-in-the-loop visual validation workflow.

## ACP

Mesurer does not discover agents, manage processes, or choose sessions. The ACP client/harness that already owns a target session sends Mesurer output.

```ts
import { toAcpContentBlocks } from "@jhomra21/mesurer-solid";

const blocks = toAcpContentBlocks(context, images);
```

The result is one text block plus optional image blocks. If image prompts are unavailable, send the text block only. Copy Context remains the universal fallback.

## Optional host callbacks

```ts
const mesurer = mountMeasurer({
  evidenceProvider: async ({ context, plan }) => {
    // Use the host/harness real screenshot primitive.
    return [];
  },
  sendContext: async ({ context, text, images }) => {
    // Deliver with the ACP client/session already owned by the host.
  },
});
```

`sendContext` is inversion of control, not another Mesurer transport protocol. If it is absent, the Send button is not shown.

## Plugins

```ts
import {
  createMesurerPluginHost,
  createMesurerRuntime,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

Plugins can contribute tools, commands, hooks, overlays, settings, state, services, history/persistence, and cleanup. Built-ins can be excluded/replaced without forking the renderer.

## Public surface

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

The package is self-contained. Private core/DOM/renderer workspaces and the internal Solid runtime must not leak into the published consumer surface.

MIT. Adapted from `ibelick/mesurer`; see `THIRD_PARTY_LICENSES.md`.
