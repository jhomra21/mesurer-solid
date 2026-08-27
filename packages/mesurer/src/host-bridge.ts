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

export const getMesurerHostBridge = (
  value: MesurerHostBridge | undefined,
): MesurerHostBridge | undefined =>
  value?.protocol === MESURER_HOST_BRIDGE_PROTOCOL ? value : undefined;

export function connectContextPluginToHost(
  options: MesurerContextPluginOptions,
  bridge: MesurerHostBridge | undefined,
): MesurerContextPluginOptions {
  if (!bridge) return options;
  const connected = { ...options };
  const captureEvidence = bridge.captureEvidence;
  const sendContext = bridge.sendContext;
  if (!connected.evidenceProvider && captureEvidence) {
    connected.evidenceProvider = captureEvidence;
  }
  if (!connected.sendContext && sendContext) {
    connected.sendContext = sendContext;
  }
  return connected;
}
