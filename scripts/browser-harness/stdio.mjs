import readline from "node:readline";
import { executeRpc } from "./rpc.mjs";

export async function serveBrowserHarnessStdio({ dispatch, input = process.stdin, output = process.stdout }) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let request;
    try {
      request = JSON.parse(trimmed);
    } catch (error) {
      output.write(`${JSON.stringify({
        id: null,
        ok: false,
        error: { message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` },
      })}\n`);
      continue;
    }
    const response = await executeRpc(dispatch, request);
    output.write(`${JSON.stringify(response)}\n`);
  }
}
