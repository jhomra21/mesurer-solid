import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { FeedbackMailbox } from "./feedback-mailbox";

const DEFAULT_FEEDBACK_PORT = 43_191;
const MAX_FEEDBACK_BODY_BYTES = 8 * 1024 * 1024;

const feedbackDeliverySchema = z.object({
  context: z.looseObject({
    schema: z.literal("mesurer.context/v1"),
    id: z.string().min(1),
    createdAt: z.string().min(1),
  }),
  text: z.string(),
  images: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    mimeType: z.string(),
    data: z.string(),
  })),
});

type FeedbackDelivery = z.infer<typeof feedbackDeliverySchema>;

const waitInputSchema = z.object({
  after: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(1_000).max(45_000).default(30_000),
});

const mailbox = new FeedbackMailbox<FeedbackDelivery>();

function resolveFeedbackPort(): number {
  const configured = process.env.MESURER_MCP_FEEDBACK_PORT;
  if (!configured) return DEFAULT_FEEDBACK_PORT;
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("MESURER_MCP_FEEDBACK_PORT must be an integer from 1 through 65535.");
  }
  return port;
}

function isLoopbackOrigin(origin: string | null): boolean {
  if (origin === null) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  if (origin !== null) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }
  return headers;
}

function jsonResponse(
  value: Record<string, string | number | boolean>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: corsHeaders(origin),
  });
}

async function handleIngress(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!isLoopbackOrigin(origin)) {
    return jsonResponse({ error: "Mesurer MCP feedback only accepts loopback browser origins." }, 403, null);
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, sequence: mailbox.sequence }, 200, origin);
  }

  if (request.method === "OPTIONS" && url.pathname === "/feedback") {
    const headers = corsHeaders(origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("access-control-max-age", "600");
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST" || url.pathname !== "/feedback") {
    return jsonResponse({ error: "Not found." }, 404, origin);
  }

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return jsonResponse({ error: "Feedback requires application/json." }, 415, origin);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_FEEDBACK_BODY_BYTES) {
    return jsonResponse({ error: "Feedback payload is too large." }, 413, origin);
  }

  let raw: object;
  try {
    raw = JSON.parse(body);
  } catch {
    return jsonResponse({ error: "Feedback body is not valid JSON." }, 400, origin);
  }

  const parsed = feedbackDeliverySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: "Feedback does not match MesurerContextDelivery." }, 422, origin);
  }

  const event = mailbox.publish(parsed.data);
  return jsonResponse({ ok: true, sequence: event.sequence }, 202, origin);
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "mesurer",
    version: "0.1.0",
  });

  server.registerTool(
    "mesurer_wait_for_feedback",
    {
      title: "Wait for Mesurer feedback",
      description:
        "Wait for the next human visual-feedback event published from Mesurer. " +
        "Pass the last sequence as after. If the result times out while review is still expected, call this tool again.",
      inputSchema: waitInputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ after, timeoutMs }, ctx) => {
      const result = await mailbox.wait({
        after,
        timeoutMs,
        signal: ctx.mcpReq.signal,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    },
  );

  return server;
}

const feedbackPort = resolveFeedbackPort();
const ingress = Bun.serve({
  hostname: "127.0.0.1",
  port: feedbackPort,
  fetch: handleIngress,
});
const stdio = serveStdio(createServer, {
  onerror(error) {
    console.error(`[mesurer-mcp] ${error.message}`);
  },
});

console.error(`[mesurer-mcp] MCP stdio ready; feedback ingress http://127.0.0.1:${feedbackPort}/feedback`);

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  ingress.stop(true);
  void stdio.close().finally(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
