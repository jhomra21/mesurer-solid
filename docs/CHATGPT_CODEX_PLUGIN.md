# ChatGPT and Codex plugin

Mesurer Solid ships a local-first plugin prototype for ChatGPT Desktop and Codex. The agent and the web page or Electron renderer it is inspecting must run in the same machine, VM, or sandbox. There is no hosted Mesurer relay.

## Product model

The browser UI is the primary interface. If an agent already has browser or computer-use controls, it should use Mesurer like any other UI: click the toolbar, change modes, drag guides, move elements in Edit, inspect Typography, select Screenshot or Recording regions, and review the resulting overlays or media.

The local MCP server is optional. It exposes structured shortcuts when exact data or a concise operation is easier than driving the UI. It is not a required transport between the agent and Mesurer.

    browser / Electron renderer
            |
            | visible UI interaction
            v
          Mesurer
            |
            +---- window.__MESURER__ ---- browser evaluation
            |
            +---- optional local MCP ---- structured shortcuts

This keeps Mesurer useful with any browser harness rather than coupling it to ChatGPT, Codex, Playwright, or one automation protocol.

## Plugin package

The repository root is a portable Agent Plugins package with `plugin.json`, `mcp.json`, and `skills/mesurer-ui/SKILL.md`. It also carries the current Codex compatibility overlay in `.codex-plugin/plugin.json` and `.mcp.json`.

The portable manifest uses the Agent Plugins 1.0 schemas. The local stdio MCP starts with:

    node ./scripts/mesurer-mcp/server.mjs

The repo marketplace lives at `.agents/plugins/marketplace.json`.

The three Mesurer UI skill copies must remain byte-identical:

- `skills/mesurer-ui/SKILL.md` — portable plugin surface;
- `.agents/skills/mesurer-ui/SKILL.md` — repository agent surface;
- `packages/mesurer/skills/mesurer-ui/SKILL.md` — npm-installed `mesurer-skill` surface.

## Prototype setup

From a checkout of this repository:

    bun install
    bun run build:packages
    bunx playwright install chromium

`build:packages` produces injector assets only for cases where the MCP-owned browser needs to inject Mesurer into a page that does not already have it.

Codex can add the Git-backed marketplace with:

    codex plugin marketplace add jhomra21/mesurer-solid

Restart ChatGPT Desktop after adding the marketplace or changing local plugin files, then install **Mesurer Solid** from that marketplace. This local-first plugin is not a public-directory submission.

Codex may still require approval before an MCP tool launches or navigates the fallback browser. Plugin-scoped MCP approval policy controls that behavior. If the active agent already has browser/computer-use access to the application, keep using that browser and operate Mesurer directly instead of relying on `connect_mesurer_page`.

## Direct browser interaction

Do not start with MCP when the harness already controls the right page. Mesurer exposes accessible controls and stable automation identifiers:

| Surface | Automation hook |
| --- | --- |
| Mesurer island | `[data-mesurer-island="true"]` |
| Built-in tool | `[data-mesurer-builtin="<id>"]` |
| Plugin/toolbar tool | `[data-mesurer-tool-id="<id>"]` |

Prefer accessible roles and labels when the browser tool supports them. The data attributes are the stable fallback for automation and tests.

Common ids include built-ins `select`, `xray`, `color-picker`, `rulers`, `text-inspector`, `guides`, and `settings`; Edit `arrange`; Layout Guides `layout-guides`; Screenshot `screenshot`; Recording `recording`; Context actions under `context.*`; and `codex.send` when the native Codex capability exists.

An agent can therefore use Select/Edit, X-ray, Color Picker, Rulers, Guides, Layout Guides, Typography, Context, direct text editing, movement, Screenshot, Recording, Settings, menus, and plugin controls without MCP.

## Optional local MCP

The server exposes focused shortcuts rather than mirroring renderer internals:

