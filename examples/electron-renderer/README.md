# Electron renderer example

Mesurer runs in the Electron renderer process because that is where the DOM exists.

```ts
import { mountMesurer } from "mesurer-solid"

const mesurer = mountMesurer({ target: document.body })
```

Keep `contextIsolation` enabled. Mesurer itself does not need Electron APIs. If a plugin needs filesystem or main-process behavior, expose a narrow application-owned API from preload with `contextBridge` and call that API from the plugin.

Do not mount Mesurer from the Electron main process. See [Getting started](../../docs/GETTING_STARTED.md) for development guards and HMR cleanup.
