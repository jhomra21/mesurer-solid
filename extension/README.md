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

## Architecture

The extension does not carry a fork of Mesurer. `extension/build.mjs` copies the same published-style `inject-script` artifact used by browser harnesses into the MV3 package.

That injector installs the removable `mesurer.context` plugin by default. The plugin—not the extension shell—owns annotations, Copy Context/Copy Selection/Add Note UI, review/capture behavior, shortcuts, and the `context:v1` service. The extension only grants active-tab execution and toggles the normal Mesurer injection artifact.

The injected instance therefore exposes the same toolbar, plugin host, and `window.__MESURER__` APIs as any other harness-injected Mesurer instance.

Screenshots remain owned by the outer browser/harness. The context plugin exposes `capturePlan()`, `prepareCapture()`, and `finishCapture()` so a harness can capture the real rendered page while hiding Mesurer controls and keeping guides, rulers, selections, annotations, measurements, distances, and pixel labels.
