# Mesurer

Framework-agnostic UI measurement and inspection tools for browser applications and coding agents.

Mesurer keeps the parity-proven UI renderer implemented in Solid 2, but Solid is an internal implementation detail. Users install one package, `@jhomra21/mesurer`, and can mount it in Solid 1, Solid 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without sharing Mesurer's Solid runtime.

## Install

During the prerelease period:

```bash
bun add -d @jhomra21/mesurer@beta
```

After a stable release, the same package can be installed without the `@beta` tag.

## Use in any browser UI

```ts
import { mountMeasurer } from "@jhomra21/mesurer";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;
```

`mountMeasurer()` creates an isolated browser island by default. The host framework does not need Solid 2 and does not share Mesurer's renderer runtime.

This same entry point is intended for:

- Solid 1
- Solid 2
- React
- Vue
- Svelte
- vanilla browser applications
- Electron renderer processes

Electron main-process code is not a DOM host; mount Mesurer in the renderer page.

## Coding-agent feedback loop

Agents should normally avoid modifying the user's application. Instead, resolve and inject the `@jhomra21/mesurer/inject` export from the browser harness:

```js
import { fileURLToPath } from "node:url";

const injectPath = fileURLToPath(
  import.meta.resolve("@jhomra21/mesurer/inject"),
);

await page.addScriptTag({
  type: "module",
  path: injectPath,
});

await page.evaluate(() => window.__MESURER__.ready());

const feedback = await page.evaluate(() =>
  window.__MESURER__.feedback([
    "main",
    "[data-testid='toolbar']",
  ]),
);

const screenshot = await page.screenshot();
```

The bridge returns JSON-safe geometry, margin/padding/border, typography, appearance, flex/grid properties, overflow, element-to-element distances, viewport/document dimensions, plugin capabilities, and plugin state. The browser harness supplies the screenshot, allowing an agent to reason from exact measurements and pixels together.

See [`AGENTS.md`](./AGENTS.md) for the harness contract.

## Plugins and extensions

Built-in features and external extensions use the same plugin host. Plugins can register tools, commands, hooks, overlays, settings contributions, scoped state, renderer services, and disposal callbacks. Plugin state can opt into history and persistence, and plugins can be loaded, removed, or replaced at runtime.

Plugin authors can use the public core subpath without installing a second package:

```ts
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer/core";
```

The public package surface is intentionally small:

```text
@jhomra21/mesurer
@jhomra21/mesurer/core
@jhomra21/mesurer/inject
```

The framework-neutral core, DOM adapter, and Solid 2 renderer remain private workspace implementation details.

## Visual and behavioral parity

The reference renderer continues to track the pinned upstream Mesurer UI and behavior, including selection, guides, rulers, text inspection, X-ray, color picking, distances, settings, history, and persistence.

CI compares the renderer against the pinned React upstream implementation through matched screenshots and exhaustive interaction gates, including native-3× side-by-side captures.

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

The package-smoke workflow additionally packs the exact npm artifact, installs that tarball into clean React and Solid 1 applications, typechecks the published declarations, launches the real apps in Chromium, and exercises the mounted package and agent feedback loop.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for internal boundaries and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution.
