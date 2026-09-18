# Mesurer Solid

[![npm](https://img.shields.io/npm/v/mesurer-solid.svg)](https://www.npmjs.com/package/mesurer-solid)
[![CI](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml/badge.svg)](https://github.com/jhomra21/mesurer-solid/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-black.svg)](./LICENSE)

Inspect, measure, and express visual intent directly on a live browser UI.

Mesurer Solid is a Solid 2 port and extension of [Mesurer](https://github.com/ibelick/mesurer) by [Julien Thibeaut](https://github.com/ibelick). It keeps Mesurer's source-first visual language while adding framework-agnostic mounting, plugins, agent-readable context, reversible layout and text intent, screenshot capture, and host isolation.

The renderer carries its own isolated Solid 2 runtime. Your application can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without installing Solid for Mesurer.

<p align="center">
  <img src="docs/assets/readme/hero-multi-spacing.png" alt="Mesurer Solid measuring spacing between selected elements" width="100%">
</p>

## Installation

```bash
bun add -d mesurer-solid
```

or:

```bash
npm install -D mesurer-solid
```

Use `mesurer-solid@beta` only when intentionally testing a prerelease.

## Usage

Mount Mesurer once from the browser entry for the page you want to inspect:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

For Vite, that usually means `src/main.tsx`, `src/main.ts`, or the equivalent browser entry. In Electron, use the renderer entry. In SSR applications, mount from a client-only boundary. Do not mount Mesurer from server code, build configuration, or an Electron main process.

See [Getting started](./docs/GETTING_STARTED.md) for framework-specific placement and HMR guidance.

### Add first-party plugins

All first-party plugin factories live at `mesurer-solid/plugins` and use the plugin name directly:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrange, context, screenshot } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [
    context(),
    arrange(),
    screenshot(),
  ],
})
```

The same entry also exposes `select`, `xray`, `colorPicker`, `rulers`, `typography`, `guides`, `distance`, `settings`, `defaults`, and `compose` for applications that want to build a custom plugin set explicitly.

## Features

- **Select** — inspect one or more rendered elements.
- **Distance** — measure spacing and geometry, including pairwise multi-selection spacing.
- **X-ray, guides, and rulers** — inspect page structure and alignment.
- **Typography** — inspect rendered type and directly preview reversible copy and typography changes.
- **Arrange** — drag selected UI into a Desired layout without writing application source.
- **Screenshots** — capture a dragged visible-tab region with the optional screenshot plugin.
- **Context and annotations** — expose selection, geometry, styles, measurements, guides, notes, and human intent to code or coding agents. Saved annotations persist across same-tab reloads, conservatively rebind to their original DOM targets, stay attached through scrolling, keep repeated-note markers local, leave Add Note available while a saved note is open, and keep cards/composers above Select hover and selection chrome.
- **Plugins** — add tools, commands, overlays, settings, state, hooks, and services at runtime.
- **Compact toolbar** — collapse inactive controls while every active tool remains visible; expanding restores the same stable toolbar and order.
- **Color Picker** — use the browser's native `EyeDropper` when it is operational. Unsupported hosts do not advertise the tool.

Mesurer Solid uses one stable toolbar. Arrange is a normal optional tool, not a toolbar mode. Clicking Arrange automatically enables Select; turning Arrange off leaves Select active, while turning Select off also exits Arrange.

## Shortcuts

Global shortcuts are enabled by default. Turn them off from **Settings → General → Shortcuts** or mount with `shortcutsEnabled: false`. Disabling global shortcuts does not disable toolbar controls, editor-local keyboard behavior, or Escape/cancel handling.

| Shortcut | Action |
| --- | --- |
| `M` | Toggle Mesurer |
| `S` | Select |
| `X` | X-ray |
| `P` | Native Color Picker when supported |
| `R` | Rulers |
| `A` | Typography |
| `G` | Guides |
| `H` / `V` | Horizontal / vertical guide orientation |
| `Alt` / `Option` | Distance overlay |
| `Cmd/Ctrl + ,` | Settings |
| `Shift + A` | Arrange |
| `Shift + S` | Screenshot |
| `C` | Copy Context |
| `Shift + C` | Copy Selection |
| `N` | Add Note |

Plugin shortcuts appear only when the corresponding plugin is mounted and enabled.

## Direct text editing

With Select or Typography active, double-click ordinary direct text to edit it on the rendered page. Mesurer previews the text and typography as reversible Desired intent; it does not write source code.

Direct edit owns the visible selection chrome for the field: one edit ring remains visible, the selected dimensions pill stays clear of Typography with symmetric `2px / 2px` spacing when the card is below the target, and ordinary pointer movement does not move the Typography card. The selection-adjacent Add Note button is hidden only while editing is active and returns when the editor closes; saved annotations are unaffected.

Native editing stays native. Mesurer does not intercept form controls or descendants that inherit `contenteditable`. A nested `contenteditable="false"` boundary ends that inherited editable region, so an otherwise valid direct-text target inside it can use Mesurer editing.

Undo and redo update the rendered Desired preview while Mesurer still owns the current text/style value. If the application changes that value itself, Mesurer relinquishes ownership instead of overwriting the host change.

See [Direct text editing and Typography](./docs/TEXT_EDITING.md).

## Arrange

Arrange records Before and Desired geometry while previewing the requested layout through temporary browser presentation. It activates Select automatically, supports snapping and multi-selection, persists intent, and exposes Before/Desired/Live review APIs for agents.

Arrange restores a previous inline transform only while the element still carries the exact preview value and priority Mesurer applied. Host-authored transform changes take ownership and survive Live review, refresh, and disposal.

See [Arrange](./docs/ARRANGE.md).

## Agent integration

Enable the agent bridge when a coding agent should read the same rendered state and human intent:

```ts
import { mountMesurer } from "mesurer-solid"
import { arrange, context } from "mesurer-solid/plugins"

const mesurer = mountMesurer({
  agent: true,
  plugins: [context(), arrange()],
})
```

Read context or select exact rendered targets:

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select(["#pricing-card", "#pricing-cta"])
```

The portable Mesurer skill teaches compatible agents to preserve existing human state, consume Arrange/text/annotation intent before editing source, and verify the real Live result afterward:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

See [Agent integration](./packages/mesurer/AGENT_INTEGRATION.md) and the packaged [`mesurer-ui` skill](./.agents/skills/mesurer-ui/SKILL.md).

### Queue human feedback to Codex

The optional Codex transport keeps Context as the feedback source and uses Codex's queued-user-message path. In a Codex-controlled local project, the trusted `SessionStart` integration runs `mesurer-codex-connect`, which starts or reuses the loopback companion and registers the current Codex session together with its project directory. A separate bridge terminal is not required.

From a Codex shell or tool environment, the packaged connector can also be run directly:

```bash
bunx mesurer-codex-connect
```

The low-level `mesurer-codex` command remains available for diagnostics or explicit foreground process ownership:

```bash
bunx mesurer-codex --thread <SESSION> --cwd <PROJECT_DIRECTORY>
```

Mount Codex alongside Context:

```ts
import { mountMesurer } from "mesurer-solid"
import { codex, context } from "mesurer-solid/plugins"

mountMesurer({
  plugins: [context(), codex()],
})
```

Mounting `codex()` does not contact localhost. The first **Queue to Codex** press or **Choose Codex thread…** menu action establishes the connection. If the bridge is unavailable, the action becomes disabled as **Codex unavailable** and the dropdown offers **Retry Codex connection**. After one successful connection, Mesurer health-checks the known companion and recovers automatically if it restarts.

**Queue to Codex** is owner-aware. For Codex Desktop, the trusted SessionStart connector registers the app-tools pipe, Mesurer keeps the feedback in a local durable queue, waits while the destination reports an active turn, then submits through Desktop's own `codex_app` transport after observing idle/not-loaded state. Desktop does **not** require Mesurer to start the standalone app-server daemon. For CLI/TUI shared-daemon environments, Mesurer keeps Codex's native `codex queue` path and durable queued-submission id.

Desktop's app-tools API currently has no atomic queue-only cross-thread send, so the idle check and send are best-effort rather than an absolute no-steer guarantee. Mesurer does not knowingly steer an active turn, never blindly retries an uncertain Desktop send, and shows **Codex delivery blocked** while delivery cannot be confirmed. Desktop queue state survives a bridge restart from `$CODEX_HOME/mesurer/codex-deliveries.json`; older native queue items are migrated by exact id without creating a duplicate. Programmatic `send()` reports `delivery: "queued"` plus dispatch metadata.

Queue delivery has visible lifecycle state. The action disables immediately while it is queueing so a double-click cannot submit the same review twice, then changes through **Queued for Codex**, **Codex working…**, and **Codex finished** as the trusted Codex hooks correlate that exact queued prompt with its turn. The selected destination row shows the same state.

When a completed delivery included saved annotations, `codex()` removes only those exact annotation ids after Codex reports the matching turn finished. An interrupted turn keeps its annotations for retry. Active delivery state is saved per tab so a page reload can resume the same tracked delivery rather than losing its completion/cleanup state. Set `clearCompletedAnnotations: false` when an application wants completed notes to remain visible. This completion signal tracks the Codex turn lifecycle; it is not an independent semantic proof that the requested UI change is correct.

Each Mesurer page keeps the Codex thread that originally connected it as its default destination. That page affinity survives reloads in the same browser tab. If there is no saved page affinity and the bridge exposes multiple registered threads, Mesurer requires an explicit destination instead of inheriting a stale bridge-wide default. The split menu shows the originating/current thread first, then up to four recent same-project Codex threads discovered through Codex app-server. **Show 5 more…** expands the list to at most ten. Selecting another thread changes only that page's destination.

Mesurer does not create new Codex threads. Create or open a new thread in Codex; the trusted `SessionStart` path registers it automatically. Programmatic callers can use `health()`, `listThreads()`, `useThread(thread)`, and `send({ thread })`. Browser pages cannot register arbitrary sessions, provide an arbitrary project directory, or target a thread the bridge has not registered or discovered for that project.

See [Queue Context feedback to Codex](./docs/CODEX.md).
## Documentation

Start with the [documentation index](./docs/README.md).

- [Getting started](./docs/GETTING_STARTED.md)
- [Direct text editing and Typography](./docs/TEXT_EDITING.md)
- [Arrange](./docs/ARRANGE.md)
- [Screenshots](./docs/SCREENSHOTS.md)
- [Context workflow](./docs/CONTEXT_WORKFLOW.md)
- [Queue Context feedback to Codex](./docs/CODEX.md)
- [Browser harness](./docs/BROWSER_HARNESS.md)
- [Host isolation](./docs/HOST_ISOLATION.md)
- [Trusted Types](./docs/TRUSTED_TYPES.md)
- [Upstream parity](./docs/UPSTREAM_PARITY.md)
- [Architecture](./ARCHITECTURE.md)

## Upstream

Mesurer Solid tracks upstream Mesurer source rather than recreating its UI from memory. The current upstream audit is pinned to `ibelick/mesurer@19446bd845a957cfc96e76b4393916b8153ab8e0`; adopted behavior and deliberate product differences are recorded in [Upstream parity](./docs/UPSTREAM_PARITY.md).

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).