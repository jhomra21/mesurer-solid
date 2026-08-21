# Mesurer Solid

Solid-powered, framework-agnostic UI measurement and inspection tools for browser applications and coding agents.

Mesurer Solid keeps the parity-proven UI renderer implemented in Solid 2, but Solid is an internal implementation detail. Users install one package, `@jhomra21/mesurer-solid`, and can mount it in Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without sharing Mesurer's Solid runtime.

## Install

During the prerelease period:

```bash
bun add -d @jhomra21/mesurer-solid@beta
```

## Use in any browser UI

```ts
import { mountMeasurer } from "@jhomra21/mesurer-solid";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;
```

`mountMeasurer()` creates an isolated browser island by default. The host framework does not need Solid 2 and does not share Mesurer's renderer runtime. Electron main-process code is not a DOM host; mount or inject Mesurer in the renderer page.

## Coding agents: bring your own browser tool

Mesurer does not require Playwright, Chromium ownership, a second CDP connection, or a Mesurer-specific browser RPC server. If Codex, Claude Code, Droid, Pi, OpenCode, ChatGPT tooling, or another harness can execute JavaScript in its existing browser tab, it can use Mesurer.

The package publishes a self-contained classic-script payload:

```text
@jhomra21/mesurer-solid/inject-script
```

Resolve/read that file in the agent environment and pass its source to the browser tool's existing JavaScript-evaluation primitive. Conceptually:

```js
const source = await readMesurerInjectScript();
await browser.evaluate(source);
await browser.evaluate(`window.__MESURER__.ready()`);

const result = await browser.evaluate(`
  window.__MESURER__.feedback(["header", "main", "button"])
`);
```

After injection, `window.__MESURER__` exposes exact DOM geometry, box model, typography, appearance, layout, overflow, distances, viewport state, plugin capabilities, commands, and plugin state. Keep using the outer harness for navigation, clicking, typing, screenshots, tabs, authentication, and browser lifetime.

Inside this repository, after `bun run build`, the exact source can be printed with:

```bash
bun run browser:inject-script
```

The repository also keeps an **optional reference Playwright adapter** for manual testing only:

```bash
bun run browser:harness -- https://example.com
bun run browser:harness -- --cdp http://127.0.0.1:9222 --page 0
```

Playwright is a dev/CI dependency, not a runtime requirement for agent integrations. See [`docs/BROWSER_HARNESS.md`](./docs/BROWSER_HARNESS.md) and [`AGENTS.md`](./AGENTS.md).

## Plugins and extensions

Built-in features and external extensions use the same plugin host. Plugins can register tools, commands, hooks, overlays, settings contributions, scoped state, renderer services, and disposal callbacks. Plugin state can opt into history and persistence, and plugins can be loaded, removed, or replaced at runtime.

Plugin authors can use the public core subpath without installing a second package:

```ts
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid/core";
```

The public package surface is intentionally small:

```text
@jhomra21/mesurer-solid
@jhomra21/mesurer-solid/core
@jhomra21/mesurer-solid/inject
@jhomra21/mesurer-solid/inject-script
```

`/inject` is the ES-module side-effect entry for browser automation APIs that can add a module script. `/inject-script` is the classic self-executing payload for generic browser-evaluation tools.

## Visual and behavioral parity

The reference renderer continues to track the pinned upstream Mesurer UI and behavior, including selection, guides, rulers, text inspection, X-ray, color picking, distances, settings, history, and persistence.

CI compares the renderer against the pinned React upstream implementation through matched screenshots, explicit Settings/control/icon geometry contracts, and exhaustive interaction gates, including native-3× side-by-side captures.

## Development

```bash
bun install
bun run dev
```

Validation:

```bash
bun run typecheck
bun run test
bun run build
```

The package-smoke workflow packs the exact npm artifact, installs it into clean framework hosts, and evaluates the packed `inject-script.js` directly in a React page that has no Mesurer import. Playwright is used there only as deterministic CI browser infrastructure.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for internal boundaries and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution.
