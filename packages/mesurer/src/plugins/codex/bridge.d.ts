export type CodexBridgeAction =
  | "runtime"
  | "health"
  | "threads"
  | "target"
  | "queue"
  | "delivery"
  | "restore";

export type CodexBridgeRequest = {
  action: CodexBridgeAction;
  thread?: string;
  limit?: number;
  message?: string;
  deliveryId?: string;
  queuedSubmissionId?: string;
};

export type CodexBridgeOptions = {
  /** Explicit Codex executable used only to start the shared app-server when no control socket exists. */
  codex?: string;
  /** Codex state directory. Defaults to CODEX_HOME, then ~/.codex. */
  codexHome?: string;
};

export type CodexBridgeRuntime = {
  source: "shared" | "standalone" | "desktop" | "none";
  transport: "shared-app-server" | "private-stdio" | "none";
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
  dispatch?: string | null;
  dispatchError?: string | null;
  createdAt?: number;
  updatedAt?: number;
  restored?: boolean;
};

export function codexBridge(
  request: CodexBridgeRequest,
  options?: CodexBridgeOptions,
): Promise<CodexBridgeResponse>;
