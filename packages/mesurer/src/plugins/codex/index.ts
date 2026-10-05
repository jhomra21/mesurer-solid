import {
  MESURER_CONTEXT_SERVICE_ID,
  type MesurerContextService,
} from "../../context-plugin";
import {
  type MesurerPlugin,
  type Registration,
  type ToolMenuItemContribution,
} from "../../core";
import { MESURER_VERSION } from "../../version";

export const MESURER_CODEX_PLUGIN_ID = "mesurer.codex";

export const MESURER_CODEX_SERVICE_ID = "codex:v1";

const MANAGED_PLUGIN_BEFORE_DISABLE_HOOK = "mesurer.plugin.before-disable";

const HEALTH_POLL_MS = 2_000;

const DELIVERY_POLL_MS = 750;

const COMPLETED_VISIBLE_MS = 1_800;

const INTERRUPTED_RECONCILE_POLL_MS = 2_000;

const INTERRUPTED_RECONCILE_WINDOW_MS = 2 * 60_000;

const RECENT_THREAD_LIMIT = 10;

const DEFAULT_VISIBLE_THREADS = 5;

const DEFAULT_BROWSER_COMPANION = "http://127.0.0.1:47365";

const BROWSER_COMPANION_NAME = "mesurer-codex";

const BROWSER_COMPANION_PROTOCOL_VERSION = 2;

const BROWSER_COMPANION_REQUIRED_CAPABILITIES = [
  "thread-discovery-v1",
  "durable-queue-v1",
  "history-recovery-v2",
  "client-message-correlation-v1",
  "idle-safe-shutdown-v1",
] as const;

const BROWSER_COMPANION_PROBE_TIMEOUT_MS = 1_500;

const BROWSER_COMPANION_REQUEST_TIMEOUT_MS = 15_000;

const BROWSER_DISCONNECTED_POLL_MS = 5_000;

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
  /** Default instruction prepended to Mesurer evidence. */
  instruction?: string;
  /** Show the Queue to Codex toolbar action. Defaults to true. */
  ui?: boolean;
  /** Remove annotations included in a delivery after Codex reports that turn finished. Defaults to true. */
  clearCompletedAnnotations?: boolean;
};

export type MesurerCodexQueueRequest = {
  /** Optional instruction for this queue operation. */
  instruction?: string;
  /** Queue only these saved annotation ids. When omitted, all saved annotations are queued. */
  annotationIds?: string[];
  /** Queue to a particular loaded Codex thread for this request. */
  thread?: string;
};

/** @deprecated Use `MesurerCodexQueueRequest`. */
export type MesurerCodexSendRequest = MesurerCodexQueueRequest;

export type MesurerCodexDeliveryStatus = "queued" | "working" | "completed" | "interrupted";

export type MesurerCodexDispatchStatus = "persisted" | "desktop-opened" | "desktop-wake-failed";

