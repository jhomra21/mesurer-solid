export type MesurerCodexBridgeHostOptions = {
  bridgeUrl?: string;
  origin?: string;
  cwd?: string;
  codex?: string;
};

export type MesurerCodexBridgeHostResult = {
  endpoint: string;
  pid: number;
  reused: boolean;
};

export function ensureMesurerCodexBridge(
  options?: MesurerCodexBridgeHostOptions,
): Promise<MesurerCodexBridgeHostResult>;
