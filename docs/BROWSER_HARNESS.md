# Browser and agent harness

The repository includes a local browser harness for mounting the exact Mesurer Solid `/inject` bundle into pages that do not depend on Mesurer at all. It is intended for manual cross-framework testing, arbitrary-site inspection, and agent/tool adapters.

## Build once

The harness injects the built browser entry at `packages/mesurer/dist/inject.js` by default.

```bash
bun install --frozen-lockfile
bun run build
```

You can override the bundle with `--inject /absolute/path/to/inject.js`. This is useful for testing the exact `dist/inject.js` extracted from an npm tarball.

## Launch a clean Chromium session

```bash
bun run browser:harness -- https://example.com
```

The harness launches a visible Chromium window, bypasses page CSP for the controlled context, injects Mesurer, waits for `window.__MESURER__.ready()`, and automatically reinjects after navigation.

Use `--headless` for automation:

```bash
bun run browser:harness -- https://example.com --headless
```

## Attach to an existing Chrome/Chromium session

Chrome must expose a CDP endpoint. Use a separate user-data directory rather than your normal Chrome profile.

macOS example:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/mesurer-chrome-profile
```

List open tabs without injecting anything:

```bash
bun run browser:harness -- \
  --cdp http://127.0.0.1:9222 \
  --list-pages
```

Attach by zero-based tab index:

```bash
bun run browser:harness -- \
  --cdp http://127.0.0.1:9222 \
  --page 1
```

Or select by a URL/title substring:

```bash
bun run browser:harness -- \
  --cdp http://127.0.0.1:9222 \
  --page localhost
```

For CDP-attached Chromium pages, the harness enables `Page.setBypassCSP` before injecting. Browser-internal pages such as `chrome://settings` remain intentionally unsupported.

## One-shot machine calls

The CLI can invoke one stable RPC method and exit. This is useful in CI and shell-driven agents.

```bash
bun run browser:harness -- https://example.com \
  --headless \
  --once mesurer.inspect \
  --params '{"selector":"h1"}'
```

The result is JSON on stdout. Human/status logging stays on stderr.

## JSONL over stdio

Process-based agents can keep one browser session alive and exchange newline-delimited JSON messages:

```bash
bun run browser:harness -- https://example.com --stdio
```

Request:

```json
{"id":"1","method":"mesurer.inspect","params":{"selector":"h1"}}
```

Response:

```json
{"id":"1","ok":true,"result":{"tag":"h1"}}
```

Each request is independent at the RPC layer while sharing the same selected browser tab and Mesurer session.

## Authenticated loopback HTTP

For tools that cannot own a child process, start the loopback RPC server:

```bash
bun run browser:harness -- http://localhost:5173 --serve
```

The harness prints a random bearer token and listens only on `127.0.0.1`. Requests with non-loopback Host/Origin headers are rejected to reduce DNS-rebinding exposure.

List tool metadata:

```bash
curl \
  -H 'Authorization: Bearer <token>' \
  http://127.0.0.1:4747/tools
```

Call a tool:

```bash
curl \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","method":"mesurer.feedback","params":{"selectors":["header","main","button"]}}' \
  http://127.0.0.1:4747/rpc
```

The HTTP/JSONL surface is deliberately protocol-neutral. A client-specific MCP adapter can register the same tool metadata and forward calls to this loopback bridge without coupling the public Mesurer package to one agent runtime.

## Stable RPC methods

Browser control:

- `browser.status`
- `browser.pages`
- `browser.selectPage`
- `browser.navigate`
- `browser.back`
- `browser.forward`
- `browser.reload`
- `browser.click`
- `browser.hover`
- `browser.fill`
- `browser.press`
- `browser.screenshot`

Mesurer control:

- `mesurer.inject`
- `mesurer.describe`
- `mesurer.inspect`
- `mesurer.inspectAll`
- `mesurer.at`
- `mesurer.distance`
- `mesurer.viewport`
- `mesurer.feedback`
- `mesurer.command`
- `mesurer.state`
- `mesurer.stable`

`harness.tools` returns the complete tool descriptions and JSON input schemas used by the transports.

## Security and browser boundaries

The harness gives its caller meaningful control over a browser tab. Treat the bearer token and stdio process as privileged local capabilities.

Normal web security boundaries still apply. The top-level Mesurer agent cannot inspect DOM inside a cross-origin iframe from its parent document, and closed shadow roots remain inaccessible to page JavaScript. A future frame-aware harness can attach/inject separately into frames that the automation layer can control.

The harness intentionally does not support browser-internal privileged URLs. Anti-automation behavior on third-party sites is also outside Mesurer itself.