export type MesurerCodexDelivery = {
  id: string;
  thread: string;
  status: MesurerCodexDeliveryStatus;
  turnId: string | null;
  /** Codex's durable queue identity when the current CLI reports it. */
  queuedSubmissionId?: string | null;
  /** Codex client user-message identity used to correlate a consumed queue item with turn history. */
  clientUserMessageId?: string | null;
  /** Codex delivery state after Codex durably accepted the queue item. */
  dispatch?: MesurerCodexDispatchStatus;
  /** Optional Codex lifecycle diagnostic. */
  dispatchError?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MesurerCodexQueueResult = {
  thread: string;
  output: string;
  /** Mesurer currently delivers feedback as a queued Codex follow-up, never as an in-flight steer. */
  delivery: "queued";
  /** Delivery id. Null only when talking to an older compatible bridge. */
  deliveryId: string | null;
  status: MesurerCodexDeliveryStatus;
  /** Codex's durable queue identity when the current CLI reports it. */
  queuedSubmissionId?: string | null;
  /** Codex client user-message identity used to correlate a consumed queue item with turn history. */
  clientUserMessageId?: string | null;
  /** Codex delivery state after Codex durably accepted the queue item. */
  dispatch?: MesurerCodexDispatchStatus;
  /** Non-fatal wake diagnostic when persistence succeeded but dispatch could not be verified. */
  dispatchError?: string | null;
  /** Exact saved annotations included in this queued request. */
  annotationIds: string[];
};

/** @deprecated Use `MesurerCodexQueueResult`. */
export type MesurerCodexSendResult = MesurerCodexQueueResult;

type MesurerCodexRuntime = {
  /** Runtime source selected by the native Codex bridge. Callers do not choose this value. */
  source: "shared" | "standalone" | "desktop" | "none";
  /** Transport available for Codex delivery. */
  transport: "shared-app-server" | "desktop-queue" | "private-stdio" | "none";
  /** Whether this runtime can serve Mesurer requests without user setup. */
  available: boolean;
  /** Machine-readable reason when the detected runtime is not usable by Mesurer. */
  reason: "desktop-private-transport" | "runtime-not-found" | null;
};

export type MesurerCodexHealth = {
  /** Current loaded Codex target. Null when no loaded Codex thread is selected. */
  thread: string | null;
  /** Codex threads currently available through the selected plugin-owned transport. */
  threads: string[];
};

export type MesurerCodexThread = {
  id: string;
  title: string;
  updatedAt: number | null;
  /** True when this thread currently accepts queue delivery through the active Codex transport. */
  connected: boolean;
};

export type MesurerCodexThreadList = {
  /** Current loaded Codex target when one is selected. */
  thread: string | null;
  /** Loaded Codex threads, current target first when available. */
  threads: MesurerCodexThread[];
  /** Whether Codex reported more threads beyond this bounded list. */
  hasMore: boolean;
};

export type MesurerCodexThreadListOptions = {
  /** Maximum number of threads to return. Codex Bridge clamps this to 10. */
  limit?: number;
  /** Loaded thread to place first when it remains available. */
  thread?: string;
};

export type MesurerCodexService = {
  health(): Promise<MesurerCodexHealth>;
  /** List recent Codex threads for the current Mesurer project through Codex app-server. */
  listThreads(options?: MesurerCodexThreadListOptions): Promise<MesurerCodexThreadList>;
  /** Switch the current loaded Codex target to a currently loaded Codex thread. */
  useThread(thread: string): Promise<MesurerCodexHealth>;
  /** Read lifecycle state for one Codex-tracked delivery. */
  delivery(deliveryId: string): Promise<MesurerCodexDelivery>;
  /**
   * Queue Context for the page-pinned/default target or one explicit loaded thread.
   * This does not steer or interrupt an in-flight Codex turn.
   */
  queue(request?: MesurerCodexQueueRequest): Promise<MesurerCodexQueueResult>;
  /** @deprecated Use `queue()`; Mesurer delivery is durable queueing, not in-flight send/steer. */
  send(request?: MesurerCodexQueueRequest): Promise<MesurerCodexQueueResult>;
};

type BrowserBridgeIdentity = {
  name?: string;
  protocol?: number;
  capabilities?: string[];
  sourceHash?: string;
};

type BrowserBridgeState = {
  registeredThreads?: number;
  deliveries?: number;
  nonTerminalDeliveries?: number;
  idle?: boolean;
};

type BridgeThread = {
  id?: string;
  title?: string;
  updatedAt?: number | null;
  connected?: boolean;
};

type BridgeResponse = {
  ok?: boolean;
  bridge?: BrowserBridgeIdentity;
  bridgeState?: BrowserBridgeState;
  access?: { allowed?: boolean };
  leaseId?: string;
  released?: boolean;
  runtime?: MesurerCodexRuntime;
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
  clientUserMessageId?: string | null;
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

type BridgeAvailability = "unknown" | "available" | "unavailable";

type UiDeliveryStatus = "queueing" | MesurerCodexDeliveryStatus | "failed";

type UiDeliveryState = {
  id: string | null;
  thread: string | null;
  status: UiDeliveryStatus;
  annotationIds: string[];
  queuedSubmissionId: string | null;
  clientUserMessageId: string | null;
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
    status: "queued" | "working" | "completed" | "interrupted" | "failed";
    annotationIds: string[];
    queuedSubmissionId?: string | null;
    clientUserMessageId?: string | null;
    dispatch?: MesurerCodexDispatchStatus | null;
    dispatchError?: string | null;
  } | null;
};

const browserStateStorageKey = () => {
  try {
    const location = globalThis.location;

    if (!location?.origin) return null;

    return `mesurer-codex-ui:v2:${location.origin}${location.pathname}`;
  } catch {
    return null;
  }
};

const readBrowserState = (): PersistedCodexUiState | null => {
  const key = browserStateStorageKey();

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
        || delivery.status === "completed"
        || delivery.status === "interrupted"
        || delivery.status === "failed")
      && Array.isArray(delivery.annotationIds)
      ? {
          id: delivery.id.trim(),
          thread: delivery.thread.trim(),
          status: delivery.status,
          annotationIds: delivery.annotationIds.filter((id) => id.trim().length > 0),
          queuedSubmissionId: delivery.queuedSubmissionId?.trim() || null,
          clientUserMessageId: delivery.clientUserMessageId?.trim() || null,
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

const writeBrowserState = (state: PersistedCodexUiState) => {
  const key = browserStateStorageKey();

  if (!key) return;

  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(state));
  } catch {
    // Session storage is optional. Routing still works for the current page lifetime.
  }
};

