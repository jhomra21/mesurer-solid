import type { MesurerContextService } from "./context-plugin";
import type { MesurerPlugin, Registration, ToolMenuItemContribution } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_CODEX_PLUGIN_ID = "mesurer.codex";
export const MESURER_CODEX_SERVICE_ID = "codex:v1";

const CONTEXT_SERVICE_ID = "context:v1";
const DEFAULT_ENDPOINT = "http://127.0.0.1:47365";
const HEALTH_POLL_MS = 2_000;
const RECENT_THREAD_LIMIT = 10;
const DEFAULT_VISIBLE_THREADS = 5;
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
  /** Show the Queue to Codex toolbar action. Defaults to true. */
  ui?: boolean;
};

export type MesurerCodexSendRequest = {
  /** Optional instruction for this send. */
  instruction?: string;
  /** Send only these saved annotation ids. When omitted, all saved annotations are sent. */
  annotationIds?: string[];
  /** Send to a particular bridge-visible Codex thread for this request. */
  thread?: string;
};

export type MesurerCodexSendResult = {
  thread: string;
  output: string;
  /** Mesurer currently delivers feedback as a queued Codex follow-up, never as an in-flight steer. */
  delivery: "queued";
};

export type MesurerCodexHealth = {
  /** Current bridge default target. Null when the bridge has not been bound yet. */
  thread: string | null;
  /** Threads explicitly registered by local Codex processes/users. */
  threads: string[];
};

export type MesurerCodexThread = {
  id: string;
  title: string;
  updatedAt: number | null;
  /** True when a local Codex SessionStart/register path has connected this thread. */
  connected: boolean;
};

export type MesurerCodexThreadList = {
  /** Thread used to scope same-project discovery. */
  thread: string | null;
  /** Recent same-project Codex threads, current scoped thread first when available. */
  threads: MesurerCodexThread[];
  /** Whether Codex reported more threads beyond this bounded list. */
  hasMore: boolean;
};

export type MesurerCodexThreadListOptions = {
  /** Maximum number of threads to return. The bridge clamps this to 10. */
  limit?: number;
  /** Registered thread whose project should scope discovery. */
  thread?: string;
};

export type MesurerCodexService = {
  health(): Promise<MesurerCodexHealth>;
  /** List recent Codex threads for the current Mesurer project through Codex app-server. */
  listThreads(options?: MesurerCodexThreadListOptions): Promise<MesurerCodexThreadList>;
  /** Switch the bridge default target to an already-registered thread. */
  useThread(thread: string): Promise<MesurerCodexHealth>;
  /**
   * Queue Context for the page-pinned/default target or one explicit bridge-visible thread.
   * This does not steer or interrupt an in-flight Codex turn.
   */
  send(request?: MesurerCodexSendRequest): Promise<MesurerCodexSendResult>;
};

type BridgeThread = {
  id?: string;
  title?: string;
  updatedAt?: number | null;
  connected?: boolean;
};

type BridgeResponse = {
  ok?: boolean;
  thread?: string | null;
  threads?: string[];
  threadDetails?: BridgeThread[];
  hasMore?: boolean;
  output?: string;
  delivery?: "queued";
  error?: string;
};

type BridgeSendRequest = {
  message: string;
  thread?: string;
};

type BridgeAvailability = "unknown" | "available" | "unavailable";

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
        payload = JSON.parse(text);
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
    if (cause instanceof TypeError) {
      throw new Error(`Mesurer Codex bridge is unavailable at ${endpoint}. Start the local bridge before queueing feedback.`);
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
};

const bridgeHealth = (response: BridgeResponse): MesurerCodexHealth => ({
  thread: response.thread?.trim() || null,
  threads: Array.isArray(response.threads)
    ? response.threads.filter((thread) => thread.trim().length > 0)
    : [],
});

const bridgeThreadList = (response: BridgeResponse): MesurerCodexThreadList => ({
  thread: response.thread?.trim() || null,
  threads: Array.isArray(response.threadDetails)
    ? response.threadDetails.flatMap((thread) => {
        const id = thread.id?.trim() ?? "";
        if (!id) return [];
        const title = thread.title?.trim() || id;
        return [{
          id,
          title,
          updatedAt: thread.updatedAt != null && Number.isFinite(thread.updatedAt)
            ? thread.updatedAt
            : null,
          connected: thread.connected === true,
        }];
      })
    : [],
  hasMore: response.hasMore === true,
});

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

const shortThread = (thread: string) => thread.length > 16
  ? `${thread.slice(0, 8)}…${thread.slice(-4)}`
  : thread;

