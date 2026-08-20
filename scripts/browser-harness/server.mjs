import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { executeRpc } from "./rpc.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

const localHost = (hostHeader) => {
  const host = String(hostHeader ?? "").toLowerCase();
  return host === "localhost"
    || host.startsWith("localhost:")
    || host === "127.0.0.1"
    || host.startsWith("127.0.0.1:")
    || host === "[::1]"
    || host.startsWith("[::1]:");
};

const localOrigin = (originHeader) => {
  if (!originHeader) return true;
  try {
    const origin = new URL(originHeader);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(origin.hostname);
  } catch {
    return false;
  }
};

const sameToken = (provided, expected) => {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const writeJson = (response, status, body) => {
  const json = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
  });
  response.end(json);
};

const readJson = async (request) => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Request body must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export function createBrowserHarnessHttpServer({ dispatch, port = 4747, token = null }) {
  const bearerToken = token ?? randomBytes(24).toString("base64url");
  const server = createServer(async (request, response) => {
    if (!localHost(request.headers.host) || !localOrigin(request.headers.origin)) {
      writeJson(response, 403, { ok: false, error: { message: "Only loopback Host/Origin values are allowed" } });
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, { ok: true, service: "mesurer-solid-browser-harness" });
      return;
    }

    const authorization = request.headers.authorization ?? "";
    const provided = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!sameToken(provided, bearerToken)) {
      writeJson(response, 401, { ok: false, error: { message: "Missing or invalid bearer token" } });
      return;
    }

    if (request.method === "GET" && url.pathname === "/tools") {
      const result = await executeRpc(dispatch, { id: "tools", method: "harness.tools", params: {} });
      writeJson(response, result.ok ? 200 : 400, result);
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/rpc") {
      writeJson(response, 404, { ok: false, error: { message: "Use POST /rpc or GET /tools" } });
      return;
    }

    try {
      const body = await readJson(request);
      const result = await executeRpc(dispatch, body);
      writeJson(response, result.ok ? 200 : 400, result);
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  return {
    token: bearerToken,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      return { url: `http://127.0.0.1:${actualPort}`, token: bearerToken };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
