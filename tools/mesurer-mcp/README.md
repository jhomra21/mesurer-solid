# Mesurer MCP feedback loop

This package is the transport-neutral agent handoff for Mesurer visual feedback.
It deliberately does not know about Codex threads, Claude sessions, Cursor chats, ACP, browser automation, or credentials.

The connected agent owns the conversation. Mesurer only publishes a feedback event into the MCP process that the agent already launched.

```text
Mesurer page
  -> POST http://127.0.0.1:43191/feedback
  -> Mesurer MCP feedback mailbox
  -> mesurer_wait_for_feedback MCP tool result
  -> the same agent tool call / active turn
```

## MCP revision and transport

The server uses `@modelcontextprotocol/server` v2 and `serveStdio(...)`, the current SDK serving entry for a local process launched by an MCP host. The v2 SDK is the stable line implementing MCP 2026-07-28, while `serveStdio(...)` deliberately supports both modern 2026-07-28 and older stdio clients from the same server factory.

Stdio is intentional here: a local coding-agent host launches this process and owns its lifetime. Streamable HTTP is the recommended MCP transport when one network endpoint serves many clients; it would add a server/auth deployment problem that this local feedback loop does not need.

The browser-facing loopback HTTP endpoint is **not an MCP transport**. It is a private ingress into the same local process so the inspected webpage can publish the human's feedback. It binds only to `127.0.0.1` and, for browser requests, accepts loopback origins only.

## Install and validate

From this directory:

```bash
bun install --frozen-lockfile
bun test
bun build src/server.ts --target=bun --outfile=/tmp/mesurer-mcp.js
```

Do not start `src/server.ts` manually when testing with an MCP host. The host should launch it through its stdio MCP configuration.

## Codex configuration

Use the absolute Bun path returned by `which bun`, especially for the macOS Codex app where the GUI process may not inherit your shell PATH. Codex reads stdio MCP servers from `~/.codex/config.toml`:

```toml
[mcp_servers.mesurer]
command = "/ABSOLUTE/PATH/TO/bun"
args = ["run", "/ABSOLUTE/PATH/TO/mesurer-solid/tools/mesurer-mcp/src/server.ts"]
startup_timeout_sec = 20
```

Restart the Codex app after changing MCP configuration, then confirm `mesurer_wait_for_feedback` is available in a new task.

The equivalent Codex CLI setup is:

```bash
codex mcp add mesurer -- /ABSOLUTE/PATH/TO/bun run /ABSOLUTE/PATH/TO/mesurer-solid/tools/mesurer-mcp/src/server.ts
```

This normal configuration is the recommended compatibility path. Current Codex still marks its 2026-07-28 MCP client mode as under development and disabled by default; the v2 Mesurer server does not require that experimental client mode to work.

### Optional: exercise Codex's 2026-07-28 client mode

If the installed Codex build exposes the current experimental MCP feature and you specifically want to verify modern-protocol negotiation, enable the feature and opt the stdio entry into the modern version:

```bash
codex features enable mcp_2026_07_28
codex mcp remove mesurer
codex mcp add mesurer \
  --env CODEX_MCP_PROTOCOL_VERSION=2026-07-28 \
  -- /ABSOLUTE/PATH/TO/bun run /ABSOLUTE/PATH/TO/mesurer-solid/tools/mesurer-mcp/src/server.ts
```

Do not make this experimental Codex flag a Mesurer requirement. Other MCP hosts can negotiate whichever protocol revision they currently support.

## Enable the page sender

The default Mesurer injection keeps MCP off so ordinary users do not see a dead Send button when no MCP process exists. Before evaluating the normal Mesurer injector in an MCP-backed session, set:

```js
window.__MESURER_CONFIG__ = {
  ...(window.__MESURER_CONFIG__ ?? {}),
  mcp: true,
};
```

With the default port this makes the existing context plugin's **Send to agent** action POST `MesurerContextDelivery` to:

```text
http://127.0.0.1:43191/feedback
```

A different loopback port can be configured on both sides:

```toml
[mcp_servers.mesurer]
command = "/ABSOLUTE/PATH/TO/bun"
args = ["run", "/ABSOLUTE/PATH/TO/mesurer-solid/tools/mesurer-mcp/src/server.ts"]
env = { MESURER_MCP_FEEDBACK_PORT = "43192" }
startup_timeout_sec = 20
```

```js
window.__MESURER_CONFIG__ = {
  mcp: { feedbackUrl: "http://127.0.0.1:43192/feedback" },
};
```

## Agent loop

The agent should preserve the last observed sequence and long-poll while human visual review is expected:

```text
1. finish the current visual edit and validate the rendered page
2. call mesurer_wait_for_feedback({ after: lastSequence, timeoutMs: 30000 })
3. if status=timeout and review is still expected, call it again
4. if status=feedback, use event.delivery.context and event.delivery.text
5. capture real browser evidence with the browser harness that already owns the page
6. make/review the requested change
7. wait again
```

The 30-second default intentionally stays below common MCP-host tool-call timeouts. The tool accepts waits up to 45 seconds; repeated calls are the portable way to wait longer.

Feedback is retained in a bounded sequence log. A click that happens before the agent starts waiting is therefore returned immediately on the next call instead of being lost.

`ctx.mcpReq.signal` cancels a pending waiter when the MCP host cancels the tool call or closes the connection.

## Security boundary

- MCP stdout is protocol-only. Diagnostics go to stderr.
- The feedback ingress binds to `127.0.0.1` only.
- Browser-originated feedback is accepted only from loopback HTTP(S) origins.
- Mesurer never receives an agent conversation/session/thread ID.
- The MCP server stores no model credentials.
- Screenshot capture remains owned by the existing browser/Electron harness, not by this server.
