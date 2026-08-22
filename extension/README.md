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

The extension does not carry a fork of Mesurer. `extension/build.mjs` copies the same published-style `inject-script` artifact used by browser harnesses into the MV3 package. The injected instance therefore exposes the same toolbar and `window.__MESURER__` context/review APIs as source-mounted and harness-injected Mesurer.

Screenshots remain owned by the outer browser/harness. Mesurer exposes `capturePlan()`, `prepareCapture()`, and `finishCapture()` so a harness can capture the real rendered page while hiding Mesurer controls and keeping visual evidence such as guides, rulers, selections, annotations, and pixel labels.
