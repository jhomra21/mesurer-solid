import type { MesurerContextService } from "./context-plugin";
import type { MesurerPlugin, Registration, ToolMenuItemContribution } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_CODEX_PLUGIN_ID = "mesurer.codex";
export const MESURER_CODEX_SERVICE_ID = "codex:v1";

const CONTEXT_SERVICE_ID = "context:v1";
const DEFAULT_ENDPOINT = "http://127.0.0.1:47365";
const HEALTH_POLL_MS = 2_000;
const DELIVERY_POLL_MS = 750;
const COMPLETED_VISIBLE_MS = 1_800;
const INTERRUPTED_RECONCILE_POLL_MS = 2_000;
const INTERRUPTED_RECONCILE_WINDOW_MS = 2 * 60_000;
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

const PENDING_ICON = {
  viewBox: "0 0 256 256",
  paths: [
    "M72,32H184a8,8,0,0,1,0,16h-8v20.69a40,40,0,0,1-11.72,28.28L137.25,124l27.03,27.03A40,40,0,0,1,176,179.31V208h8a8,8,0,0,1,0,16H72a8,8,0,0,1,0-16h8V179.31a40,40,0,0,1,11.72-28.28L118.75,124,91.72,96.97A40,40,0,0,1,80,68.69V48H72a8,8,0,0,1,0-16Zm24,16V68.69a24,24,0,0,0,7.03,16.97L128,110.63l24.97-24.97A24,24,0,0,0,160,68.69V48Zm32,90.63-24.97,24.97A24,24,0,0,0,96,180.57V208h64V180.57a24,24,0,0,0-7.03-16.97Z",
  ],
};

