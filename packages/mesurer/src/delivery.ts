import type {
  MesurerAcpContentBlock,
  MesurerContextDelivery,
  MesurerContextSender,
  MesurerEvidenceImage,
} from "./context";
import { toAcpContentBlocks } from "./context";

type MaybePromise<T> = T | Promise<T>;

export type MesurerAcpTarget = {
  sessionId: string;
};

export type MesurerAcpPromptRequest = {
  sessionId: string;
  prompt: MesurerAcpContentBlock[];
};

export type MesurerAcpContextSenderOptions = {
  /** Resolve this from the host that owns the live ACP session. Never expose it to the inspected page. */
  target(): MaybePromise<MesurerAcpTarget>;
  /** Send one ACP session/prompt request through the host-owned ACP client. */
  prompt(request: MesurerAcpPromptRequest): Promise<void>;
};

export function createAcpContextSender(
  options: MesurerAcpContextSenderOptions,
): MesurerContextSender {
  return async (delivery) => {
    const target = await options.target();
    if (!target.sessionId) throw new Error("Mesurer ACP target has no session id.");
    await options.prompt({
      sessionId: target.sessionId,
      prompt: toAcpContentBlocks(delivery.context, delivery.images),
    });
  };
}

export type CodexAppServerTextInput = {
  type: "text";
  text: string;
};

export type CodexAppServerImageInput =
  | { type: "image"; url: string }
  | { type: "localImage"; path: string };

export type CodexAppServerInput = CodexAppServerTextInput | CodexAppServerImageInput;

export type CodexAppServerTarget = {
  /** The thread owned by the outer Codex client. */
  threadId: string;
  /** Set only while the host has an active in-flight turn that should be steered. */
  activeTurnId?: string | null;
};

export type CodexAppServerTurnStartRequest = {
  method: "turn/start";
  params: {
    threadId: string;
    input: CodexAppServerInput[];
  };
};

export type CodexAppServerTurnSteerRequest = {
  method: "turn/steer";
  params: {
    threadId: string;
    input: CodexAppServerInput[];
    expectedTurnId: string;
  };
};

export type CodexAppServerSendRequest =
  | CodexAppServerTurnStartRequest
  | CodexAppServerTurnSteerRequest;

export type MesurerCodexAppServerContextSenderOptions = {
  /** Resolve this from the host that owns the current Codex thread/turn. */
  target(): MaybePromise<CodexAppServerTarget>;
  /** Forward the generated turn/start or turn/steer request through the host-owned app-server client. */
  request(request: CodexAppServerSendRequest): Promise<void>;
  /**
   * Codex app-server accepts image URLs or local image paths rather than ACP base64 blocks.
   * The host owns materialization and lifetime of any temporary image files/URLs.
   * Returning null deliberately falls back to text-only delivery for that image.
   */
  imageInput?: (image: MesurerEvidenceImage) => MaybePromise<CodexAppServerImageInput | null>;
};

export async function toCodexAppServerInput(
  delivery: MesurerContextDelivery,
  imageInput?: MesurerCodexAppServerContextSenderOptions["imageInput"],
): Promise<CodexAppServerInput[]> {
  const input: CodexAppServerInput[] = [{ type: "text", text: delivery.text }];
  if (!imageInput) return input;

  for (const image of delivery.images) {
    const converted = await imageInput(image);
    if (!converted) continue;
    input.push({
      type: "text",
      text: `Mesurer visual evidence: ${image.kind} (${image.id})`,
    });
    input.push(converted);
  }
  return input;
}

export function createCodexAppServerContextSender(
  options: MesurerCodexAppServerContextSenderOptions,
): MesurerContextSender {
  return async (delivery) => {
    const [target, input] = await Promise.all([
      options.target(),
      toCodexAppServerInput(delivery, options.imageInput),
    ]);
    if (!target.threadId) throw new Error("Mesurer Codex target has no thread id.");

    if (target.activeTurnId) {
      await options.request({
        method: "turn/steer",
        params: {
          threadId: target.threadId,
          input,
          expectedTurnId: target.activeTurnId,
        },
      });
      return;
    }

    await options.request({
      method: "turn/start",
      params: {
        threadId: target.threadId,
        input,
      },
    });
  };
}
