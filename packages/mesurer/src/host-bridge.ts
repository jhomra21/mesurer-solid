import type {
  MesurerContextSender,
  MesurerEvidenceProvider,
} from "./context";
import type { MesurerContextPluginOptions } from "./context-plugin";

export const MESURER_HOST_BRIDGE_PROTOCOL = "mesurer.host/v1" as const;

/**
 * Capability-only page-to-host bridge installed by the outer browser harness.
 * Session/thread ids, credentials, and transport clients stay in the host.
 */
export type MesurerHostBridge = {
  protocol: typeof MESURER_HOST_BRIDGE_PROTOCOL;
  captureEvidence?: MesurerEvidenceProvider;
  sendContext?: MesurerContextSender;
};

export const isMesurerHostBridge = (value: unknown): value is MesurerHostBridge => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MesurerHostBridge>;
  return candidate.protocol === MESURER_HOST_BRIDGE_PROTOCOL
    && (candidate.captureEvidence === undefined || typeof candidate.captureEvidence === "function")
    && (candidate.sendContext === undefined || typeof candidate.sendContext === "function");
};

export function connectContextPluginToHost(
  options: MesurerContextPluginOptions,
  bridge: MesurerHostBridge | undefined,
): MesurerContextPluginOptions {
  if (!bridge) return options;
  const connected = { ...options };
  if (!connected.evidenceProvider && bridge.captureEvidence) {
    connected.evidenceProvider = (input) => bridge.captureEvidence!(input);
  }
  if (!connected.sendContext && bridge.sendContext) {
    connected.sendContext = (delivery) => bridge.sendContext!(delivery);
  }
  return connected;
}
