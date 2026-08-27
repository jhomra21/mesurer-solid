import type { MesurerContextDelivery, MesurerContextSender } from "./context";
import type { MesurerContextPluginOptions } from "./context-plugin";

export const MESURER_MCP_DEFAULT_FEEDBACK_URL = "http://127.0.0.1:43191/feedback";

export type MesurerMcpFeedbackConfig = {
  /** Loopback feedback ingress exposed by the local Mesurer MCP process. */
  feedbackUrl?: string;
};

type MesurerMcpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type MesurerMcpFeedbackSenderOptions = MesurerMcpFeedbackConfig & {
  /** Test seam. Browser integrations normally use global fetch. */
  fetchImpl?: MesurerMcpFetch;
};

export function createMcpFeedbackSender(
  options: MesurerMcpFeedbackSenderOptions = {},
): MesurerContextSender {
  const feedbackUrl = options.feedbackUrl ?? MESURER_MCP_DEFAULT_FEEDBACK_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return async (delivery: MesurerContextDelivery) => {
    const response = await fetchImpl(feedbackUrl, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(delivery),
    });

    if (response.ok) return;
    const detail = (await response.text()).trim();
    throw new Error(
      detail
        ? `Mesurer MCP feedback delivery failed (${response.status}): ${detail}`
        : `Mesurer MCP feedback delivery failed (${response.status}).`,
    );
  };
}

export function connectContextPluginToMcp(
  options: MesurerContextPluginOptions,
  config: boolean | MesurerMcpFeedbackConfig = false,
): MesurerContextPluginOptions {
  if (options.sendContext || config === false) return options;
  const senderOptions = config === true ? {} : config;
  return {
    ...options,
    sendContext: createMcpFeedbackSender(senderOptions),
    sendLabel: options.sendLabel ?? "Send to agent",
  };
}
