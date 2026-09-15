import type { MesurerPlugin } from "./core";
import {
  MESURER_CONTEXT_SERVICE_ID,
  type MesurerContextService,
} from "./context-plugin";
import { MESURER_VERSION } from "./version";

export const MESURER_CODEX_PLUGIN_ID = "mesurer.codex";
export const MESURER_CODEX_SERVICE_ID = "codex:v1";

const DEFAULT_ENDPOINT = "http://127.0.0.1:47365";
const DEFAULT_INSTRUCTION = [
  "Implement the current human feedback from Mesurer in this project.",
  "Treat the rendered page as the source of truth, preserve unrelated Mesurer review state,",
  "and verify the affected UI in the live page with Mesurer before claiming completion.",
].join(" ");

const SEND_ICON = {
  viewBox: "0 0 256 256",
  paths: [
    "M237.9,76.1l-32-32a16,16,0,0,0-22.6,0L88,139.3V112a16,16,0,0,0-16-16H24A16,16,0,0,0,8,112v80a16,16,0,0,0,16,16H72a16,16,0,0,0,16-16V164.7l95.3,95.2a16,16,0,0,0,22.6,0l32-32a16,16,0,0,0,0-22.6L188.7,172H232a16,16,0,0,0,16-16V88A16,16,0,0,0,237.9,76.1ZM72,192H24V112H72Zm122.6,56L99.3,152.7,194.6,57.4,226.7,89.4,164.7,151.3a8,8,0,0,0,0,11.4l62,62Z",
  ],
};

export type MesurerCodexPluginOptions = {
  /** Loopback bridge URL. Defaults to http://127.0.0.1:47365. */
  endpoint?: string;
  /** Default instruction prepended to Mesurer evidence. */
  instruction?: string;
  /** Show the Send to Codex toolbar action. Defaults to true. */
  ui?: boolean;
};

export type MesurerCodexSendRequest = {
  /** Optional instruction for this send. */
  instruction?: string;
  /** Send only these saved annotation ids. When omitted, all saved annotations are sent. */
  annotationIds?: string[];
};

export type MesurerCodexSendResult = {
  thread: string;
  output: string;
};

export type MesurerCodexHealth = {
  thread: string;
};

export type MesurerCodexService = {
  health(): Promise<MesurerCodexHealth>;
  send(request?: MesurerCodexSendRequest): Promise<MesurerCodexSendResult>;
};

type BridgeResponse = {
  ok?: boolean;
  thread?: string;
  output?: string;
  error?: string;
};

const endpointUrl = (endpoint: string, path: string) => {
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  return new URL(path, base).toString();
};

const bridgeRequest = async (
  endpoint: string,
  path: string,
  init?: RequestInit,
): Promise<BridgeResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpointUrl(endpoint, path), {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: BridgeResponse = {};
    if (text) {
      try {
        payload = JSON.parse(text) as BridgeResponse;
      } catch {
        payload = { error: text };
      }
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `Mesurer Codex bridge returned HTTP ${response.status}.`);
    }
    return payload;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("Mesurer Codex bridge timed out.");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
};

const feedbackMessage = async (
  context: MesurerContextService,
  request: MesurerCodexSendRequest | undefined,
  defaultInstruction: string,
) => {
  const instruction = request?.instruction?.trim() || defaultInstruction;
  const saved = await context.annotations();
  const requestedIds = request?.annotationIds;
  const annotations = requestedIds
    ? requestedIds.map((id) => saved.find((annotation) => annotation.id === id)).filter((annotation) => annotation !== undefined)
    : saved;
  const evidence: string[] = [];

  for (const annotation of annotations) {
    evidence.push(await context.contextText({ annotation: annotation.id }));
  }

  if (evidence.length === 0) {
    try {
      evidence.push(await context.contextText({ scope: "selection" }));
    } catch {
      evidence.push(await context.contextText());
    }
  }

  return [
    instruction,
    "",
    ...evidence.flatMap((value, index) => [
      evidence.length > 1 ? `Feedback ${index + 1}` : "Mesurer evidence",
      value,
      "",
    ]),
  ].join("\n").trimEnd();
};

export function codexPlugin(options: MesurerCodexPluginOptions = {}): MesurerPlugin {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const instruction = options.instruction?.trim() || DEFAULT_INSTRUCTION;

  return {
    id: MESURER_CODEX_PLUGIN_ID,
    version: MESURER_VERSION,
    requires: [MESURER_CONTEXT_SERVICE_ID],
    provides: [MESURER_CODEX_SERVICE_ID],
    setup(ctx) {
      const context = ctx.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);
      if (!context) throw new Error("Mesurer Codex plugin requires contextPlugin().");

      const service: MesurerCodexService = {
        async health() {
          const response = await bridgeRequest(endpoint, "health");
          if (!response.thread) throw new Error("Mesurer Codex bridge did not report its target thread.");
          return { thread: response.thread };
        },
        async send(request) {
          const message = await feedbackMessage(context, request, instruction);
          const response = await bridgeRequest(endpoint, "send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
          });
          if (!response.thread) throw new Error("Mesurer Codex bridge did not report its target thread.");
          return { thread: response.thread, output: response.output ?? "" };
        },
      };

      ctx.service.provide(MESURER_CODEX_SERVICE_ID, service);
      ctx.command.register("codex.send", async () => {
        const result = await service.send();
        console.info(`[Mesurer] Sent feedback to Codex thread ${result.thread}.`);
      });

      if (options.ui ?? true) {
        ctx.tool.register({
          id: "codex.send",
          label: "Send to Codex",
          command: "codex.send",
          order: 73,
          icon: SEND_ICON,
        });
      }
    },
  };
}
