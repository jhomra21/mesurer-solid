export type CodexBridgeAction =
  | "activate"
  | "deactivate"
  | "runtime"
  | "health"
  | "threads"
  | "target"
  | "queue"
  | "delivery"
  | "restore";

export type CodexBridgeRequest = {
  action: CodexBridgeAction;
  leaseId?: string;
  thread?: string;
  limit?: number;
  message?: string;
  deliveryId?: string;
  queuedSubmissionId?: string;
  clientUserMessageId?: string;
};

export type CodexBridgeOptions = {
  /** Explicit Codex executable. Shared mode may use it to start the daemon; inherited Desktop mode may use it only for durable queue submission. */
  codex?: string;
  /** Codex state directory. Defaults to CODEX_HOME, then ~/.codex. */
  codexHome?: string;
  /** Native host client identity. Electron hosts should derive this from the invoking WebContents. */
  clientId?: string;
};

export type CodexBridgeRuntime = {
  source: "shared" | "standalone" | "desktop" | "none";
  transport: "shared-app-server" | "desktop-queue" | "private-stdio" | "none";
  available: boolean;
  reason: "desktop-private-transport" | "runtime-not-found" | null;
};

export type CodexBridgeThread = {
  id: string;
  title: string;
  updatedAt: number | null;
  connected: true;
};

export type CodexBridgeResponse = {
  ok: true;
  leaseId?: string;
  released?: boolean;
  runtime?: CodexBridgeRuntime;
  thread?: string | null;
  threads?: string[];
  threadDetails?: CodexBridgeThread[];
  hasMore?: boolean;
  output?: string;
  delivery?: "queued";
  deliveryId?: string;
  status?: "queued" | "working" | "completed" | "interrupted";
  turnId?: string | null;
  queuedSubmissionId?: string | null;
  clientUserMessageId?: string | null;
  dispatch?: "persisted" | "desktop-opened" | "desktop-wake-failed" | null;
  dispatchError?: string | null;
  createdAt?: number;
  updatedAt?: number;
  restored?: boolean;
};

export function codexBridge(
  request: CodexBridgeRequest,
  options?: CodexBridgeOptions,
): Promise<CodexBridgeResponse>;

export type MesurerCodexHostEvent = {
  sender: {
    id: number;
    on?(event: "did-navigate" | "render-process-gone" | "destroyed", listener: () => void): void;
    removeListener?(event: "did-navigate" | "render-process-gone" | "destroyed", listener: () => void): void;
  };
  senderFrame?: { parent?: object | null } | null;
};

export type MesurerCodexHostOptions = Omit<CodexBridgeOptions, "clientId"> & {
  ipcMain: {
    handle(channel: string, listener: (event: MesurerCodexHostEvent, request: CodexBridgeRequest) => CodexBridgeResponse | Promise<CodexBridgeResponse>): void;
    removeHandler(channel: string): void;
  };
  channel?: string;
  validateSender(event: MesurerCodexHostEvent): boolean | Promise<boolean>;
};

export type MesurerCodexHost = {
  channel: string;
  dispose(): void;
};

export const MESURER_CODEX_BRIDGE_CHANNEL: "mesurer:codex-bridge";

export function installMesurerCodexHost(options: MesurerCodexHostOptions): MesurerCodexHost;
