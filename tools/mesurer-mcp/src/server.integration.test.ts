import { afterEach, describe, expect, test } from "bun:test";
import * as z from "zod/v4";

const initializeResponseSchema = z.object({
  result: z.object({ protocolVersion: z.string() }),
});
const toolsListResponseSchema = z.object({
  result: z.object({
    tools: z.array(z.object({ name: z.string() })),
  }),
});
const toolCallResponseSchema = z.object({
  result: z.object({
    content: z.array(z.object({
      type: z.literal("text"),
      text: z.string(),
    })).min(1),
  }),
});
const feedbackAcceptedSchema = z.object({
  sequence: z.number().int().positive(),
});
const feedbackToolPayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("feedback"),
    sequence: z.number().int().positive(),
    event: z.object({
      delivery: z.object({
        context: z.object({ id: z.string() }),
        text: z.string(),
      }),
    }),
  }),
  z.object({
    status: z.literal("timeout"),
    sequence: z.number().int().nonnegative(),
  }),
]);

type InitializeRequest = {
  jsonrpc: "2.0";
  id: number;
  method: "initialize";
  params: {
    protocolVersion: string;
    capabilities: Record<string, never>;
    clientInfo: { name: string; version: string };
  };
};
type InitializedNotification = {
  jsonrpc: "2.0";
  method: "notifications/initialized";
  params: Record<string, never>;
};
type ToolsListRequest = {
  jsonrpc: "2.0";
  id: number;
  method: "tools/list";
  params: Record<string, never>;
};
type ToolsCallRequest = {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: {
    name: "mesurer_wait_for_feedback";
    arguments: { after: number; timeoutMs: number };
  };
};
type TestJsonRpcMessage = InitializeRequest | InitializedNotification | ToolsListRequest | ToolsCallRequest;

const children: Array<ReturnType<typeof Bun.spawn>> = [];

function randomFeedbackPort(): number {
  return 44_000 + Math.floor(Math.random() * 1_000);
}

function createJsonLineReader(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return async (): Promise<string> => {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) return line;
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

function sendJsonRpc(stdin: Bun.FileSink, message: TestJsonRpcMessage): void {
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
  const body = feedbackAcceptedSchema.parse(await response.json());
  return body.sequence;
}

function parseToolPayload(line: string): z.infer<typeof feedbackToolPayloadSchema> {
  const message = toolCallResponseSchema.parse(JSON.parse(line));
  return feedbackToolPayloadSchema.parse(JSON.parse(message.result.content[0].text));
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
    const nextLine = createJsonLineReader(child.stdout);

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
    const initialized = initializeResponseSchema.parse(JSON.parse(await nextLine()));
    expect(initialized.result.protocolVersion).toBe("2025-11-25");

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
    const listed = toolsListResponseSchema.parse(JSON.parse(await nextLine()));
    expect(listed.result.tools.map((tool) => tool.name)).toContain("mesurer_wait_for_feedback");

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
    const pendingResult = parseToolPayload(await nextLine());
    expect(pendingResult.status).toBe("feedback");
    if (pendingResult.status !== "feedback") throw new Error("Expected pending feedback result.");
    expect(pendingResult.sequence).toBe(1);
    expect(pendingResult.event.delivery.context.id).toBe("context-pending");
    expect(pendingResult.event.delivery.text).toBe("Align these cards.");

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
    const queuedResult = parseToolPayload(await nextLine());
    expect(queuedResult.status).toBe("feedback");
    if (queuedResult.status !== "feedback") throw new Error("Expected queued feedback result.");
    expect(queuedResult.sequence).toBe(2);
    expect(queuedResult.event.delivery.context.id).toBe("context-queued");
  }, 15_000);
});
