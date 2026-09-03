# Mesurer browser extension

The first-party Manifest V3 extension is the easiest zero-source-change way to use Mesurer on arbitrary Chromium pages.

## Build locally

From the repository root:

```bash
bun run build
```

The unpacked extension is written to `extension/dist/` after the normal Mesurer package build.

## Load in Chrome / Edge

1. Open the browser's extensions page and enable Developer mode.
2. Choose **Load unpacked**.
3. Select `extension/dist/`.
4. Pin Mesurer if desired.
5. Open an ordinary `http:` or `https:` page and click the Mesurer extension action.
6. Click the action again to dispose Mesurer from that tab.

The extension requests only `activeTab` and `scripting`. It does not request persistent access to every website. Browser-protected pages such as `chrome://` pages cannot be injected. File URLs also depend on the browser's extension file-access setting.

## Direct text editing

The extension injects the same renderer/runtime as the npm and browser-harness paths, so direct text editing works without any extension-specific setup.

With **Select** or **Typography** active, double-click ordinary direct text (or double-tap with touch/pen). The current text is selected in full and edited in place using the target's rendered typography. Typography is the human-facing tool name; the internal compatibility id remains `text-inspector`.

The edit session uses the normal Mesurer visual language while keeping direct properties and semantic presets separate:

- Bold, Italic, Underline, Font, Size, Weight, rendered-page text colors, and custom color are direct toolbar controls;
- a separate semantic preset popup contains only Text plus Heading 1/2/3 for semantic levels actually rendered by the page;
- each semantic preset uses the dominant page-derived typography bundle for its level;
- non-dominant page variants remain selectable through the direct Font/Size/Weight/color controls;
- a contextual Typography card shows the exact field's Family, Size, Weight, Line, Tracking, text/tag context, and CSS-variable references when available.

Because Arrange keeps Select active, the same interaction works while arranging. Starting the edit contextually activates Typography for that field without turning off Select or Arrange. Press **Enter** to keep Desired intent or **Shift+Enter** for a newline. If the semantic preset popup is open, **Escape** closes it first; Escape again cancels the edit.

While editing, `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, and `Cmd/Ctrl+U` toggle direct formatting. Text/H1/H2/H3 use `Option+Cmd+0/1/2/3` on macOS and `Alt+Ctrl+0/1/2/3` elsewhere. Missing heading levels are not invented.

Direct editing deliberately leaves native form controls and `contenteditable` to the page/browser. Link creation and numbered/bulleted lists are also intentionally absent until Mesurer has a structural/rich-text intent model for them. See [`../docs/TEXT_EDITING.md`](../docs/TEXT_EDITING.md) for the full target, preset, history, agent, and Live-verification contract.

## Screenshot capture

The extension enables the optional first-party screenshot plugin automatically. Use the camera tool to drag a viewport region and capture a real PNG of the visible tab.

The extension path captures through `chrome.tabs.captureVisibleTab()` using the existing `activeTab` grant, so it does not need `<all_urls>` and does not open the browser's screen-share chooser. A small isolated-world bridge connects the page-mounted screenshot plugin to the extension background worker without exposing extension APIs to the page's main world.

Captured images keep the screenshot plugin's normal behavior:

- HiDPI-aware cropping from CSS viewport coordinates to the captured bitmap;
- persisted automatic copy/download preferences;
- best-effort clipboard and local-download outputs;
- a persistent draggable thumbnail that starts in the bottom-right with an 8px viewport inset, then preserves the existing drag/clamping behavior;
- native image right-click behavior and explicit dismissal;
- click-to-open larger viewer with Copy, Save, and Close controls;
- short capture/output status feedback.

The screenshot plugin hides Mesurer control chrome while the pixels are captured and restores the previous presentation afterward. Active direct-edit controls, the semantic preset popup, and the contextual Typography card are Mesurer chrome rather than application content.

This human screenshot tool is separate from agent/harness screenshot evidence. Coding agents can still use `capturePlan()`, `prepareCapture()`, and `finishCapture()` with the browser harness's own screenshot primitive when they need deterministic task evidence controlled by that harness.

## Architecture

The extension does not carry a fork of Mesurer. `extension/build.mjs` copies the same published-style `inject-script` artifact used by browser harnesses into the MV3 package.

That injector installs the removable `mesurer.context` plugin by default, while the extension explicitly enables the removable `mesurer.screenshot` plugin. The context plugin owns annotations, Copy Context/Copy Selection/Add Note UI, review/capture planning, shortcuts, and the `context:v1` service. The screenshot plugin owns the camera tool, screenshot settings/service, region-selection overlay, capture lifecycle, thumbnail, viewer, and output status. Direct text editing is installed by the shared renderer bridge, reuses the Typography/internal `text-inspector` typography-card primitives, owns its reversible text-edit state/service plus direct typography toolbar and semantic preset popup, and does not require a separate extension permission or plugin toggle. The extension shell owns only active-tab execution, the visible-tab capture bridge, and toggling the normal Mesurer injection artifact.

The injected instance therefore exposes the same toolbar, direct text-edit behavior, plugin host, and `window.__MESURER__` APIs as any other harness-injected Mesurer instance. Saved text/style intent is available through `textEdits()` / `textEdit(id)` when the agent bridge is enabled. Screenshot capture does not add a chat/session delivery capability and does not change the context-first agent contract.
