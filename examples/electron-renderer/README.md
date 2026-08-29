# Electron renderer usage

Electron renderer processes expose the same DOM boundary Mesurer uses in a browser. No Electron API is required for inspection itself.

```ts
import { mountMesurer } from "mesurer-solid";

const mesurer = mountMesurer({ target: document.body });
```

Keep `contextIsolation` enabled. If a plugin needs privileged filesystem or main-process behavior, expose a narrow API from preload with `contextBridge`, then consume that API from the plugin. Mesurer core and the DOM adapter intentionally do not import Electron.