type CodexBridgeHostRequest = {
  action: "activate" | "deactivate" | "runtime" | "health" | "threads" | "target" | "queue" | "delivery" | "restore";
  leaseId?: string;
  thread?: string;
  limit?: number;
  message?: string;
  deliveryId?: string;
  queuedSubmissionId?: string;
  clientUserMessageId?: string;
};

const browserCompanionUrl = (path: string) => {
  const base = DEFAULT_BROWSER_COMPANION.endsWith("/")
    ? DEFAULT_BROWSER_COMPANION
    : `${DEFAULT_BROWSER_COMPANION}/`;

  return new URL(path, base).toString();
};

const assertBrowserBridgeCompatibility = (payload: BridgeResponse) => {
  const bridge = payload.bridge;

  if (!bridge) {
    throw new Error(
      "Another local service or an outdated Mesurer Codex Bridge is using port 47365. Mesurer will not send data to an unverified service.",
    );
  }

  if (bridge.name !== BROWSER_COMPANION_NAME) {
    throw new Error(
      `Another local service is using port 47365 (${bridge.name ?? "unknown"}). Mesurer will not send Codex data to it.`,
    );
  }

  if (bridge.protocol !== BROWSER_COMPANION_PROTOCOL_VERSION) {
    throw new Error(
      `Mesurer Codex Bridge is out of date (protocol ${bridge.protocol ?? "unknown"}; expected ${BROWSER_COMPANION_PROTOCOL_VERSION}). Restart the matching Mesurer Codex Bridge helper.`,
    );
  }

  if (payload.access?.allowed === false) {
    const origin = globalThis.location?.origin ?? "this page";

    throw new Error(
      `Mesurer Codex Bridge does not allow this browser origin (${origin}). Allow this origin when starting the bridge.`,
    );
  }

  const capabilities = new Set(Array.isArray(bridge.capabilities) ? bridge.capabilities : []);

  const missing = BROWSER_COMPANION_REQUIRED_CAPABILITIES
    .filter((capability) => !capabilities.has(capability));

  if (missing.length > 0) {
    throw new Error(
      `Mesurer Codex Bridge is missing required capabilities: ${missing.join(", ")}. Restart or update the matching helper.`,
    );
  }
};

const browserBridgeRequest = async (
  request: CodexBridgeHostRequest,
): Promise<BridgeResponse> => {
  let url: string;
  let init: RequestInit | undefined;

  if (request.action === "health") {
    url = browserCompanionUrl("health");
  } else if (request.action === "threads") {
    const params = new URLSearchParams();
    params.set("limit", String(request.limit ?? RECENT_THREAD_LIMIT));

    if (request.thread) params.set("thread", request.thread);
    url = `${browserCompanionUrl("threads")}?${params.toString()}`;
  } else if (request.action === "target") {
    url = browserCompanionUrl("target");
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: request.thread }),
    };
  } else if (request.action === "queue") {
    url = browserCompanionUrl("send");
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: request.message, thread: request.thread }),
    };
  } else if (request.action === "delivery") {
    url = browserCompanionUrl(
      `deliveries/${encodeURIComponent(String(request.deliveryId ?? ""))}`,
    );
  } else if (request.action === "restore") {
    url = browserCompanionUrl("deliveries/restore");
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId: request.deliveryId,
        thread: request.thread,
        queuedSubmissionId: request.queuedSubmissionId,
        clientUserMessageId: request.clientUserMessageId,
        message: request.message,
      }),
    };
  } else {
    throw new Error(`Codex browser companion does not support ${request.action}.`);
  }

  const controller = new AbortController();

  const timeoutMs = request.action === "health" || request.action === "threads"
    ? BROWSER_COMPANION_PROBE_TIMEOUT_MS
    : BROWSER_COMPANION_REQUEST_TIMEOUT_MS;

  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let payload: BridgeResponse = {};

    if (text) {
      try {
        // SAFETY: the local companion response is validated again by each bounded adapter before its fields are consumed.
        payload = JSON.parse(text) as BridgeResponse;
      } catch {
        payload = { error: text };
      }
    }

    if (request.action === "health") assertBrowserBridgeCompatibility(payload);

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error ?? `Mesurer Codex companion returned HTTP ${response.status}.`);
    }

    return payload;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error("Mesurer Codex companion timed out.");
    }

    if (cause instanceof TypeError) {
      throw new Error(`Mesurer Codex companion is unavailable at ${DEFAULT_BROWSER_COMPANION}.`);
    }

    throw cause;
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const bridgeRequest = async (
  request: CodexBridgeHostRequest,
): Promise<BridgeResponse> => {
  const bridge = window.__MESURER_HOST__?.codexBridge;

  if (!bridge) throw new Error("Codex native host bridge is unavailable.");

  const response = await bridge(request);

  if (response.ok === false) {
    throw new Error(response.error ?? "Codex Bridge request failed.");
  }

  return response;
};