const truncateLabel = (value: string, max = 42) => value.length > max
  ? `${value.slice(0, max - 1)}…`
  : value;

const bridgeTransportUnavailable = (cause: unknown, endpoint: string) =>
  cause instanceof Error
  && cause.message === `Mesurer Codex bridge is unavailable at ${endpoint}. Start the local bridge before queueing feedback.`;

export function codex(options: MesurerCodexPluginOptions = {}): MesurerPlugin {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const instruction = options.instruction?.trim() || DEFAULT_INSTRUCTION;
  const withUi = options.ui ?? true;

  return {
    id: MESURER_CODEX_PLUGIN_ID,
    version: MESURER_VERSION,
    requires: [CONTEXT_SERVICE_ID],
    provides: [MESURER_CODEX_SERVICE_ID],
    setup(ctx) {
      const contextService = ctx.service.get<MesurerContextService>(CONTEXT_SERVICE_ID);
      if (!contextService) throw new Error("Mesurer Codex plugin requires context() from mesurer-solid/plugins.");

      let bridgeAvailability: BridgeAvailability = "unknown";
      let everConnected = false;
      let originThread: string | null = null;
      let selectedThread: string | null = null;
      let lastBridgeThread: string | null = null;
      let registeredThreadIds: string[] = [];
      let recentThreads: MesurerCodexThread[] = [];
      let recentHasMore = false;
      let visibleThreadCount = DEFAULT_VISIBLE_THREADS;
      let toolRegistration: Registration | undefined;
      let toolSignature = "";
      let refreshPromise: Promise<void> | null = null;
      let disposed = false;

      const fetchHealth = async () => bridgeHealth(await bridgeRequest(endpoint, "health"));
      const fetchThreads = async (
        listOptions: MesurerCodexThreadListOptions = {},
      ): Promise<MesurerCodexThreadList> => {
        const params = new URLSearchParams();
        params.set("limit", String(listOptions.limit ?? RECENT_THREAD_LIMIT));
        const scope = listOptions.thread?.trim();
        if (scope) params.set("thread", scope);
        return bridgeThreadList(await bridgeRequest(endpoint, `threads?${params.toString()}`));
      };

      const currentTarget = () => selectedThread ?? originThread ?? lastBridgeThread;

      const menuThreads = () => {
        const ordered: MesurerCodexThread[] = [];
        const seen = new Set<string>();
        const push = (thread: MesurerCodexThread) => {
          if (seen.has(thread.id)) return;
          seen.add(thread.id);
          ordered.push(thread);
        };
        const fallback = (id: string): MesurerCodexThread => ({
          id,
          title: `Codex ${shortThread(id)}`,
          updatedAt: null,
          connected: true,
        });
        if (originThread) push(recentThreads.find((thread) => thread.id === originThread) ?? fallback(originThread));
        const target = selectedThread;
        if (target) push(recentThreads.find((thread) => thread.id === target) ?? fallback(target));
        for (const thread of recentThreads) push(thread);
        for (const id of registeredThreadIds) push(recentThreads.find((thread) => thread.id === id) ?? fallback(id));
        return ordered;
      };

      let refreshRuntime = (_allowUnknown = false): Promise<void> => Promise.resolve();

      const menuItems = (): ToolMenuItemContribution[] => {
        if (bridgeAvailability !== "available") {
          return [{
            id: "codex.thread.connect",
            label: bridgeAvailability === "unavailable"
              ? "Retry Codex connection"
              : "Choose Codex thread…",
            run: () => refreshRuntime(true),
          }];
        }

        const threads = menuThreads();
        const visible = threads.slice(0, visibleThreadCount);
        const target = currentTarget();
        const items: ToolMenuItemContribution[] = visible.map((thread) => {
          const prefix = thread.id === originThread
            ? "Current · "
            : thread.connected
              ? "Connected · "
              : "";
          return {
            id: `codex.thread.${thread.id}`,
            label: `${prefix}${truncateLabel(thread.title)}`,
            checked: () => target === thread.id,
            run() {
              selectedThread = thread.id;
              syncTool();
            },
          };
        });
        if (visibleThreadCount < RECENT_THREAD_LIMIT
          && (threads.length > visibleThreadCount || recentHasMore)) {
          items.push({
            id: "codex.thread.show-more",
            label: "Show 5 more…",
            run() {
              visibleThreadCount = RECENT_THREAD_LIMIT;
              syncTool();
            },
          });
        }
        return items;
      };

      const syncTool = () => {
        if (!withUi || disposed) return;
        const target = currentTarget();
        const items = menuItems();
        const canSend = bridgeAvailability !== "unavailable"
          && (bridgeAvailability === "unknown" || Boolean(target));
        const label = bridgeAvailability === "unavailable"
          ? "Codex unavailable"
          : bridgeAvailability === "available" && !target
            ? "No Codex thread"
            : "Queue to Codex";
        const signature = JSON.stringify({
          bridgeAvailability,
          target,
          label,
          visibleThreadCount,
          items: items.map((item) => ({
            id: item.id,
            label: item.label,
            checked: item.checked?.() ?? null,
          })),
        });
        if (signature === toolSignature) return;
        toolSignature = signature;
        toolRegistration?.dispose();
        toolRegistration = ctx.tool.register({
          id: "codex.send",
          label,
          command: "codex.send",
          order: 73,
          icon: SEND_ICON,
          disabled: () => !canSend,
          menu: items.length ? { label: "Codex destination", items } : undefined,
        });
      };

      const refreshRecent = async () => {
        if (bridgeAvailability !== "available") return;
        const originStillRegistered = originThread
          ? registeredThreadIds.includes(originThread)
          : false;
        const scope = originStillRegistered ? originThread : lastBridgeThread;
        try {
          const list = await fetchThreads({
            limit: RECENT_THREAD_LIMIT,
            thread: scope ?? undefined,
          });
          recentThreads = list.threads;
          recentHasMore = list.hasMore;
        } catch {
          recentThreads = registeredThreadIds.map((id) => ({
            id,
            title: `Codex ${shortThread(id)}`,
            updatedAt: null,
            connected: true,
          }));
          recentHasMore = false;
        }
      };

      refreshRuntime = (allowUnknown = false) => {
        if (disposed) return Promise.resolve();
        if (bridgeAvailability === "unknown" && !allowUnknown) return Promise.resolve();
        if (refreshPromise) return refreshPromise;

        refreshPromise = (async () => {
          try {
            const health = await fetchHealth();
            const bridgeThreadChanged = health.thread !== lastBridgeThread;
            bridgeAvailability = "available";
            everConnected = true;
            lastBridgeThread = health.thread;
            registeredThreadIds = health.threads;
            if (!originThread && health.thread) {
              originThread = health.thread;
              selectedThread = health.thread;
            }
            if (bridgeThreadChanged || recentThreads.length === 0) await refreshRecent();
          } catch (cause) {
            bridgeAvailability = "unavailable";
            throw cause;
          } finally {
            refreshPromise = null;
            syncTool();
          }
        })();
        return refreshPromise;
      };

      const service: MesurerCodexService = {
        health: fetchHealth,
        listThreads: fetchThreads,
        async useThread(thread) {
          const target = thread.trim();
          if (!target) throw new Error("Codex thread must be a non-empty string.");
          const health = bridgeHealth(await bridgeRequest(endpoint, "target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thread: target }),
          }));
          selectedThread = target;
          lastBridgeThread = health.thread;
          registeredThreadIds = health.threads;
          bridgeAvailability = "available";
          everConnected = true;
          syncTool();
          return health;
        },
        async send(request) {
          const message = await feedbackMessage(contextService, request, instruction);
          const explicitThread = request?.thread?.trim();
          const thread = explicitThread || (withUi ? currentTarget() : null);
          const payload: BridgeSendRequest = { message };
          if (thread) payload.thread = thread;
          try {
            const response = await bridgeRequest(endpoint, "send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const sentThread = response.thread?.trim();
            if (!sentThread) throw new Error("Mesurer Codex bridge did not report the destination thread.");
            return { thread: sentThread, output: response.output ?? "", delivery: "queued" };
          } catch (cause) {
            if (withUi && bridgeTransportUnavailable(cause, endpoint)) {
              bridgeAvailability = "unavailable";
              syncTool();
            }
            throw cause;
          }
        },
      };

      ctx.service.provide(MESURER_CODEX_SERVICE_ID, service);
      ctx.command.register("codex.send", async () => {
        try {
          if (withUi && bridgeAvailability !== "available") await refreshRuntime(true);
          const result = await service.send();
          console.info(`[Mesurer] Queued feedback for Codex thread ${result.thread}.`);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          console.error(`[Mesurer] Failed to queue feedback for Codex: ${message}`);
          throw cause;
        }
      });

      if (withUi) {
        syncTool();
        const interval = globalThis.setInterval(() => {
          if (!everConnected) return;
          void refreshRuntime().catch(() => undefined);
        }, HEALTH_POLL_MS);
        ctx.lifecycle.onDispose(() => {
          disposed = true;
          globalThis.clearInterval(interval);
          toolRegistration?.dispose();
          toolRegistration = undefined;
        });
      }
    },
  };
}
