export type CodexBridgeAction =
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
  codex?: string;
  codexHome?: string;
};

export type CodexBridgeThread = {
  id: string;
  title: string;
  updatedAt: number | null;
  connected: true;
};

export type CodexBridgeResponse = {
  ok: true;
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
