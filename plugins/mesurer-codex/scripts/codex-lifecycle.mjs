#!/usr/bin/env node

import { parseArgs } from "node:util";

const DEFAULT_BRIDGE = "http://127.0.0.1:47365";

const { values } = parseArgs({
  options: {
    bridge: { type: "string", default: DEFAULT_BRIDGE },
  },
  allowPositionals: false,
  strict: true,
});

const readStdin = async () => {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

try {
  const input = await readStdin();
  const event = JSON.parse(input);
  const eventName = event?.hook_event_name;
  if (!["UserPromptSubmit", "Stop", "Interrupt"].includes(eventName)) process.exit(0);

  const sessionId = event?.session_id?.trim?.() || null;
  const turnId = event?.turn_id?.trim?.() || null;
  if (!sessionId || !turnId) process.exit(0);

  const bridge = values.bridge?.trim() || DEFAULT_BRIDGE;
  const base = bridge.endsWith("/") ? bridge : `${bridge}/`;
  await fetch(new URL("lifecycle", base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: eventName,
      sessionId,
      turnId,
      prompt: eventName === "UserPromptSubmit" ? event?.prompt ?? "" : undefined,
      stopHookActive: eventName === "Stop" ? event?.stop_hook_active === true : undefined,
    }),
  }).catch(() => undefined);
} catch {
  // Lifecycle telemetry is best-effort and must never block or inject output into Codex.
}