const COMPLETE_ICON = {
  viewBox: "0 0 256 256",
  paths: [
    "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  ],
};

export type MesurerCodexPluginOptions = {
  /** Loopback bridge URL. Defaults to http://127.0.0.1:47365. */
  endpoint?: string;
  /** Default instruction prepended to Mesurer evidence. */
  instruction?: string;
  /** Show the Queue to Codex toolbar action. Defaults to true. */
  ui?: boolean;
  /** Remove annotations included in a delivery after Codex reports that turn finished. Defaults to true. */
  clearCompletedAnnotations?: boolean;
};

export type MesurerCodexSendRequest = {
  /** Optional instruction for this send. */
  instruction?: string;
  /** Send only these saved annotation ids. When omitted, all saved annotations are sent. */
  annotationIds?: string[];
  /** Send to a particular bridge-visible Codex thread for this request. */
  thread?: string;
};

export type MesurerCodexDeliveryStatus = "queued" | "working" | "completed" | "interrupted";
export type MesurerCodexDispatchStatus =
  | "persisting"
  | "persisted"
  | "resumed"
  | "already-loaded"
  | "unsupported"
  | "wake-failed"
  | "untracked"
  | "desktop-local"
  | "waiting-active"
  | "desktop-sent"
  | "desktop-opened"
  | "desktop-send-uncertain"
  | "desktop-wait-failed";

export type MesurerCodexDelivery = {
  id: string;
  thread: string;
  status: MesurerCodexDeliveryStatus;
  turnId: string | null;
  /** Codex's durable queue identity when the current CLI reports it. */
  queuedSubmissionId?: string | null;
  /** Bridge-side dispatch action after Codex durably accepted the queue item. */
  dispatch?: MesurerCodexDispatchStatus;
  /** Non-fatal wake diagnostic when persistence succeeded but dispatch could not be verified. */
  dispatchError?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MesurerCodexSendResult = {
  thread: string;
  output: string;
  /** Mesurer currently delivers feedback as a queued Codex follow-up, never as an in-flight steer. */
  delivery: "queued";
  /** Bridge lifecycle id. Null only when talking to an older compatible bridge. */
  deliveryId: string | null;
  status: MesurerCodexDeliveryStatus;
  /** Codex's durable queue identity when the current CLI reports it. */
  queuedSubmissionId?: string | null;
  /** Bridge-side dispatch action after Codex durably accepted the queue item. */
  dispatch?: MesurerCodexDispatchStatus;
  /** Non-fatal wake diagnostic when persistence succeeded but dispatch could not be verified. */
  dispatchError?: string | null;
  /** Exact saved annotations included in this queued request. */
  annotationIds: string[];
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
  /** Read lifecycle state for one bridge-tracked delivery. */
  delivery(deliveryId: string): Promise<MesurerCodexDelivery>;
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
  deliveryId?: string;
  status?: MesurerCodexDeliveryStatus;
  turnId?: string | null;
  queuedSubmissionId?: string | null;
  dispatch?: MesurerCodexDispatchStatus;
  dispatchError?: string | null;
  createdAt?: number;
  updatedAt?: number;
  error?: string;
};

type BridgeSendRequest = {
  message: string;
  thread?: string;
};

type BridgeRestoreRequest = {
  deliveryId: string;
  thread: string;
  queuedSubmissionId?: string;
};

type BridgeAvailability = "unknown" | "available" | "unavailable";
type UiDeliveryStatus = "queueing" | MesurerCodexDeliveryStatus | "failed";
type UiDeliveryState = {
  id: string | null;
  thread: string | null;
  status: UiDeliveryStatus;
  annotationIds: string[];
  queuedSubmissionId: string | null;
  dispatch: MesurerCodexDispatchStatus | null;
  dispatchError: string | null;
};

type PersistedCodexUiState = {
  version: 1;
  originThread: string | null;
  selectedThread: string | null;
  delivery: {
    id: string;
    thread: string;
    status: "queued" | "working" | "interrupted";
    annotationIds: string[];
    queuedSubmissionId?: string | null;
    dispatch?: MesurerCodexDispatchStatus | null;
    dispatchError?: string | null;
  } | null;
};

const browserStateStorageKey = (endpoint: string) => {
  try {
    const location = globalThis.location;
    if (!location?.origin) return null;
    return `mesurer-codex-ui:v1:${endpoint}:${location.origin}${location.pathname}`;
  } catch {
    return null;
  }
};

const readBrowserState = (endpoint: string): PersistedCodexUiState | null => {
  const key = browserStateStorageKey(endpoint);
  if (!key) return null;
  try {
    const raw = globalThis.sessionStorage?.getItem(key);
    if (!raw) return null;
    // SAFETY: this key is written only by writeBrowserState. Foreign or malformed JSON shapes
    // can still throw while normalizing below; the surrounding boundary rejects them as no state.
    const value = JSON.parse(raw) as PersistedCodexUiState;
    if (value.version !== 1) return null;
    const originThread = value.originThread?.trim() || null;
    const selectedThread = value.selectedThread?.trim() || null;
    const delivery = value.delivery;
    const persistedDelivery = delivery
      && delivery.id.trim()
      && delivery.thread.trim()
      && (delivery.status === "queued"
        || delivery.status === "working"
        || delivery.status === "interrupted")
      && Array.isArray(delivery.annotationIds)
      ? {
          id: delivery.id.trim(),
          thread: delivery.thread.trim(),
          status: delivery.status,
          annotationIds: delivery.annotationIds.filter((id) => id.trim().length > 0),
          queuedSubmissionId: delivery.queuedSubmissionId?.trim() || null,
          dispatch: delivery.dispatch ?? null,
          dispatchError: delivery.dispatchError?.trim() || null,
        }
      : null;
    return {
      version: 1,
      originThread,
      selectedThread,
      delivery: persistedDelivery,
    };
  } catch {
    return null;
  }
};

const writeBrowserState = (endpoint: string, state: PersistedCodexUiState) => {
  const key = browserStateStorageKey(endpoint);
  if (!key) return;
  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(state));
  } catch {
    // Session storage is optional. Routing still works for the current page lifetime.
  }
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

const bridgeDelivery = (response: BridgeResponse): MesurerCodexDelivery => {
  const id = response.deliveryId?.trim();
  const thread = response.thread?.trim();
  const status = response.status;
  if (!id || !thread || !status) throw new Error("Mesurer Codex bridge returned an invalid delivery state.");
  const delivery: MesurerCodexDelivery = {
    id,
    thread,
    status,
    turnId: response.turnId?.trim() || null,
    createdAt: Number.isFinite(response.createdAt) ? Number(response.createdAt) : 0,
    updatedAt: Number.isFinite(response.updatedAt) ? Number(response.updatedAt) : 0,
  };
  if (response.queuedSubmissionId !== undefined) {
    delivery.queuedSubmissionId = response.queuedSubmissionId?.trim() || null;
  }
  if (response.dispatch !== undefined) delivery.dispatch = response.dispatch;
  if (response.dispatchError !== undefined) {
    delivery.dispatchError = response.dispatchError?.trim() || null;
  }
  return delivery;
};

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

const feedbackPayload = async (
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

  return {
    annotationIds: annotations.map((annotation) => annotation.id),
    message: [
      instruction,
      "",
      ...evidence.flatMap((value, index) => [
        evidence.length > 1 ? `Feedback ${index + 1}` : "Mesurer evidence",
        value,
        "",
      ]),
    ].join("\n").trimEnd(),
  };
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
  const clearCompletedAnnotations = options.clearCompletedAnnotations ?? true;

  return {
    id: MESURER_CODEX_PLUGIN_ID,
    version: MESURER_VERSION,
    requires: [CONTEXT_SERVICE_ID],
    provides: [MESURER_CODEX_SERVICE_ID],
    setup(ctx) {
      const contextService = ctx.service.get<MesurerContextService>(CONTEXT_SERVICE_ID);
      if (!contextService) throw new Error("Mesurer Codex plugin requires context() from mesurer-solid/plugins.");

      const persistedUiState = withUi ? readBrowserState(endpoint) : null;
      let bridgeAvailability: BridgeAvailability = "unknown";
      let everConnected = false;
      let originThread: string | null = persistedUiState?.originThread ?? null;
      let selectedThread: string | null = persistedUiState?.selectedThread
        ?? persistedUiState?.originThread
        ?? null;
      let routeNeedsSelection = false;
      let lastBridgeThread: string | null = null;
      let registeredThreadIds: string[] = [];
      let recentThreads: MesurerCodexThread[] = [];
      let recentHasMore = false;
      let visibleThreadCount = DEFAULT_VISIBLE_THREADS;
      let toolRegistration: Registration | undefined;
      let toolSignature = "";
      let refreshPromise: Promise<void> | null = null;
      let activeDelivery: UiDeliveryState | null = persistedUiState?.delivery
        ? {
            id: persistedUiState.delivery.id,
            thread: persistedUiState.delivery.thread,
            status: persistedUiState.delivery.status,
            annotationIds: persistedUiState.delivery.annotationIds,
            queuedSubmissionId: persistedUiState.delivery.queuedSubmissionId ?? null,
            dispatch: persistedUiState.delivery.dispatch ?? null,
            dispatchError: persistedUiState.delivery.dispatchError ?? null,
          }
        : null;
      let deliveryPollTimer = 0;
      let completedVisibleTimer = 0;
      let uiSendPromise: Promise<void> | null = null;
      let disposed = false;

      const fetchHealth = async () => bridgeHealth(await bridgeRequest(endpoint, "health"));
      const fetchDelivery = async (deliveryId: string) =>
        bridgeDelivery(await bridgeRequest(endpoint, `deliveries/${encodeURIComponent(deliveryId)}`));
      const restoreDelivery = async (delivery: UiDeliveryState) => {
        if (!delivery.id || !delivery.thread) {
          throw new Error("Cannot restore a Codex delivery without its id and thread.");
        }
        const body: BridgeRestoreRequest = {
          deliveryId: delivery.id,
          thread: delivery.thread,
        };
        if (delivery.queuedSubmissionId) body.queuedSubmissionId = delivery.queuedSubmissionId;
        return bridgeDelivery(await bridgeRequest(endpoint, "deliveries/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }));
      };
      const fetchThreads = async (
        listOptions: MesurerCodexThreadListOptions = {},
      ): Promise<MesurerCodexThreadList> => {
        const params = new URLSearchParams();
        params.set("limit", String(listOptions.limit ?? RECENT_THREAD_LIMIT));
        const scope = listOptions.thread?.trim();
        if (scope) params.set("thread", scope);
        return bridgeThreadList(await bridgeRequest(endpoint, `threads?${params.toString()}`));
      };

      const currentTarget = () => selectedThread ?? originThread ?? (routeNeedsSelection ? null : lastBridgeThread);
      const persistUiState = () => {
        if (!withUi) return;
        const persistedDelivery = activeDelivery?.id
          && (activeDelivery.status === "queued"
            || activeDelivery.status === "working"
            || activeDelivery.status === "interrupted")
          ? {
              id: activeDelivery.id,
              thread: activeDelivery.thread ?? currentTarget() ?? "",
              status: activeDelivery.status,
              annotationIds: [...activeDelivery.annotationIds],
              queuedSubmissionId: activeDelivery.queuedSubmissionId,
              dispatch: activeDelivery.dispatch,
              dispatchError: activeDelivery.dispatchError,
            }
          : null;
        writeBrowserState(endpoint, {
          version: 1,
          originThread,
          selectedThread,
          delivery: persistedDelivery?.thread ? persistedDelivery : null,
        });
      };
      const bindPageThread = (thread: string, makeOrigin = false) => {
        const target = thread.trim();
        if (!target) return;
        if (makeOrigin || !originThread) originThread = target;
        selectedThread = target;
        routeNeedsSelection = false;
        persistUiState();
      };
      const deliveryBusy = () => activeDelivery !== null
        && ["queueing", "queued", "working", "completed"].includes(activeDelivery.status);
      const deliveryBlocked = () => activeDelivery?.status === "queued"
        && (activeDelivery.dispatch === "desktop-send-uncertain"
          || activeDelivery.dispatch === "desktop-wait-failed");
      const deliveryStatusText = (status: UiDeliveryStatus) => {
        if (status === "queueing") return "Queueing…";
        if (status === "queued") return "Queued";
        if (status === "working") return "Working…";
        if (status === "completed") return "Done";
        if (status === "interrupted") return "Interrupted";
        return "Failed";
      };
      const deliveryToolLabel = () => {
        if (!activeDelivery) return null;
        if (activeDelivery.status === "queueing") return "Queueing to Codex…";
        if (deliveryBlocked()) return "Codex delivery blocked";
        if (activeDelivery.status === "queued") return "Queued for Codex";
        if (activeDelivery.status === "working") return "Codex working…";
        if (activeDelivery.status === "completed") return "Codex finished";
        if (activeDelivery.status === "interrupted") return "Codex interrupted";
        return "Queue failed";
      };
      const deliveryToolIcon = () => {
        if (!activeDelivery) return SEND_ICON;
        if (["queueing", "queued", "working"].includes(activeDelivery.status)) return PENDING_ICON;
        if (activeDelivery.status === "completed") return COMPLETE_ICON;
        return SEND_ICON;
      };

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
          const deliverySuffix = activeDelivery?.thread === thread.id
            ? ` · ${deliveryBlocked() ? "Blocked" : deliveryStatusText(activeDelivery.status)}`
            : "";
          return {
            id: `codex.thread.${thread.id}`,
            label: `${prefix}${truncateLabel(thread.title)}${deliverySuffix}`,
            checked: () => target === thread.id,
            disabled: () => deliveryBusy(),
            run() {
              if (deliveryBusy()) return;
              bindPageThread(thread.id, !originThread);
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
        const canSend = !deliveryBusy()
          && !routeNeedsSelection
          && bridgeAvailability !== "unavailable"
          && (bridgeAvailability === "unknown" || Boolean(target));
        const label = deliveryToolLabel()
          ?? (bridgeAvailability === "unavailable"
            ? "Codex unavailable"
            : routeNeedsSelection || (bridgeAvailability === "available" && !target)
              ? "Choose Codex thread"
              : "Queue to Codex");
        const signature = JSON.stringify({
          bridgeAvailability,
          routeNeedsSelection,
          target,
          label,
          visibleThreadCount,
          activeDelivery,
          items: items.map((item) => ({
            id: item.id,
            label: item.label,
            checked: item.checked?.() ?? null,
            disabled: item.disabled?.() ?? false,
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
          icon: deliveryToolIcon(),
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

            const restoredTarget = selectedThread ?? originThread;
            if (restoredTarget) {
              routeNeedsSelection = !health.threads.includes(restoredTarget);
            } else if (health.threads.length === 1) {
              bindPageThread(health.threads[0]!, true);
            } else if (health.threads.length > 1) {
              routeNeedsSelection = true;
            } else {
              routeNeedsSelection = true;
            }

            if (bridgeThreadChanged || recentThreads.length === 0 || routeNeedsSelection) {
              await refreshRecent();
            }

            if (routeNeedsSelection && restoredTarget
              && recentThreads.some((thread) => thread.id === restoredTarget)) {
              routeNeedsSelection = false;
              persistUiState();
            }
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

      const clearDeliveryTimers = () => {
        if (deliveryPollTimer) {
          globalThis.clearTimeout(deliveryPollTimer);
          deliveryPollTimer = 0;
        }
        if (completedVisibleTimer) {
          globalThis.clearTimeout(completedVisibleTimer);
          completedVisibleTimer = 0;
        }
      };

      const resetCompletedDeliveryLater = () => {
        if (completedVisibleTimer) globalThis.clearTimeout(completedVisibleTimer);
        completedVisibleTimer = globalThis.setTimeout(() => {
          completedVisibleTimer = 0;
          if (activeDelivery?.status !== "completed") return;
          activeDelivery = null;
          persistUiState();
          syncTool();
        }, COMPLETED_VISIBLE_MS);
      };

      const finishDelivery = async (delivery: MesurerCodexDelivery) => {
        if (!activeDelivery || activeDelivery.id !== delivery.id) return;
        activeDelivery = {
          ...activeDelivery,
          thread: delivery.thread,
          status: delivery.status,
          queuedSubmissionId: delivery.queuedSubmissionId ?? activeDelivery.queuedSubmissionId,
          dispatch: delivery.dispatch ?? activeDelivery.dispatch,
          dispatchError: delivery.dispatchError ?? activeDelivery.dispatchError,
        };
        persistUiState();
        if (delivery.status === "completed") {
          if (clearCompletedAnnotations) {
            for (const annotationId of activeDelivery.annotationIds) {
              await contextService.removeAnnotation(annotationId);
            }
          }
          persistUiState();
          syncTool();
          resetCompletedDeliveryLater();
          return;
        }
        if (delivery.status === "interrupted") {
          persistUiState();
          syncTool();
          const updatedAt = delivery.updatedAt > 0 ? delivery.updatedAt : Date.now();
          if (Date.now() - updatedAt < INTERRUPTED_RECONCILE_WINDOW_MS) {
            deliveryPollTimer = globalThis.setTimeout(() => {
              deliveryPollTimer = 0;
              void pollDelivery(delivery.id);
            }, INTERRUPTED_RECONCILE_POLL_MS);
          }
          return;
        }
        syncTool();
        deliveryPollTimer = globalThis.setTimeout(() => {
          deliveryPollTimer = 0;
          void pollDelivery(delivery.id);
        }, DELIVERY_POLL_MS);
      };

      const pollDelivery = async (deliveryId: string): Promise<void> => {
        if (disposed || activeDelivery?.id !== deliveryId) return;
        try {
          await finishDelivery(await fetchDelivery(deliveryId));
        } catch (cause) {
          if (activeDelivery?.id !== deliveryId) return;
          let failure = cause;
          if (activeDelivery.status === "queued" && activeDelivery.thread) {
            try {
              if (bridgeAvailability !== "available") await refreshRuntime(true);
              const restored = await restoreDelivery(activeDelivery);
              await finishDelivery(restored);
              return;
            } catch (restoreCause) {
              failure = restoreCause;
            }
          }
          if (activeDelivery?.id !== deliveryId) return;
          if (activeDelivery.status === "interrupted") {
            syncTool();
            return;
          }
          activeDelivery = { ...activeDelivery, status: "failed" };
          persistUiState();
          if (bridgeTransportUnavailable(failure, endpoint)) bridgeAvailability = "unavailable";
          syncTool();
        }
      };

      const service: MesurerCodexService = {
        health: fetchHealth,
        listThreads: fetchThreads,
        delivery: fetchDelivery,
        async useThread(thread) {
          const target = thread.trim();
          if (!target) throw new Error("Codex thread must be a non-empty string.");
          const health = bridgeHealth(await bridgeRequest(endpoint, "target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thread: target }),
          }));
          bindPageThread(target, !originThread);
          lastBridgeThread = health.thread;
          registeredThreadIds = health.threads;
          bridgeAvailability = "available";
          everConnected = true;
          syncTool();
          return health;
        },
        async send(request) {
          const feedback = await feedbackPayload(contextService, request, instruction);
          const explicitThread = request?.thread?.trim();
          const thread = explicitThread || (withUi ? currentTarget() : null);
          if (withUi && !explicitThread && (routeNeedsSelection || !thread)) {
            throw new Error("Choose a Codex thread before queueing feedback.");
          }
          const payload: BridgeSendRequest = { message: feedback.message };
          if (thread) payload.thread = thread;
          try {
            const response = await bridgeRequest(endpoint, "send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const sentThread = response.thread?.trim();
            if (!sentThread) throw new Error("Mesurer Codex bridge did not report the destination thread.");
            const result: MesurerCodexSendResult = {
              thread: sentThread,
              output: response.output ?? "",
              delivery: "queued",
              deliveryId: response.deliveryId?.trim() || null,
              status: response.status ?? "queued",
              annotationIds: feedback.annotationIds,
            };
            if (response.queuedSubmissionId !== undefined) {
              result.queuedSubmissionId = response.queuedSubmissionId?.trim() || null;
            }
            if (response.dispatch !== undefined) result.dispatch = response.dispatch;
            if (response.dispatchError !== undefined) {
              result.dispatchError = response.dispatchError?.trim() || null;
            }
            return result;
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
        if (uiSendPromise || deliveryBusy()) return;
        clearDeliveryTimers();
        const target = currentTarget();
        activeDelivery = {
          id: null,
          thread: target,
          status: "queueing",
          annotationIds: [],
          queuedSubmissionId: null,
          dispatch: null,
          dispatchError: null,
        };
        syncTool();

        uiSendPromise = (async () => {
          try {
            if (withUi && bridgeAvailability !== "available") await refreshRuntime(true);
            const result = await service.send();
            activeDelivery = {
              id: result.deliveryId,
              thread: result.thread,
              status: result.status,
              annotationIds: result.annotationIds,
              queuedSubmissionId: result.queuedSubmissionId ?? null,
              dispatch: result.dispatch ?? null,
              dispatchError: result.dispatchError ?? null,
            };
            bindPageThread(result.thread, !originThread);
            persistUiState();
            syncTool();
            console.info(`[Mesurer] Queued feedback for Codex thread ${result.thread}.`);

            if (result.deliveryId) {
              if (result.status === "completed" || result.status === "interrupted") {
                await finishDelivery({
                  id: result.deliveryId,
                  thread: result.thread,
                  status: result.status,
                  turnId: null,
                  createdAt: 0,
                  updatedAt: 0,
                });
              } else {
                deliveryPollTimer = globalThis.setTimeout(() => {
                  deliveryPollTimer = 0;
                  void pollDelivery(result.deliveryId!);
                }, DELIVERY_POLL_MS);
              }
            } else {
              // Older companion: queue acceptance is known, lifecycle completion is not.
              completedVisibleTimer = globalThis.setTimeout(() => {
                completedVisibleTimer = 0;
                if (activeDelivery?.id !== null || activeDelivery?.status !== "queued") return;
                activeDelivery = null;
                persistUiState();
                syncTool();
              }, COMPLETED_VISIBLE_MS);
            }
          } catch (cause) {
            activeDelivery = null;
            persistUiState();
            syncTool();
            const message = cause instanceof Error ? cause.message : String(cause);
            console.error(`[Mesurer] Failed to queue feedback for Codex: ${message}`);
            throw cause;
          } finally {
            uiSendPromise = null;
          }
        })();
        return uiSendPromise;
      });

      if (withUi) {
        syncTool();
        if (activeDelivery?.id) {
          everConnected = true;
          deliveryPollTimer = globalThis.setTimeout(() => {
            deliveryPollTimer = 0;
            if (!activeDelivery?.id) return;
            void pollDelivery(activeDelivery.id);
          }, 0);
        }
        const interval = globalThis.setInterval(() => {
          if (!everConnected) return;
          void refreshRuntime().catch(() => undefined);
        }, HEALTH_POLL_MS);
        ctx.lifecycle.onDispose(() => {
          disposed = true;
          clearDeliveryTimers();
          globalThis.clearInterval(interval);
          toolRegistration?.dispose();
          toolRegistration = undefined;
        });
      }
    },
  };
}
