# Mesurer browser extension

The first-party Manifest V3 extension injects the same Mesurer renderer and runtime into arbitrary Chromium pages without changing application source.

## Build and load

From the repository root:

```bash
bun run build
```

The unpacked extension is written to `extension/dist/`.

In Chrome or Edge:

1. Open the extensions page and enable Developer mode.
2. Choose **Load unpacked** and select `extension/dist/`.
3. Open an ordinary `http:` or `https:` page.
4. Click the Mesurer extension action to inject Mesurer; click it again to dispose the instance from that tab.

The extension requests `activeTab` and `scripting`, not persistent access to every site. Browser-protected pages such as `chrome://` pages cannot be injected. File URLs depend on the browser's extension file-access setting.

## What it runs

The extension uses the same built `inject-script` artifact as the browser harness. It does not carry a fork of Mesurer.

Injection enables Context and Screenshot for the active tab. The page-mounted instance otherwise has the same toolbar, direct text editing, plugin host, compact-toolbar behavior, and `window.__MESURER__` API as other injected Mesurer instances.

Arrange remains optional unless it is included by the injected configuration.

## Direct text editing

With Select or Typography active, double-click ordinary direct text to edit it in place. Arrange-compatible Select works the same way when Arrange is mounted.

Mesurer keeps native editing boundaries intact. Form controls and descendants that inherit `contenteditable` remain under the page/browser editor. A nested `contenteditable="false"` boundary ends inherited editability and can use Mesurer direct editing when the normal direct-text rules pass.

If Typography was already selected, the edit session uses one live Typography card rather than stacking the normal hover/pinned surface with a second card. The normal Typography surface returns when editing ends.

Saved copy/style changes are reversible Desired intent and can be read through `textEdits()` / `textEdit(id)` when the agent bridge is enabled. Host-authored text/style changes take ownership and survive later undo/redo or Mesurer cleanup.

See [Direct text editing and Typography](../docs/TEXT_EDITING.md).

## Screenshot capture

The extension automatically enables the first-party Screenshot plugin. Drag a viewport region with the camera tool to capture a PNG of the visible tab.

The extension captures through `chrome.tabs.captureVisibleTab()` using the existing `activeTab` grant, so it does not need `<all_urls>` or a screen-share prompt. A small isolated-world bridge connects the page-mounted plugin to the extension background worker without exposing extension APIs to the page's main world.

The normal Screenshot behavior still applies:

- HiDPI-aware cropping;
- persisted automatic copy/download preferences;
- best-effort clipboard and download outputs;
- draggable thumbnail preview;
- click-to-open Copy/Save viewer;
- short capture/output status feedback.

Mesurer chrome is hidden while pixels are captured and restored afterward. Agent/harness screenshot evidence remains separate: agents use `capturePlan()`, `prepareCapture()`, and `finishCapture()` with the harness's own screenshot primitive.

See [Screenshots](../docs/SCREENSHOTS.md).

## Architecture

The extension shell owns active-tab execution, the visible-tab capture bridge, and injection/disposal. The shared Mesurer runtime owns inspection, Context, direct text editing, plugins, and agent APIs. Screenshot behavior remains inside `mesurer.screenshot` rather than the extension shell.

For the wider integration model, see [Browser harness](../docs/BROWSER_HARNESS.md), [Host isolation](../docs/HOST_ISOLATION.md), and [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md).
