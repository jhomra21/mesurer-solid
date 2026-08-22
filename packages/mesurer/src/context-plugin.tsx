import { render } from "@solidjs/web";
import {
  ContextActions,
  type ContextActionsController,
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

const CONTEXT_UI_STATE_ID = "context.ui";
const COPY_ICON = {
  viewBox: "0 0 24 24",
  paths: ["M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1Zm3 4H8C6.9 5 6 5.9 6 7v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z"],
};
const COPY_SELECTION_ICON = {
  viewBox: "0 0 24 24",
  paths: ["M3 5v4h2V5h4V3H5C3.9 3 3 3.9 3 5Zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4Zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4Zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2ZM8 8h8v8H8V8Z"],
};
const NOTE_ICON = {
  viewBox: "0 0 24 24",
  paths: ["M19 3H5C3.9 3 3 3.9 3 5v14l4-4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-2 8h-4v4h-2v-4H7V9h4V5h2v4h4v2Z"],
};
const SEND_ICON = {
  viewBox: "0 0 24 24",
  paths: ["M2.01 21 23 12 2.01 3 2 10l15 2-15 2 .01 7Z"],
};

type ContextUiState = { hasSelection: boolean };

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
  createWorkspaceRuntime(): MesurerWorkspaceRuntime;
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

      const runtime = solid.createWorkspaceRuntime();
      const service = createService(runtime, solid.ownerDocument, solid.ownerWindow, options);
      ctx.service.provide(MESURER_CONTEXT_SERVICE_ID, service);

      ctx.command.register("context.copy", () => service.copyContext());
      ctx.command.register("context.copy-selection", () => service.copyContext({ scope: "selection" }));
      if (options.sendContext) {
        ctx.command.register("context.send-selection", () => service.sendContext({ scope: "selection" }));
      }

      let uiController: ContextActionsController | null = null;
      let disposeUi: (() => void) | null = null;
      let uiMount: { element: HTMLDivElement; dispose(): void } | null = null;
      let unsubscribeRuntime: (() => void) | null = null;

      if (options.ui !== false) {
        ctx.state.register<ContextUiState>({
          id: CONTEXT_UI_STATE_ID,
          initial: { hasSelection: runtime.currentSelection().elements.length > 0 },
        });
        const hasSelection = () => ctx.state.get<ContextUiState>(CONTEXT_UI_STATE_ID)?.hasSelection === true;
        const syncSelection = () => {
          const next = runtime.currentSelection().elements.length > 0;
          const current = ctx.state.get<ContextUiState>(CONTEXT_UI_STATE_ID)?.hasSelection ?? false;
          if (next !== current) ctx.state.update<ContextUiState>(CONTEXT_UI_STATE_ID, () => ({ hasSelection: next }));
        };
        unsubscribeRuntime = runtime.subscribe(syncSelection);

        ctx.command.register("context.add-note", () => uiController?.openNoteComposer());
        ctx.tool.register({
          id: "context.copy",
          label: "Copy context",
          shortcut: "C",
          command: "context.copy",
          order: 70,
          icon: COPY_ICON,
        });
        ctx.tool.register({
          id: "context.copy-selection",
          label: "Copy selection",
          shortcut: "Shift+C",
          command: "context.copy-selection",
          order: 71,
          icon: COPY_SELECTION_ICON,
          disabled: () => !hasSelection(),
        });
        ctx.tool.register({
          id: "context.add-note",
          label: "Add note",
          shortcut: "N",
          command: "context.add-note",
          order: 72,
          icon: NOTE_ICON,
          disabled: () => !hasSelection(),
        });
        if (options.sendContext) {
          ctx.tool.register({
            id: "context.send-selection",
            label: options.sendLabel ?? "Send to agent",
            shortcut: "Mod+Enter",
            command: "context.send-selection",
            order: 73,
            icon: SEND_ICON,
            disabled: () => !hasSelection(),
          });
        }

        uiMount = solid.createInspectorMount();
        // The plugin root contains both evidence markers and chrome. Capture mode keeps
        // this root mounted while child nodes mark their own evidence/chrome role.
        uiMount.element.dataset.mesurerLayer = "evidence";
        const actionProps = {
          runtime,
          onCopy: service.copyContext,
          onController: (controller: ContextActionsController | null) => { uiController = controller; },
          ...(options.sendContext ? { onSend: service.sendContext } : {}),
          ...(options.sendLabel ? { sendLabel: options.sendLabel } : {}),
        };
        disposeUi = render(() => <ContextActions {...actionProps} />, uiMount.element);
      }

      ctx.lifecycle.onDispose(() => {
        unsubscribeRuntime?.();
        uiController = null;
        disposeUi?.();
        uiMount?.dispose();
        runtime.dispose();
      });
    },
  };
}
