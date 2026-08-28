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
  type MesurerContextV1,
  type MesurerReviewV1,
} from "./context";

export const MESURER_CONTEXT_PLUGIN_ID = "mesurer.context";
export const MESURER_CONTEXT_SERVICE_ID = "context:v1";

const CONTEXT_UI_STATE_ID = "context.ui";
const COPY_ICON = {
  viewBox: "0 0 256 256",
  paths: ["M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"],
};
const COPY_SELECTION_ICON = {
  viewBox: "0 0 256 256",
  paths: ["M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z"],
};
const NOTE_ICON = {
  viewBox: "0 0 256 256",
  paths: ["M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z"],
};

type ContextUiState = { hasSelection: boolean };

export type MesurerContextPluginOptions = {
  /** Render Copy Context, Copy Selection, Add Note, and annotation UI. Defaults to true. */
  ui?: boolean;
};

export type MesurerContextService = {
  context(request?: MesurerContextRequest): Promise<MesurerContextV1>;
  contextText(request?: MesurerContextRequest): Promise<string>;
  copyContext(request?: MesurerContextRequest): Promise<void>;
  select(selectors: string | string[]): Promise<MesurerContextV1>;
  annotations(): Promise<MesurerAnnotation[]>;
  review(annotationId?: string): Promise<MesurerReviewV1 | MesurerReviewV1[]>;
  capturePlan(request?: MesurerContextRequest): Promise<MesurerCapturePlanV1>;
  prepareCapture(): Promise<void>;
  finishCapture(): Promise<void>;
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
): MesurerContextService => {
  const context = async (request?: MesurerContextRequest) =>
    captureMesurerContext({ runtime, ownerDocument, ownerWindow, request });
  const contextText = async (request?: MesurerContextRequest) =>
    formatMesurerContext(await context(request));
  const copyContext = async (request?: MesurerContextRequest) =>
    copyTextToClipboard(ownerDocument, ownerWindow, await contextText(request));
  const select = async (selectors: string | string[]) => {
    runtime.select(Array.isArray(selectors) ? selectors : [selectors]);
    await stable(ownerDocument, ownerWindow);
    return context({ scope: "selection" });
  };
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

  return {
    context,
    contextText,
    copyContext,
    select,
    annotations,
    review,
    capturePlan,
    prepareCapture,
    finishCapture,
  };
};

const hasContextSelection = (runtime: MesurerWorkspaceRuntime) => {
  const selection = runtime.currentSelection();
  return selection.elements.length > 0 || selection.region !== null;
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
      const service = createService(runtime, solid.ownerDocument, solid.ownerWindow);
      ctx.service.provide(MESURER_CONTEXT_SERVICE_ID, service);

      ctx.command.register("context.copy", () => service.copyContext());
      ctx.command.register("context.copy-selection", () => service.copyContext({ scope: "selection" }));

      let uiController: ContextActionsController | null = null;
      let disposeUi: (() => void) | null = null;
      let uiMount: { element: HTMLDivElement; dispose(): void } | null = null;
      let unsubscribeRuntime: (() => void) | null = null;

      if (options.ui !== false) {
        ctx.state.register<ContextUiState>({
          id: CONTEXT_UI_STATE_ID,
          initial: { hasSelection: hasContextSelection(runtime) },
        });
        const hasSelection = () => ctx.state.get<ContextUiState>(CONTEXT_UI_STATE_ID)?.hasSelection === true;
        const syncSelection = () => {
          const next = hasContextSelection(runtime);
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

        uiMount = solid.createInspectorMount();
        uiMount.element.dataset.mesurerLayer = "evidence";
        const actionProps: Parameters<typeof ContextActions>[0] = {
          runtime,
          onCopy: service.copyContext,
          onController: (controller: ContextActionsController | null) => { uiController = controller; },
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