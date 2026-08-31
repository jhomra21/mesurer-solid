import type { MesurerPlugin } from "./core";
import {
  MESURER_CONTEXT_FEEDBACK_SERVICE_ID,
  MESURER_CONTEXT_SERVICE_ID,
} from "./context-services";
import type { MesurerContextService } from "./context-plugin";
import type {
  MesurerAnnotation,
  MesurerContextV1,
  MesurerContextRequest,
  MesurerFeedbackBus,
  MesurerFeedbackWaitResult,
  MesurerReviewV1,
} from "./context";

export const MESURER_WEBMCP_PLUGIN_ID = "mesurer.webmcp";
export const MESURER_WEBMCP_SERVICE_ID = "webmcp:v1";

type WebMcpInputValue = string | number | boolean | null;
type WebMcpInput = { [key: string]: WebMcpInputValue };
type WebMcpPropertySchema = {
  type: "string" | "integer";
  enum?: readonly string[];
  minimum?: number;
  maximum?: number;
};
type WebMcpObjectSchema = {
  type: "object";
  properties: { [key: string]: WebMcpPropertySchema };
  additionalProperties: false;
  required?: readonly string[];
};
type WebMcpToolResult =
  | MesurerFeedbackWaitResult
  | MesurerContextV1
  | MesurerAnnotation[]
  | MesurerReviewV1
  | MesurerReviewV1[]
  | { status: "prepared" }
  | { status: "restored" };

type WebMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: WebMcpObjectSchema;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: WebMcpInput, options: { signal: AbortSignal }) => Promise<WebMcpToolResult>;
};

type WebMcpModelContext = {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
};

type ContextToolInput = {
  scope?: "workspace" | "selection";
  annotationId?: string;
};

const objectSchema = (properties: { [key: string]: WebMcpPropertySchema }, required: readonly string[] = []): WebMcpObjectSchema => {
  const schema: WebMcpObjectSchema = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) schema.required = required;
  return schema;
};

const isString = (value: WebMcpInputValue): value is string => typeof value === "string";
const isNumber = (value: WebMcpInputValue): value is number => typeof value === "number";

const modelContextFor = (ownerDocument: Document) => {
  // SAFETY: the browser WebMCP draft adds modelContext to Document; the assertion is only used to feature-detect that optional property.
  return (ownerDocument as Document & { modelContext?: WebMcpModelContext }).modelContext;
};

export const isWebMcpAvailable = (ownerDocument: Document) => Boolean(modelContextFor(ownerDocument));

const contextRequest = (input: ContextToolInput = {}): MesurerContextRequest => {
  if (input.annotationId) return { annotation: input.annotationId };
  return input.scope === "selection" ? { scope: "selection" } : { scope: "workspace" };
};

export type MesurerWebMcpPluginOptions = {
  /** Supply the same bus passed to contextPlugin() when source-mounting. */
  feedbackBus?: MesurerFeedbackBus;
};

export type MesurerWebMcpService = {
  available: boolean;
  toolNames: readonly string[];
};

export function webMcpPlugin(options: MesurerWebMcpPluginOptions = {}): MesurerPlugin {
  return {
    id: MESURER_WEBMCP_PLUGIN_ID,
    version: "0.1.0",
    requires: [MESURER_CONTEXT_SERVICE_ID, MESURER_CONTEXT_FEEDBACK_SERVICE_ID],
    provides: [MESURER_WEBMCP_SERVICE_ID],
    async setup(ctx) {
      const context = ctx.service.get<MesurerContextService>(MESURER_CONTEXT_SERVICE_ID);
      const feedbackBus = options.feedbackBus ?? ctx.service.get<MesurerFeedbackBus>(MESURER_CONTEXT_FEEDBACK_SERVICE_ID);
      if (!context || !feedbackBus) throw new Error("Mesurer WebMCP requires the context plugin.");

      const modelContext = modelContextFor(document);
      const toolNames = [
        "mesurer.feedback.wait",
        "mesurer.context.get",
        "mesurer.annotations.list",
        "mesurer.review",
        "mesurer.capture.prepare",
        "mesurer.capture.finish",
      ] as const;
      ctx.service.provide(MESURER_WEBMCP_SERVICE_ID, {
        available: Boolean(modelContext),
        toolNames,
      } satisfies MesurerWebMcpService);
      if (!modelContext) return;

      const registrationController = new AbortController();
      const untrustedReadOnly = { readOnlyHint: true, untrustedContentHint: true };
      const tools: WebMcpTool[] = [
        {
          name: "mesurer.feedback.wait",
          title: "Wait for Mesurer feedback",
          description: "Wait for the next human visual feedback event submitted through Mesurer. The call may remain pending until the human sends feedback.",
          inputSchema: objectSchema({
            afterId: { type: "string" },
            afterSequence: { type: "integer", minimum: 0 },
            timeoutMs: { type: "integer", minimum: 1, maximum: 300000 },
          }),
          annotations: untrustedReadOnly,
          execute: async (input, { signal }) => feedbackBus.wait({
            afterId: isString(input.afterId) ? input.afterId : undefined,
            afterSequence: isNumber(input.afterSequence) ? input.afterSequence : undefined,
            timeoutMs: isNumber(input.timeoutMs) ? input.timeoutMs : undefined,
          }, signal),
        },
        {
          name: "mesurer.context.get",
          title: "Get Mesurer context",
          description: "Read structured Mesurer measurements and visual context for the workspace, current selection, or annotation.",
          inputSchema: objectSchema({
            scope: { type: "string", enum: ["workspace", "selection"] },
            annotationId: { type: "string" },
          }),
          annotations: untrustedReadOnly,
          execute: async (input) => context.context(contextRequest({
            scope: input.scope === "selection" ? "selection" : "workspace",
            annotationId: isString(input.annotationId) ? input.annotationId : undefined,
          })),
        },
        {
          name: "mesurer.annotations.list",
          title: "List Mesurer annotations",
          description: "Read the human annotations currently stored by Mesurer, including their notes and scoped targets.",
          inputSchema: objectSchema({}),
          annotations: untrustedReadOnly,
          execute: async () => context.annotations(),
        },
        {
          name: "mesurer.review",
          title: "Review Mesurer annotation",
          description: "Compare a Mesurer annotation baseline with the current rendered page and report geometry or evidence changes.",
          inputSchema: objectSchema({ annotationId: { type: "string" } }, ["annotationId"]),
          annotations: untrustedReadOnly,
          execute: async (input) => {
            if (!isString(input.annotationId) || !input.annotationId) throw new Error("annotationId is required.");
            return context.review(input.annotationId);
          },
        },
        {
          name: "mesurer.capture.prepare",
          title: "Prepare Mesurer capture",
          description: "Hide Mesurer chrome while preserving visual evidence so the outer browser harness can capture a clean screenshot.",
          inputSchema: objectSchema({}),
          execute: async () => {
            await context.prepareCapture();
            return { status: "prepared" };
          },
        },
        {
          name: "mesurer.capture.finish",
          title: "Finish Mesurer capture",
          description: "Restore Mesurer chrome after the outer browser harness finishes capturing visual evidence.",
          inputSchema: objectSchema({}),
          execute: async () => {
            await context.finishCapture();
            return { status: "restored" };
          },
        },
      ];

      try {
        for (const tool of tools) {
          await modelContext.registerTool(tool, { signal: registrationController.signal });
        }
      } catch (error) {
        registrationController.abort(error);
        throw error;
      }
      ctx.lifecycle.onDispose(() => registrationController.abort());
    },
  };
}
