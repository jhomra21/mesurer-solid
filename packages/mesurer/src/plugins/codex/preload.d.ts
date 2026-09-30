import type {
  CodexBridgeRequest,
  CodexBridgeResponse,
} from "./bridge";

export type MesurerCodexPreloadOptions = {
  channel?: string;
};

export type MesurerCodexIpcRenderer = {
  invoke(
    channel: string,
    request: CodexBridgeRequest,
  ): Promise<CodexBridgeResponse>;
};

export const MESURER_CODEX_BRIDGE_CHANNEL: "mesurer:codex-bridge";

export function createMesurerCodexPreloadBridge(
  ipcRenderer: MesurerCodexIpcRenderer,
  options?: MesurerCodexPreloadOptions,
): (request: CodexBridgeRequest) => Promise<CodexBridgeResponse>;
