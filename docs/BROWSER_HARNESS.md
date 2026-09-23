# Browser and agent integration

Mesurer does not own browser automation. It reads and presents page state through the browser evaluation channel already available to the coding tool.

For the full agent workflow, use [Agent Integration](../packages/mesurer/AGENT_INTEGRATION.md). That guide covers preserving human state, reading intent, editing source, and verifying Live output. This document defines only the browser boundary.

## Preferred integration order

Use the least invasive path available:

1. reuse a live `window.__MESURER__` instance;
2. inject the packaged `mesurer-solid/inject-script` through an existing browser-evaluation channel;
3. attach through an existing browser/Electron debug channel and inject only when absent;
4. mount Mesurer in application source only when persistent embedded tooling is explicitly wanted or no external evaluation path exists.

Do not create a Mesurer-specific browser process, dev server, CDP client, Electron main/preload path, or alternate application build when the existing browser controller can already evaluate JavaScript in the rendered page.

## Injection artifact

The portable classic-script artifact is:

```text
mesurer-solid/inject-script
```

The repository helper prints the same built artifact:

```bash
bun run browser:inject-script
```

The ES-module `mesurer-solid/inject` entry is available to browser tools that support module injection.

Injected Mesurer carries its own isolated Solid 2 renderer/runtime. It does not require the host application's framework runtime.

## Browser ownership

The browser controller owns:

- navigation and page lifetime;
- clicking/typing in the host application;
- authentication/session state;
- tabs/windows;
- general screenshots and artifact storage;
- source editing and dev-server lifecycle.

Mesurer owns:

- visual measurement/inspection;
- selection and structured Context;
- annotations/review;
- Arrange and direct text Desired intent;
- Mesurer commands/plugin state;
- Mesurer-owned UI;
- optional human screenshot UI.

The screenshot plugin is not a replacement for the browser controller's task screenshot capability.

## Existing human state

Injection must not replace a connected Mesurer instance by default. Existing selection, annotations, measurements, guides, Arrange/text intent, and screenshot UI may be part of the user's message.

A controller that owns a long-lived injected session may set `recoverDisconnected: true` in `MesurerInjectConfig`. Mesurer then remounts if page DOM replacement disconnects the injected host. The default remains `false`, and an owning controller must disable recovery before an intentional disposal.

The exact intent-inventory and stale-target rules are maintained in [Agent Integration](../packages/mesurer/AGENT_INTEGRATION.md).

## Repository browser adapter

`scripts/browser-harness/` is a repository/CI adapter for exercising the public injection artifact. It is not a required runtime dependency or public transport protocol.

Changes to injection/reuse behavior should be proven through the relevant host/browser contracts under `tests/` and package smoke coverage.

## Host isolation

Browser integration must preserve Mesurer's host-isolation rules across Shadow DOM, top-layer UI, modal dialogs, nested documents/scrolling, and document-backed inspector mounts.

See [Host isolation](./HOST_ISOLATION.md) for those renderer contracts.
