# mesurer-solid

Framework-agnostic UI inspection, measurement, visual intent, and agent-readable rendered context for browser applications.

Mesurer Solid ships its own isolated Solid 2 renderer. Host applications can use Solid 1 or 2, React, Vue, Svelte, vanilla DOM, or an Electron renderer without providing Solid.

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

Mount Mesurer from browser code:

```ts
import { mountMesurer } from "mesurer-solid"

if (import.meta.env.DEV) {
  const mesurer = mountMesurer()

  if (import.meta.hot) {
    import.meta.hot.dispose(() => mesurer.dispose())
  }
}
```

For Vite, put this in the existing browser entry such as `src/main.tsx`, `src/main.ts`, or `src/index.tsx`. In Electron, use the renderer entry. In SSR applications, mount from a client-only module or lifecycle.

`src/dev/mesurer.ts` is an optional organization pattern, not a required filename or directory. Do not mount Mesurer from `vite.config.ts`, server/API code, Node-only scripts, an Electron main process, or a module that also executes during SSR.

Full placement examples: [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md).

## First-party plugins

All public first-party plugin factories are exported from `mesurer-solid/plugins` and use the feature name directly:

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

The base inspector includes Select, X-ray, Rulers, Typography, Guides, Distance, Settings, plugin hosting, direct text editing, and the low-level inspection API. Native Color Picker is available only when the host exposes an operational `EyeDropper`.

For explicit plugin composition, `mesurer-solid/plugins` also exports `select`, `xray`, `colorPicker`, `rulers`, `typography`, `guides`, `distance`, `settings`, `defaults`, and `compose`.

| Entry | Purpose |
| --- | --- |
| `mesurer-solid` | Mount API, public domain types, and agent surface |
| `mesurer-solid/plugins` | All first-party plugin factories and plugin-specific contracts |
| `mesurer-solid/core` | Lower-level framework-neutral public contracts |
| `mesurer-solid/inject` | Programmatic browser injection |
| `mesurer-solid/inject-script` | Built classic injection artifact |
| `mesurer-skill` | Install the portable coding-agent skill |
| `mesurer-codex` | Run the optional loopback Codex queue companion |
| `mesurer-codex-connect` | Start or reuse the Codex companion and register the current Codex session |

## Features

- Select one or many rendered elements and inspect exact geometry.
- Measure distance and pairwise multi-selection spacing.
- Use X-ray, guides, rulers, and persisted settings.
- Inspect Typography and preview reversible direct copy/style changes.
- Arrange selected UI into a Desired position without changing source.
- Capture visible-tab regions through the optional Screenshot plugin.
- Read selection, measurements, guides, annotations, layout, styles, and saved human intent through Context and agent APIs.
- Keep saved annotations across same-tab reloads and conservatively rebind them to their original DOM targets; markers, cards, and ownership evidence stay attached through scrolling, repeated-note markers stay local, Add Note remains available while a note is open, and cards/composers occlude Select hover and selection chrome.
- Extend the runtime with tools, settings, overlays, commands, hooks, state, and services.
- Compact the toolbar to active controls without changing tool state or order.

Arrange is not a toolbar mode. It can be activated before a selection exists and enables Select automatically. Turning Arrange off leaves Select active; turning Select off exits Arrange.

Direct text editing respects native editing boundaries. Descendants of an editable ancestor remain native, while a nested `contenteditable="false"` boundary ends inherited editability and can become a Mesurer target when the normal direct-text rules pass.

While direct text editing is active, Mesurer keeps one visible edit ring, keeps the selected dimensions pill and Typography separated by the same `2px` rendered gap when the card is below the source, and keeps Typography stationary during ordinary pointer movement. The selection-adjacent Add Note button is suppressed only for the active edit and returns when the editor closes; saved annotation markers and panels remain available.

Mesurer previews text, styles, and Arrange transforms only while it still owns the value it applied. Host-authored changes take ownership and are preserved through undo/redo, Live review, cleanup, and disposal.

## Shortcuts

Global shortcuts are enabled by default. Turn them off from **Settings → General → Shortcuts** or pass `shortcutsEnabled: false` to `mountMesurer()`. Toolbar controls, editor-local keys, and Escape/cancel behavior remain available.

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

Plugin shortcuts are active only when their plugin is mounted and enabled.

## Agent integration

Enable `agent: true` to expose rendered state through the mounted API and `window.__MESURER__`.

```ts
const workspace = await mesurer.context()
const selected = await mesurer.select("#pricing-card")
```

Install the portable Agent Skill with:

```bash
npx --yes --package=mesurer-solid mesurer-skill install
```