| Tool | Purpose |
| --- | --- |
| `connect_mesurer_page` | Launch an isolated fallback Chromium page, reuse Mesurer when present, optionally inject when absent. |
| `list_browser_pages` | Discover pages in the optional MCP-owned fallback browser. |
| `get_mesurer_status` | Read capabilities, plugin description/state, and visible toolbar controls. |
| `inspect_ui` | Read exact rendered geometry, typography, appearance, layout, and overflow. |
| `measure_ui` | Measure an exact pair of rendered targets. |
| `get_ui_context` | Read workspace, selection, or annotation Context. |
| `select_ui` | Select exact rendered targets and return Context. |
| `use_mesurer_tool` | Invoke a visible toolbar button through the rendered Mesurer UI. |
| `get_saved_ui_intent` | Read annotations, Edit movement intent, or direct text/style intent. |
| `set_mesurer_plugin` | Idempotently enable or disable a registered plugin through its visible Settings switch. |
| `review_ui` | Compare Live against annotation or Edit Desired state. |

`use_mesurer_tool` intentionally goes through the visible toolbar button instead of calling the backing command. `set_mesurer_plugin` does the same for Settings: it uses a plugin id from `get_mesurer_status`, drives the rendered switch, and restores the Settings UI state it had before the call. The MCP surface intentionally has no generic command executor; browser evaluation can still use the public `window.__MESURER__.command()` API when an advanced command is genuinely needed.

## Browser ownership

The existing browser harness remains authoritative for navigation/authentication, clicking and typing in the host application, arbitrary Mesurer UI interaction, screenshots/artifacts, source editing, and dev-server lifecycle.

The MCP-owned browser is a fallback only when no normal browser/computer-use control exists. It deliberately does not attach to or take over another harness's browser. If a browser harness already controls the application, keep using that browser and interact with Mesurer directly.

`connect_mesurer_page` launches Chromium through the repository's existing Playwright browser harness. Environment defaults are `MESURER_URL`, `MESURER_GLOBAL_NAME`, `MESURER_TARGET`, `MESURER_INJECT_PATH`, and `MESURER_HEADLESS`.

## Injection

Connection does not replace an existing Mesurer instance inside the MCP-owned fallback page. The MCP session starts with automatic injection disabled, checks that page first, and only loads the injector when `inject` is true and no Mesurer agent global exists.

The default built assets are `packages/mesurer/dist/inject-script.js` and `packages/mesurer/dist/mediabunny-vendor.js`. Pass `injectPath` or `MESURER_INJECT_PATH` when they live elsewhere. Source-mounted applications that already expose `window.__MESURER__` do not need injector assets.

## Visual variations

For a request such as "show me three better versions":

1. Inspect the page and preserve existing human Mesurer state.
2. Use Edit or normal page controls to create variation A.
3. Capture it through the existing browser harness.
4. Restore or switch presentation and repeat for B/C.
5. Present the alternatives without claiming source changed.
6. After the user chooses one, implement it in normal source.
7. Wait for the app to settle, compare Live against Desired and exact measurements, and capture final evidence.

Temporary Mesurer movement or text/style previews are design intent, not source implementation.

## Screenshot and Recording

For ordinary agent evidence, use the browser harness screenshot facility. Use Mesurer Screenshot and Recording when the human capture workflow itself is useful or under review. The agent can operate both through ordinary browser interaction, including region selection, adjustment, playback, trimming, resize/format controls, export, and dismissal.

The MCP deliberately does not duplicate screenshot bytes or video transport.

## Electron

Electron uses the same model. A coding harness with Electron/computer-use access can click Mesurer directly in the renderer; exact data comes from `window.__MESURER__` when the app exposes the agent bridge. Existing Recording integration through `mesurer-solid/electron` remains unchanged. The ChatGPT/Codex plugin adds no Electron preload, IPC namespace, localhost service, or second Codex transport.

## Scope

The prototype intentionally does not provide mobile/web execution, a hosted browser, a hosted Mesurer relay, cross-device DOM/media syncing, a public HTTPS MCP service, or a second source-editing agent.

The same plugin works on a developer machine, VM, or cloud sandbox as long as the coding agent and browser/Electron application can interact in that execution environment.

## References

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/build/skills
- https://developers.openai.com/plugins/build/mcp-server
- https://help.openai.com/en/articles/20001256-plugins-in-chatgpt
- [Browser and agent integration](./BROWSER_HARNESS.md)
- [Capabilities](./CAPABILITIES.md)
- [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md)
- [Host isolation](./HOST_ISOLATION.md)
