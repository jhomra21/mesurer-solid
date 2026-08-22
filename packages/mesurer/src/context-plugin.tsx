import { render } from "@solidjs/web";
import {
  ContextActions,
  createMesurerWorkspaceRuntime,
  type MesurerWorkspaceRuntime,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";
import {
  captureMesurerContext,
  copyTextToClipboard,
  createMesurerCapturePlan,
  formatMesurerContext,
  reviewMesurerAnnotation,
  type MesurerAnnotation,
  type MesurerCapturePlanV1,
  type MesurerContextRequest,
  type MesurerContextSender,
  type MesurerContextV1,
  type MesurerEvidenceProvider,
  type MesurerReviewV1,
} from "./context";

export const MESURER_CONTEXT_PLUGIN_ID = "mesurer.context";
export const MESURER_CONTEXT_SERVICE_ID = "context:v1";

export type MesurerContextPluginOptions = {
  /** Render Copy Context, Copy Selection, Add Note, annotation markers, and optional Send controls. Defaults to true. */
  ui?: boolean;
  /** Optional screenshot provider owned by the browser/harness. */
  evidenceProvider?: MesurerEvidenceProvider;
  /** Optional direct handoff callback, normally backed by an ACP client outside Mesurer. */
  sendContext?: MesurerContextSender;
  sendLabel?: string;
};

export type MesurerContextService = {
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  copyContext(request?: MesurerContextRequest): Promise<void>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
  sendContext(request?: MesurerContextRequest): Promise<void>;
  readonly screenshots: boolean;
  readonly send: boolean;
};

type SolidRuntimeService = {
  ownerDocument: Document;
  ownerWindow: Window;
  portalTarget: HTMLElement | ShadowRoot;
  createInspectorMount(): { element: HTMLDivElement; dispose(): void };
};

const stable = async (ownerDocument: Document, ownerWindow: Window, frames = 1) => {
  await ownerDocument.fonts?.ready;
  for (let index = 0; index < Math.max(1, frames); index += 1) {
    await new Promise<void>((resolve) => ownerWindow.requestAnimationFrame(() => resolve()));
  }
};

const createService = (
  runtime: MesurerWorkspaceRuntime,
  ownerDocument: Document,
  ownerWindow: Window,
  options: MesurerContextPluginOptions,
): MesurerContextService => {
  const context = async (request?: MesurerContextRequest) =>
    captureMesurerContext({ runtime, ownerDocument, ownerWindow, request });
  const contextText = async (request?: MesurerContextRequest) =>
    formatMesurerContext(await context(request));
  const copyContext = async (request?: MesurerContextRequest) =>
    copyTextToClipboard(ownerDocument, ownerWindow, await contextText(request));
  const annotations = async () => runtime.annotations();
  const review = async (annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]> => {
    await stable(ownerDocument, ownerWindow);
    if (annotationId) {
      return reviewMesurerAnnotation({ runtime, ownerDocument, ownerWindow, annotationId });
    }
    return runtime.annotations().map((annotation) =>
      reviewMesurerAnnotation({ runtime, ownerDocument, ownerWindow, annotationId: annotation.id }));
  };
  const capturePlan = async (request?: MesurerContextRequest) =>
    createMesurerCapturePlan(await context(request));
  const prepareCapture = async () => {
    runtime.prepareCapture();
    await stable(ownerDocument, ownerWindow);
  };
  const finishCapture = async () => {
    runtime.finishCapture();
    await stable(ownerDocument, ownerWindow);
  };
  const sendContext = async (request?: MesurerContextRequest) => {
    if (!options.sendContext) throw new Error("No Mesurer context sender is configured.");
    const value = await context(request);
    const text = formatMesurerContext(value);
    const plan = createMesurerCapturePlan(value);
    let images: Awaited<ReturnType<MesurerEvidenceProvider>> = [];
    if (options.evidenceProvider) {
      runtime.prepareCapture();
      try {
        await stable(ownerDocument, ownerWindow);
        images = await options.evidenceProvider({ context: value, plan });
      } finally {
        runtime.finishCapture();
        await stable(ownerDocument, ownerWindow);
      }
    }
    await options.sendContext({ context: value, text, images });
  };

  return {
    context,
    contextText,
    copyContext,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
    sendContext,
    screenshots: Boolean(options.evidenceProvider),
    send: Boolean(options.sendContext),
  };
};

export function contextPlugin(options: MesurerContextPluginOptions = {}): MesurerPlugin {
  return {
    id: MESURER_CONTEXT_PLUGIN_ID,
    version: "0.1.0",
    requires: ["runtime:solid"],
    provides: [MESURER_CONTEXT_SERVICE_ID],
    setup(ctx) {
      const solid = ctx.service.get<SolidRuntimeService>("runtime:solid");
      if (!solid) throw new Error("Mesurer context plugin requires the renderer runtime service.");

      const runtime = createMesurerWorkspaceRuntime({
        ownerDocument: solid.ownerDocument,
        ownerWindow: solid.ownerWindow,
        uiRoot: solid.portalTarget,
      });
      const service = createService(runtime, solid.ownerDocument, solid.ownerWindow, options);
      ctx.service.provide(MESURER_CONTEXT_SERVICE_ID, service);

      ctx.command.register("context.copy", () => service.copyContext());
      ctx.command.register("context.copy-selection", () => service.copyContext({ scope: "selection" }));
      if (options.sendContext) {
        ctx.command.register("context.send-selection", () => service.sendContext({ scope: "selection" }));
      }

      let disposeUi: (() => void) | null = null;
      let uiMount: { element: HTMLDivElement; dispose(): void } | null = null;
      if (options.ui !== false) {
        uiMount = solid.createInspectorMount();
        // The plugin root contains both evidence markers and chrome. Capture mode keeps
        // this root mounted while child nodes mark their own evidence/chrome role.
        uiMount.element.dataset.mesurerLayer = "evidence";
        const actionProps = {
          runtime,
          onCopy: service.copyContext,
          ...(options.sendContext ? { onSend: service.sendContext } : {}),
          ...(options.sendLabel ? { sendLabel: options.sendLabel } : {}),
        };
        disposeUi = render(() => <ContextActions {...actionProps} />, uiMount.element);
      }

      ctx.lifecycle.onDispose(() => {
        disposeUi?.();
        uiMount?.dispose();
        runtime.dispose();
      });
    },
  };
}
