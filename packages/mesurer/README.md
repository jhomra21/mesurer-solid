# @jhomra21/mesurer

Framework-agnostic browser entry point for Mesurer.

```ts
import { mountMeasurer } from "@jhomra21/mesurer";

const mesurer = mountMeasurer();
// later: mesurer.dispose()
```

`mountMeasurer()` creates an isolated ShadowRoot by default and bundles its own Solid 2 renderer/runtime. The host application therefore does not need Solid 2 and can be Solid 1, React, Vue, Svelte, vanilla DOM, or an Electron renderer.

The returned instance exposes the loaded plugin host once mounted. `instance.describe()` gives agents and developer tooling a machine-readable snapshot of loaded plugins, tools, state slices, commands, hooks, settings contributions, and overlays.