The skill preserves existing human state, reads Arrange/text/annotation intent before source changes, and verifies the real Live result after implementation.

See [Agent integration](https://github.com/jhomra21/mesurer-solid/blob/main/packages/mesurer/AGENT_INTEGRATION.md).

### Optional Queue to Codex

For Codex-controlled local projects, `mesurer-codex-connect` is the normal bootstrap path. The trusted Codex `SessionStart` integration supplies the current session id and project directory, reuses the bridge at `127.0.0.1:47365` when healthy, or starts the packaged companion when needed.

From a Codex shell or tool environment:

```bash
bunx mesurer-codex-connect
```

The low-level foreground bridge remains available for diagnostics:

```bash
bunx mesurer-codex --thread <SESSION> --cwd <PROJECT_DIRECTORY>
```

Mount the optional transport next to Context:

```ts
import { mountMesurer } from "mesurer-solid"
import { codex, context } from "mesurer-solid/plugins"

mountMesurer({
  plugins: [context(), codex()],
})
```

`codex()` does not probe loopback on mount. The first **Queue to Codex** press or **Choose Codex thread…** menu action establishes availability. If the bridge is missing, the action becomes **Codex unavailable** with an explicit retry. After a successful connection, Mesurer health-checks the known companion and recovers automatically if it returns.

The page stays pinned to the Codex thread that originally connected it unless the user chooses another destination. That affinity is stored in per-tab `sessionStorage`, so a reload restores the same origin/selection instead of adopting a newly stale bridge default. If no page affinity exists and more than one thread is registered, the toolbar requires **Choose Codex thread** before queueing. The picker shows five recent same-project threads first and can expand once to ten with **Show 5 more…**. Recent metadata comes from Codex app-server and is scoped to the project directory registered by the trusted local connector.

The bridge never creates a new Codex thread. Open or create it in Codex and let `SessionStart` register it. The `codex:v1` service exposes `health()`, `listThreads()`, `useThread(thread)`, and `send({ thread })`. Browser pages cannot register arbitrary Codex sessions or widen discovery to another project.

This uses Codex's own queued-user-message command. **Queue to Codex** does not interrupt an active turn. After durable queue acceptance, the bridge checks the same shared app-server daemon and resumes only a cold `notLoaded` destination; already-loaded threads keep Codex's normal queue scheduling. Codex's separate **Steer** action targets an in-flight turn and Mesurer does not invoke it today. Programmatic `send()` resolves with `delivery: "queued"` and, on current Codex builds, includes the durable queued-submission id plus bridge dispatch metadata.

The toolbar disables the queue action as soon as one delivery starts, preventing duplicate double-click submissions. It then shows **Queued for Codex**, **Codex working…**, and **Codex finished** from the tracked Codex turn. The typed service also exposes `delivery(deliveryId)` and `send()` returns the bridge `deliveryId`, lifecycle `status`, and exact `annotationIds`.

By default, saved annotations included in that delivery are removed only after the matching Codex turn reports completion. Interruptions keep them. While a delivery is queued or working, its delivery id, route, status, and exact annotation ids are stored per tab so a reload resumes tracking instead of losing cleanup state. Set `codex({ clearCompletedAnnotations: false })` to keep completed notes. Turn completion is a lifecycle signal, not an independent semantic verification of the rendered result.

This does not replace the normal browser-harness agent workflow.

See [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md).
## Documentation

- [Getting started](https://github.com/jhomra21/mesurer-solid/blob/main/docs/GETTING_STARTED.md)
- [Direct text editing and Typography](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TEXT_EDITING.md)
- [Arrange](https://github.com/jhomra21/mesurer-solid/blob/main/docs/ARRANGE.md)
- [Screenshots](https://github.com/jhomra21/mesurer-solid/blob/main/docs/SCREENSHOTS.md)
- [Context workflow](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CONTEXT_WORKFLOW.md)
- [Queue Context feedback to Codex](https://github.com/jhomra21/mesurer-solid/blob/main/docs/CODEX.md)
- [Browser harness](https://github.com/jhomra21/mesurer-solid/blob/main/docs/BROWSER_HARNESS.md)
- [Host isolation](https://github.com/jhomra21/mesurer-solid/blob/main/docs/HOST_ISOLATION.md)
- [Trusted Types](https://github.com/jhomra21/mesurer-solid/blob/main/docs/TRUSTED_TYPES.md)

Mesurer Solid is a source-first Solid port and extension of [Mesurer](https://github.com/ibelick/mesurer). Upstream adoption and deliberate differences are tracked in [Upstream parity](https://github.com/jhomra21/mesurer-solid/blob/main/docs/UPSTREAM_PARITY.md).

## License

MIT.