const bridgeRuntime = (response: BridgeResponse): MesurerCodexRuntime | null => {
  const runtime = response.runtime;

  if (!runtime) return null;

  if (!["shared", "standalone", "desktop", "none"].includes(runtime.source)) return null;

  if (!["shared-app-server", "desktop-queue", "private-stdio", "none"].includes(runtime.transport)) return null;

  if (runtime.reason !== null
    && runtime.reason !== "desktop-private-transport"
    && runtime.reason !== "runtime-not-found") return null;

  return {
    source: runtime.source,
    transport: runtime.transport,
    available: runtime.available === true,
    reason: runtime.reason,
  };
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

  if (!id || !thread || !status) throw new Error("Codex Bridge returned an invalid delivery state.");

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

  if (response.clientUserMessageId !== undefined) {
    delivery.clientUserMessageId = response.clientUserMessageId?.trim() || null;
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
  request: MesurerCodexQueueRequest | undefined,
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

const bridgeUnavailable = (cause: unknown) =>
  cause instanceof Error
  && (
    cause.message === "Codex Bridge is unavailable in this host."
    || cause.message.includes("Codex Bridge lease")
    || cause.message.includes("Mesurer Codex companion is unavailable")
    || cause.message.includes("Mesurer Codex companion timed out")
    || cause.message.includes("Mesurer Codex Bridge")
    || cause.message.includes("Another local service")
    || cause.message.includes("browser origin")
  );

export function codex(options: MesurerCodexPluginOptions = {}): MesurerPlugin {
  const instruction = options.instruction?.trim() || DEFAULT_INSTRUCTION;
  const withUi = options.ui ?? true;
  const clearCompletedAnnotations = options.clearCompletedAnnotations ?? true;

  return {
    id: MESURER_CODEX_PLUGIN_ID,
    version: MESURER_VERSION,
    requires: [MESURER_CONTEXT_SERVICE_ID],
    provides: [MESURER_CODEX_SERVICE_ID],
    async setup(ctx) {
      const contextService = ctx.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);

      if (!contextService) throw new Error("Mesurer Codex plugin requires context() from mesurer-solid/plugins.");

      const persistedUiState = withUi ? readBrowserState() : null;

      let bridgeAvailability: BridgeAvailability = "unknown";
      let lastBridgeError: string | null = null;
      let codexRuntime: MesurerCodexRuntime | null = null;

      let everConnected = false;
      let originThread: string | null = persistedUiState?.originThread ?? null;

      let selectedThread: string | null = persistedUiState?.selectedThread
        ?? persistedUiState?.originThread
        ?? null;

      let routeNeedsSelection = false;
      let lastBridgeThread: string | null = null;
      let loadedThreadIds: string[] = [];
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
            clientUserMessageId: persistedUiState.delivery.clientUserMessageId ?? null,
            dispatch: persistedUiState.delivery.dispatch ?? null,
            dispatchError: persistedUiState.delivery.dispatchError ?? null,
          }
        : null;

      let deliveryPollTimer = 0;
      let completedVisibleTimer = 0;
      let uiSendPromise: Promise<void> | null = null;
      let disposed = false;
      let leaseId: string | null = null;
      let browserBridgeVerifiedAt = 0;
      const nativeBridgeAvailable = window.__MESURER_HOST__?.codexBridge !== undefined;

      const requestBridge = async (
        request: CodexBridgeHostRequest,
      ): Promise<BridgeResponse> => {
        if (!nativeBridgeAvailable) {
          try {
            const writeRequiresFreshVerification = request.action === "queue"
              || request.action === "target"
              || request.action === "restore";

            if (request.action !== "health"
              && (writeRequiresFreshVerification
                || Date.now() - browserBridgeVerifiedAt >= BROWSER_DISCONNECTED_POLL_MS)) {
              await browserBridgeRequest({
                action: "health",
                thread: selectedThread ?? originThread ?? undefined,
              });
              browserBridgeVerifiedAt = Date.now();
            }

            const response = await browserBridgeRequest(request);

            if (request.action === "health") browserBridgeVerifiedAt = Date.now();

            return response;
          } catch (cause) {
            browserBridgeVerifiedAt = 0;
            throw cause;
          }
        }

        if (request.action === "activate" || request.action === "runtime") {
          return bridgeRequest(request);
        }

        if (!leaseId) throw new Error("Codex Bridge lease is not active for this plugin.");

        return bridgeRequest({ ...request, leaseId });
      };

      const deactivateBridge = async () => {
        if (!nativeBridgeAvailable) return;
        const activeLease = leaseId;

        if (!activeLease) return;

        const response = await bridgeRequest({
          action: "deactivate",
          leaseId: activeLease,
        });

        if (response.released !== true) {
          throw new Error("Codex Bridge did not confirm lease release.");
        }

        leaseId = null;
      };

      if (nativeBridgeAvailable) {
        const activation = await bridgeRequest({
          action: "activate",
          thread: selectedThread ?? originThread ?? undefined,
        });

        const activatedLease = activation.leaseId?.trim();

        if (!activatedLease) throw new Error("Codex Bridge did not return an activation lease.");
        leaseId = activatedLease;
        bridgeAvailability = "available";
        codexRuntime = bridgeRuntime(activation);

        const activationHealth = bridgeHealth(activation);

        everConnected = true;
        lastBridgeThread = activationHealth.thread;
        loadedThreadIds = activationHealth.threads;
      }

      ctx.lifecycle.onDispose(() => {
        if (!leaseId) return;

        void deactivateBridge().catch((cause) => {
          const message = cause instanceof Error ? cause.message : String(cause);

          console.error(`[Mesurer] Failed to release Codex host lease: ${message}`);
        });
      });

      ctx.hook.on(MANAGED_PLUGIN_BEFORE_DISABLE_HOOK, async (pluginId) => {
        if (pluginId !== MESURER_CODEX_PLUGIN_ID) return;
        await deactivateBridge();
      });

      const fetchRuntime = async () => {
        if (!nativeBridgeAvailable) return null;
        const runtime = bridgeRuntime(await requestBridge({ action: "runtime" }));

        if (!runtime) throw new Error("Codex Bridge returned an invalid runtime state.");
        codexRuntime = runtime;

        return runtime;
      };

      const fetchHealth = async () => {
        const response = await requestBridge({
          action: "health",
          thread: selectedThread ?? originThread ?? undefined,
        });

        codexRuntime = bridgeRuntime(response) ?? codexRuntime;

        return bridgeHealth(response);
      };

      const ensureBridgeAvailable = fetchHealth;

      const fetchDelivery = async (deliveryId: string) =>
        bridgeDelivery(await requestBridge({
          action: "delivery",
          deliveryId,
        }));

      const restoreDelivery = async (delivery: UiDeliveryState) => {
        if (!delivery.id || !delivery.thread) {
          throw new Error("Cannot restore a Codex delivery without its id and thread.");
        }

        const request: CodexBridgeHostRequest = {
          action: "restore",
          deliveryId: delivery.id,
          thread: delivery.thread,
        };

        if (delivery.queuedSubmissionId) request.queuedSubmissionId = delivery.queuedSubmissionId;

        if (delivery.clientUserMessageId) {
          request.clientUserMessageId = delivery.clientUserMessageId;
        } else if (delivery.annotationIds.length > 0) {
          const rebuilt = await feedbackPayload(
            contextService,
            { annotationIds: delivery.annotationIds },
            instruction,
          );

          const exactAnnotationSet = rebuilt.annotationIds.length === delivery.annotationIds.length
            && rebuilt.annotationIds.every((id, index) => id === delivery.annotationIds[index]);

          if (!exactAnnotationSet) {
            throw new Error(
              "Cannot safely restore this Codex delivery because one or more saved Mesurer annotations are unavailable.",
            );
          }

          request.message = rebuilt.message;
        }

        return bridgeDelivery(await requestBridge(request));
      };

      const fetchThreads = async (
        listOptions: MesurerCodexThreadListOptions = {},
      ): Promise<MesurerCodexThreadList> => {
        const request: CodexBridgeHostRequest = {
          action: "threads",
          limit: listOptions.limit ?? RECENT_THREAD_LIMIT,
        };

        const scope = listOptions.thread?.trim();

        if (scope) request.thread = scope;

        return bridgeThreadList(await requestBridge(request));
      };

      const currentTarget = () => selectedThread ?? originThread ?? (routeNeedsSelection ? null : lastBridgeThread);

      const persistUiState = () => {
        if (!withUi) return;

        const persistedDelivery = activeDelivery?.id
          && (activeDelivery.status === "queued"
            || activeDelivery.status === "working"
            || activeDelivery.status === "completed"
            || activeDelivery.status === "interrupted"
            || activeDelivery.status === "failed")
          ? {
              id: activeDelivery.id,
              thread: activeDelivery.thread ?? currentTarget() ?? "",
              status: activeDelivery.status,
              annotationIds: [...activeDelivery.annotationIds],
              queuedSubmissionId: activeDelivery.queuedSubmissionId,
              clientUserMessageId: activeDelivery.clientUserMessageId,
              dispatch: activeDelivery.dispatch,
              dispatchError: activeDelivery.dispatchError,
            }
          : null;

        writeBrowserState({
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

      const deliveryBusy = () => {
        if (!activeDelivery) return false;

        if (activeDelivery.status === "queued"
          && (activeDelivery.dispatch === "desktop-opened"
            || activeDelivery.dispatch === "desktop-wake-failed")) {
          return false;
        }

        return ["queueing", "queued", "working", "completed"].includes(activeDelivery.status);
      };

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

        if (activeDelivery.status === "queued") {
          return activeDelivery.dispatch === "desktop-wake-failed"
            ? "Queued — open Codex"
            : "Queued for Codex";
        }

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

        for (const id of loadedThreadIds) push(recentThreads.find((thread) => thread.id === id) ?? fallback(id));

        return ordered;
      };

      let refreshRuntime = (_allowUnknown = false): Promise<void> => Promise.resolve();

      const connectionLabel = () => {
        if (!nativeBridgeAvailable) return "Connected · Local Codex Bridge";

        if (codexRuntime?.source === "desktop") return "Connected · Codex Desktop";

        if (codexRuntime?.source === "standalone") return "Connected · Codex CLI";

        if (codexRuntime?.source === "shared") return "Connected · Codex shared server";

        return "Connected · Codex";
      };

      const menuItems = (): ToolMenuItemContribution[] => {
        if (bridgeAvailability !== "available") {
          const desktopPrivate = codexRuntime?.source === "desktop"
            && codexRuntime.reason === "desktop-private-transport";

          const browserCompanion = !nativeBridgeAvailable;
          const items: ToolMenuItemContribution[] = [];

          if (bridgeAvailability === "unavailable" && browserCompanion) {
            const diagnostic = lastBridgeError?.includes("does not allow this browser origin")
              ? "Allow this browser origin"
              : lastBridgeError?.includes("out of date")
                || lastBridgeError?.includes("missing required capabilities")
                ? "Update Mesurer Codex Bridge"
                : lastBridgeError?.includes("Another local service")
                  ? "Port 47365 is occupied"
                  : lastBridgeError?.includes("timed out")
                    ? "Mesurer Codex Bridge did not respond"
                    : "Mesurer Codex Bridge is not running";

            items.push({
              id: "codex.connection.status",
              label: diagnostic,
              disabled: () => true,
              run: () => undefined,
            });
          }

          items.push({
            id: "codex.thread.connect",
            label: bridgeAvailability === "unavailable"
              ? browserCompanion
                ? "Retry Codex connection"
                : desktopPrivate
                  ? "Retry Codex Desktop"
                  : "Retry Codex connection"
              : "Choose Codex thread…",
            run: () => refreshRuntime(true),
          });

          return items;
        }

        const threads = menuThreads();
        const visible = threads.slice(0, visibleThreadCount);
        const target = currentTarget();

        const items: ToolMenuItemContribution[] = [{
          id: "codex.connection.status",
          label: connectionLabel(),
          disabled: () => true,
          run: () => undefined,
        }];

        items.push(...visible.map((thread) => {
          const prefix = thread.id === originThread
            ? "Current · "
            : thread.connected
              ? "Loaded · "
              : "";

          const deliverySuffix = activeDelivery?.thread === thread.id
            ? ` · ${deliveryStatusText(activeDelivery.status)}`
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
        }));

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

        if (activeDelivery?.queuedSubmissionId
          && activeDelivery.status === "queued"
          && (activeDelivery.dispatch === "desktop-opened"
            || activeDelivery.dispatch === "desktop-wake-failed")) {
          items.push({
            id: "codex.delivery.receipt",
            label: `Receipt · ${shortThread(activeDelivery.queuedSubmissionId)}`,
            disabled: () => true,
            run: () => undefined,
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

        const desktopPrivate = codexRuntime?.source === "desktop"
          && codexRuntime.reason === "desktop-private-transport";

        const browserCompanion = !nativeBridgeAvailable;

        const browserUnavailableLabel = lastBridgeError?.includes("does not allow this browser origin")
          ? "Authorize Codex origin"
          : lastBridgeError?.includes("out of date")
            || lastBridgeError?.includes("missing required capabilities")
            ? "Update Codex Bridge"
            : lastBridgeError?.includes("Another local service")
              ? "Codex bridge conflict"
              : "Codex bridge not running";

        const label = deliveryToolLabel()
          ?? (bridgeAvailability === "unavailable"
            ? browserCompanion
              ? browserUnavailableLabel
              : desktopPrivate
                ? "Codex Desktop not connected"
                : "Codex unavailable"
            : routeNeedsSelection || (bridgeAvailability === "available" && !target)
              ? "Choose Codex thread"
              : "Queue to Codex");

        const signature = JSON.stringify({
          bridgeAvailability,
          codexRuntime,
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
          command: "codex.queue",
          order: 73,
          toolbarMode: "always",
          icon: deliveryToolIcon(),
          disabled: () => !canSend,
          menu: items.length ? { label: "Codex destination", items } : undefined,
        });
      };

      const refreshRecent = async (scope?: string | null) => {
        if (bridgeAvailability !== "available") return;

        const list = await fetchThreads({
          limit: RECENT_THREAD_LIMIT,
          thread: scope ?? undefined,
        });

        recentThreads = list.threads;
        recentHasMore = list.hasMore;
        loadedThreadIds = list.threads
          .filter((thread) => thread.connected)
          .map((thread) => thread.id);
        lastBridgeThread = list.thread;
      };

      refreshRuntime = (allowUnknown = false) => {
        if (disposed) return Promise.resolve();

        if (bridgeAvailability === "unknown" && !allowUnknown) return Promise.resolve();

        if (refreshPromise) return refreshPromise;

        refreshPromise = (async () => {
          try {
            const health = await ensureBridgeAvailable();
            bridgeAvailability = "available";
            lastBridgeError = null;
            everConnected = true;
            lastBridgeThread = health.thread;
            await refreshRecent(selectedThread ?? originThread ?? health.thread);

            const restoredTarget = selectedThread ?? originThread;

            if (restoredTarget && loadedThreadIds.includes(restoredTarget)) {
              routeNeedsSelection = false;
            } else if (loadedThreadIds.length === 1) {
              bindPageThread(loadedThreadIds[0]!, true);
            } else {
              routeNeedsSelection = true;
            }

            if (!routeNeedsSelection && restoredTarget) persistUiState();
          } catch (cause) {
            bridgeAvailability = "unavailable";
            lastBridgeError = cause instanceof Error ? cause.message : String(cause);
            codexRuntime = await fetchRuntime().catch(() => codexRuntime);
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
          clientUserMessageId: delivery.clientUserMessageId ?? activeDelivery.clientUserMessageId,
          dispatch: delivery.dispatch ?? activeDelivery.dispatch,
          dispatchError: delivery.dispatchError ?? activeDelivery.dispatchError,
        };
        persistUiState();

        if (delivery.status === "queued"
          && (delivery.dispatch === "desktop-opened"
            || delivery.dispatch === "desktop-wake-failed")) {
          syncTool();

          return;
        }

        if (delivery.status === "completed") {
          persistUiState();
          syncTool();

          if (clearCompletedAnnotations && activeDelivery.annotationIds.length > 0) {
            let cleanupFailed = false;

            for (const annotationId of activeDelivery.annotationIds) {
              try {
                await contextService.removeAnnotation(annotationId);
              } catch {
                cleanupFailed = true;
              }
            }

            let remainingAnnotationIds = activeDelivery.annotationIds;

            try {
              const savedIds = new Set(
                (await contextService.annotations()).map((annotation) => annotation.id),
              );

              remainingAnnotationIds = activeDelivery.annotationIds
                .filter((annotationId) => savedIds.has(annotationId));
            } catch {
              cleanupFailed = true;
            }

            if (cleanupFailed || remainingAnnotationIds.length > 0) {
              persistUiState();
              syncTool();
              deliveryPollTimer = globalThis.setTimeout(() => {
                deliveryPollTimer = 0;
                void pollDelivery(delivery.id);
              }, DELIVERY_POLL_MS);

              return;
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

          if ((activeDelivery.status === "queued" || activeDelivery.status === "failed")
            && activeDelivery.thread) {
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

          if (bridgeUnavailable(failure)) bridgeAvailability = "unavailable";
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

          const response = await requestBridge({
            action: "target",
            thread: target,
          });

          const health = bridgeHealth(response);

          codexRuntime = bridgeRuntime(response) ?? codexRuntime;
          bindPageThread(target, !originThread);
          lastBridgeThread = health.thread;
          loadedThreadIds = health.threads;
          bridgeAvailability = "available";
          everConnected = true;
          syncTool();

          return health;
        },
        async queue(request) {
          const feedback = await feedbackPayload(contextService, request, instruction);
          const explicitThread = request?.thread?.trim();
          const thread = explicitThread || (withUi ? currentTarget() : null);

          if (withUi && !explicitThread && (routeNeedsSelection || !thread)) {
            throw new Error("Choose a Codex thread before queueing feedback.");
          }

          const payload: BridgeSendRequest = {
            message: feedback.message,
          };

          if (thread) payload.thread = thread;

          try {
            const response = await requestBridge({
              action: "queue",
              ...payload,
            });

            const sentThread = response.thread?.trim();

            if (!sentThread) throw new Error("Codex Bridge did not report the destination thread.");

            const result: MesurerCodexQueueResult = {
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

            if (response.clientUserMessageId !== undefined) {
              result.clientUserMessageId = response.clientUserMessageId?.trim() || null;
            }

            if (response.dispatch !== undefined) result.dispatch = response.dispatch;

            if (response.dispatchError !== undefined) {
              result.dispatchError = response.dispatchError?.trim() || null;
            }

            return result;
          } catch (cause) {
            if (withUi && bridgeUnavailable(cause)) {
              bridgeAvailability = "unavailable";
              lastBridgeError = cause instanceof Error ? cause.message : String(cause);
              syncTool();
            }

            throw cause;
          }
        },
        send(request) {
          return service.queue(request);
        },
      };

      ctx.service.provide(MESURER_CODEX_SERVICE_ID, service);

      const queueFromUi = async () => {
        if (uiSendPromise || deliveryBusy()) return;

        if (activeDelivery?.status === "failed" && activeDelivery.id) {
          clearDeliveryTimers();
          await pollDelivery(activeDelivery.id);

          return;
        }

        clearDeliveryTimers();
        const target = currentTarget();
        activeDelivery = {
          id: null,
          thread: target,
          status: "queueing",
          annotationIds: [],
          queuedSubmissionId: null,
          clientUserMessageId: null,
          dispatch: null,
          dispatchError: null,
        };
        syncTool();

        uiSendPromise = (async () => {
          try {
            if (withUi && bridgeAvailability !== "available") await refreshRuntime(true);
            const result = await service.queue();
            activeDelivery = {
              id: result.deliveryId,
              thread: result.thread,
              status: result.status,
              annotationIds: result.annotationIds,
              queuedSubmissionId: result.queuedSubmissionId ?? null,
              clientUserMessageId: result.clientUserMessageId ?? null,
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
              // A host that omits delivery ids cannot provide lifecycle completion.
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
      };

      ctx.command.register("codex.queue", queueFromUi);
      ctx.command.register("codex.send", queueFromUi);

      if (withUi) {
        syncTool();

        if (nativeBridgeAvailable) {
          try {
            await refreshRuntime(true);
          } catch (cause) {
            try {
              await deactivateBridge();
            } catch (cleanupCause) {
              const startupMessage = cause instanceof Error ? cause.message : String(cause);

              const cleanupMessage = cleanupCause instanceof Error
                ? cleanupCause.message
                : String(cleanupCause);

              throw new Error(
                `Codex activation failed: ${startupMessage}. Native lease release also failed: ${cleanupMessage}.`,
              );
            }

            throw cause;
          }
        } else {
          // Browser enablement is independent of companion availability. Probe in
          // the background so Settings can commit ON even when Codex is not open yet.
          void refreshRuntime(true).catch(() => undefined);
        }

        if (activeDelivery?.id) {
          everConnected = true;
          deliveryPollTimer = globalThis.setTimeout(() => {
            deliveryPollTimer = 0;

            if (!activeDelivery?.id) return;
            void pollDelivery(activeDelivery.id);
          }, 0);
        }

        const interval = globalThis.setInterval(() => {
          if (nativeBridgeAvailable && !everConnected) return;

          void refreshRuntime(true).catch(() => undefined);
        }, nativeBridgeAvailable ? HEALTH_POLL_MS : BROWSER_DISCONNECTED_POLL_MS);

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
