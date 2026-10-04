# Mesurer browser extension

The first-party Manifest V3 extension injects the same Mesurer renderer and runtime into arbitrary Chromium pages without changing application source. This guide matches `mesurer-solid@0.2.1` stable.

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

The extension requests `activeTab`, `scripting`, `storage`, and `tabCapture`, not persistent host access to every site. `storage` is used only for tab-session bookkeeping. `tabCapture` is used only after the user starts Recording so the active tab can provide a live video stream without a screen-share picker. The extension does not request broad host permissions. Chrome controls the install-time warning text associated with extension permissions. If navigation revokes the temporary active-tab grant, automatic recovery stops and another explicit action click is required.

Browser-protected pages such as `chrome://` pages cannot be injected. File URLs depend on the browser's extension file-access setting.

## What it runs

The extension uses the same built `inject-script` artifact as the browser harness. It loads the separate MPL-2.0 `mediabunny-vendor.js` asset immediately before Mesurer; it does not carry a fork of either Mesurer or the Recording pipeline.

Injection enables the same managed first-party catalog, including Context, Screenshot, and Recording, for the active tab. The page-mounted instance otherwise has the same toolbar, direct text editing, plugin host, compact-toolbar behavior, route-scoped workspace state, and `window.__MESURER__` API as other injected Mesurer instances.

When the tab remains authorized, the background worker remembers that Mesurer was explicitly opened and restores a missing injected instance after reload or eligible navigation. The injector also remounts Mesurer if the page replaces the DOM node that owns the injected UI. A live connected instance is reused rather than replaced. If the user closes Mesurer while navigation is racing the background worker's session-state read, the close request remains authoritative and recovery does not reopen the tab.

Edit movement remains optional unless `edit()` or the `arrange()` compatibility alias is included by the injected configuration.

## Direct text editing

Enter Edit before changing direct text or typography. Typography in Select remains inspection-only. Rulers, ordinary Guides, and Layout Guides remain usable while Edit is active. Context remains visible across Select and Edit. The browser extension does not expose the native Codex host capability, so Codex remains listed in Settings but starts off and does not contribute a toolbar action.

Mesurer keeps native editing boundaries intact. Form controls and descendants that inherit `contenteditable` remain under the page/browser editor. A nested `contenteditable="false"` boundary ends inherited editability and can use Mesurer direct editing when the normal direct-text rules pass. Mixed inline copy can edit the exact direct text run around an inline child without replacing that child or the host element's native DOM APIs.

If Typography was already selected, the edit session uses one live Typography card rather than stacking the normal hover/pinned Typography UI with a second card. The normal Typography UI returns when editing ends.

During an active edit, direct-edit chrome owns the selected field: the duplicate ordinary selected border is suppressed, the dimensions pill stays available, and Typography stays source-relative without moving in response to ordinary pointer motion. The selection-adjacent Add Note button is hidden only while the editor is active and returns on exit; existing saved annotation markers and panels remain available.

Saved copy/style changes are reversible Desired intent and can be read through `textEdits()` / `textEdit(id)` when the agent bridge is enabled. Host-authored text/style changes take ownership and survive later undo/redo or Mesurer cleanup.

See [Direct text editing and Typography](../docs/TEXT_EDITING.md).

## Screenshot capture

The extension automatically enables the first-party Screenshot plugin. Drag a viewport region with the camera tool to capture a PNG of the visible tab.

Screenshot discovers the extension capture path internally. The extension adapter calls `chrome.tabs.captureVisibleTab()` through the existing `activeTab` grant, so it does not need `<all_urls>` or a screen-share prompt. The isolated-world bridge connects the page-mounted plugin to the extension background worker without exposing extension APIs to the page's main world. There is no extension-specific Screenshot factory or public provider option.

The normal Screenshot behavior still applies:

- HiDPI-aware cropping;
- persisted automatic copy/download preferences;
- best-effort clipboard and download outputs;
- draggable thumbnail preview;
- click-to-open Copy/Save viewer;
- short capture/output status feedback.

Mesurer chrome is hidden while pixels are captured and restored afterward. Agent screenshot evidence remains separate. Agents use `capturePlan()`, `prepareCapture()`, and `finishCapture()` with the browser controller's screenshot command.

See [Screenshots](../docs/SCREENSHOTS.md).

## Recording capture

Recording remains the same `recording()` plugin and `recording:v1` service used by source-mounted applications. The extension does not expose an extension-specific Recording factory.

After the user starts Recording, the background worker uses `chrome.tabCapture.getMediaStreamId()` for the authorized current tab. The isolated-world bridge passes only that one-use stream id to the page. On a secure page, the Recording capture layer consumes it with `getUserMedia()` and sends the resulting frames through the same MediaBunny canvas encoder used by the browser path.

The extension does **not** use `MediaRecorder`, does not create an offscreen recorder, and does not encode video in the service worker. `tabCapture` is acquisition only. MediaBunny owns initial video encoding, media inspection, trim, resize, conversion, and WebM/MP4 export.

If the extension stream path is unavailable or cannot be consumed, Recording falls back to the ordinary browser display picker. Format availability is still determined by the runtime encoder; use the Recording UI or `recording:v1.formats()` rather than assuming MP4 support.

The extension build copies `mediabunny-vendor.js` and `mesurer-main.js` as separate files and loads the vendor first. It also ships the full upstream MediaBunny license as `mediabunny-LICENSE.txt` beside the vendor file. This preserves MediaBunny's MPL-2.0 distribution boundary.

See [Recording](../docs/RECORDING.md).

## Architecture

The extension shell owns active-tab execution, its private Screenshot and Recording acquisition bridges, and injection/disposal. The shared Mesurer runtime owns inspection, Context, direct text editing, plugins, agent APIs, and the Recording media pipeline. Screenshot owns PNG region selection/cropping/output state; Recording owns video selection, MediaBunny encoding, preview, trim, export, and capture lifecycle.

For browser, host, and agent integration details, see [Browser and agent integration](../docs/BROWSER_HARNESS.md), [Host isolation](../docs/HOST_ISOLATION.md), and [Agent integration](../packages/mesurer/AGENT_INTEGRATION.md).
