import type { MesurerContextService } from "./context-plugin";
import type { MesurerPlugin } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_CODEX_PLUGIN_ID = "mesurer.codex";
export const MESURER_CODEX_SERVICE_ID = "codex:v1";

const CONTEXT_SERVICE_ID = "context:v1";
const DEFAULT_ENDPOINT = "http://127.0.0.1:47365";
const DEFAULT_INSTRUCTION = [
  "Implement the current human feedback from Mesurer in this project.",
  "Treat the rendered page as the source of truth, preserve unrelated Mesurer review state,",
  "and verify the affected UI in the live page with Mesurer before claiming completion.",
].join(" ");

const SEND_ICON = {
  viewBox: "0 0 256 256",
  paths: [
    "M224,48,32,120l88,32,32,88Z M120,152l104-104",
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
    if (cause instanceof Error && cause.name === "AbortError") {
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
    ? requestedIds.flatMap((id) => {
        const annotation = saved.find((candidate) => candidate.id === id);
        return annotation ? [annotation] : [];
      })
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
    requires: [CONTEXT_SERVICE_ID],
    provides: [MESURER_CODEX_SERVICE_ID],
    setup(ctx) {
      const context = ctx.service.get<MesurerContextService>(CONTEXT_SERVICE_ID);
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
