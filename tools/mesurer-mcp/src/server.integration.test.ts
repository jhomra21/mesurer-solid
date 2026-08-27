import { afterEach, describe, expect, test } from "bun:test";

const children: Array<ReturnType<typeof Bun.spawn>> = [];

function randomFeedbackPort(): number {
  return 44_000 + Math.floor(Math.random() * 1_000);
}

function createJsonLineReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return async (): Promise<Record<string, unknown>> => {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) return JSON.parse(line);
        continue;
      }

      const chunk = await reader.read();
      if (chunk.done) throw new Error("Mesurer MCP stdout closed before a JSON-RPC response arrived.");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
}

async function waitForHealth(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child may not have bound the loopback ingress yet.
    }
    await Bun.sleep(20);
  }
  throw new Error("Mesurer MCP feedback ingress did not become healthy.");
}

function sendJsonRpc(
  stdin: FileSink,
  message: Record<string, unknown>,
): void {
  stdin.write(`${JSON.stringify(message)}\n`);
  stdin.flush();
}

async function postFeedback(port: number, id: string, text: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      context: {
        schema: "mesurer.context/v1",
        id,
        createdAt: "2026-08-27T12:00:00.000Z",
      },
      text,
      images: [],
    }),
  });
  expect(response.status).toBe(202);
  const body = await response.json() as { sequence: number };
  return body.sequence;
}

function toolPayload(message: Record<string, unknown>): {
  status: "feedback" | "timeout";
  sequence: number;
  event?: { delivery: { context: { id: string }; text: string } };
} {
  const result = message.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  const text = result?.content?.[0]?.text;
  if (!text) throw new Error("MCP tool result did not include text content.");
  return JSON.parse(text);
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill("SIGTERM");
    await child.exited;
  }
});

describe("Mesurer MCP stdio server", () => {
  test("delivers pending and already-queued browser feedback through one MCP tool", async () => {
    const port = randomFeedbackPort();
    const child = Bun.spawn({
      cmd: [process.execPath, "src/server.ts"],
      cwd: `${import.meta.dir}/..`,
      env: {
        ...process.env,
        MESURER_MCP_FEEDBACK_PORT: String(port),
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    children.push(child);
    const nextMessage = createJsonLineReader(child.stdout);

    await waitForHealth(port);

    sendJsonRpc(child.stdin, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mesurer-mcp-test", version: "1.0.0" },
      },
    });
    const initialized = await nextMessage();
    expect((initialized.result as { protocolVersion?: string }).protocolVersion).toBe("2025-11-25");

    sendJsonRpc(child.stdin, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    sendJsonRpc(child.stdin, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const listed = await nextMessage();
    const tools = (listed.result as { tools?: Array<{ name?: string }> }).tools ?? [];
    expect(tools.map((tool) => tool.name)).toContain("mesurer_wait_for_feedback");

    sendJsonRpc(child.stdin, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "mesurer_wait_for_feedback",
        arguments: { after: 0, timeoutMs: 5_000 },
      },
    });

    const firstSequence = await postFeedback(port, "context-pending", "Align these cards.");
    expect(firstSequence).toBe(1);
    const pendingResult = toolPayload(await nextMessage());
    expect(pendingResult.status).toBe("feedback");
    expect(pendingResult.sequence).toBe(1);
    expect(pendingResult.event?.delivery.context.id).toBe("context-pending");
    expect(pendingResult.event?.delivery.text).toBe("Align these cards.");

    const secondSequence = await postFeedback(port, "context-queued", "Reduce this spacing.");
    expect(secondSequence).toBe(2);

    sendJsonRpc(child.stdin, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "mesurer_wait_for_feedback",
        arguments: { after: 1, timeoutMs: 5_000 },
      },
    });
    const queuedResult = toolPayload(await nextMessage());
    expect(queuedResult.status).toBe("feedback");
    expect(queuedResult.sequence).toBe(2);
    expect(queuedResult.event?.delivery.context.id).toBe("context-queued");
  }, 15_000);
});
