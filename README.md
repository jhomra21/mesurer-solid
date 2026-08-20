# Mesurer for Solid and browser agents

A Solid 2-native port of [ibelick/mesurer](https://github.com/ibelick/mesurer) with a framework-neutral core, runtime plugin architecture, universal browser mount, and an injectable measurement harness for coding agents.

The default Solid UI still targets upstream Mesurer's behavior **and visual design**. The refactor changes ownership and extensibility underneath the parity-proven renderer rather than redesigning the tool.

## Packages

```text
@jhomra21/mesurer-core
  framework-neutral state, history, plugin host and domain contracts

@jhomra21/mesurer-dom
  browser/DOM host adapters and shared box-model inspection

@jhomra21/mesurer-solid
  native Solid 2 renderer and component API

@jhomra21/mesurer
  self-contained universal browser island, mount API and agent harness
```

Solid 2 applications can use the native component:

```tsx
import { Measurer } from "@jhomra21/mesurer-solid";

export function App() {
  return <>
    <YourApp />
    <Measurer />
  </>;
}
```

Other browser hosts, including Solid 1, use the universal mount:

```ts
import { mountMeasurer } from "@jhomra21/mesurer";

const mesurer = mountMeasurer({ agent: true });
await mesurer.ready;
```

## Coding-agent feedback loop

An agent does not need to modify the user's application. The harness can inject `@jhomra21/mesurer/inject` into the already-running page and use `window.__MESURER__` for exact UI feedback.

```js
import { fileURLToPath } from "node:url";

const injectPath = fileURLToPath(import.meta.resolve("@jhomra21/mesurer/inject"));
await page.addScriptTag({ type: "module", path: injectPath });
await page.evaluate(() => window.__MESURER__.ready());

const feedback = await page.evaluate(() =>
  window.__MESURER__.feedback(["main", "[data-testid='toolbar']"]),
);
const screenshot = await page.screenshot();
```

The bridge reports element rects, margin/padding/border, typography, appearance, flex/grid properties, overflow, element-to-element distances, viewport/document dimensions, plugin capabilities and plugin state. The browser harness remains responsible for screenshots, allowing an agent to use exact DOM measurements and pixels together.

See [`AGENTS.md`](./AGENTS.md) for the agent contract.

## Plugins

Built-in features use the same public plugin host available to external extensions:

- Select
- X-ray
- Color Picker
- Rulers
- Text Inspector
- Guides
- Distance
- Settings

Plugins can register tools, commands, hooks, overlays, settings contributions, and state slices with optional history/persistence. They can be loaded, removed or replaced at runtime.

## Visual parity

The Solid renderer tracks upstream Mesurer's visible component structure and behavior, including:

- toolbar dimensions, ordering, drag behavior, SVG iconography and delayed tooltips
- guide orientation flyout
- settings popover and controls
- native color-picker result popover
- rulers and edge reveal
- measurement, selection, guide and distance overlays
- text-inspector card

CI keeps the pinned upstream React implementation and Solid implementation side-by-side through screenshot and exhaustive interaction gates.

## Develop

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

The host compatibility workflow additionally builds a real Solid 1 app with **no Mesurer dependency**, injects the standalone agent bundle from Chromium, measures that app, invokes Mesurer commands, and exercises runtime plugin add/remove behavior.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for package boundaries and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) for upstream attribution.
