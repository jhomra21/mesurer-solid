# Mesurer agent integration

Mesurer is designed to be injected into the browser or renderer that an agent already controls.

## Default: inject, do not integrate

**Default host-project mutation budget: zero.** If the existing browser, Electron, WebView, or automation harness can execute JavaScript in the target renderer, do not edit the target application's source or build merely to use Mesurer.

```text
existing harness
  → existing page / renderer
  → evaluate @jhomra21/mesurer-solid/inject-script
  → window.__MESURER__
```

Resolve/read the published classic-script payload and evaluate it through the harness's existing JavaScript primitive:

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

Do not create a second Chromium instance, second CDP connection, Mesurer-specific Playwright wrapper, `start:mesurer` / `package:mesurer` command, Vite flag, Electron main/preload integration, or alternate build as the default solution.

## Packaged applications

Prefer the ordinary packaged artifact plus an existing renderer attach/evaluate channel. If the normal executable can be launched with CDP or another debug evaluation channel, launch that **same artifact**, attach with the existing harness, and inject Mesurer at runtime.

An already-running packaged application that exposes no renderer-evaluation channel may not be attachable after the fact. Explain that transport limitation instead of automatically changing application source.

## When source mounting is appropriate

Use `mountMeasurer()` from application code only when:

- the user explicitly wants Mesurer embedded or automatically present on every development launch; or
- no external JavaScript-evaluation path exists and source integration is acceptable.

## Ownership boundary

The outer harness owns navigation, clicking, typing, screenshots, tabs/windows, authentication/session state, browser process lifetime, and CDP/browser transport.

Mesurer owns measurement, inspection, its UI/commands, plugin state, and extension runtime.

For meaningful visual work, pair Mesurer's rendered numeric feedback with screenshots from the outer harness. The rendered page is the source of truth.
