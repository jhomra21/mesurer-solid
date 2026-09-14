import { render } from "@solidjs/web";
import { getElementSelector, isElementWithinDomTarget } from "@jhomra21/mesurer-solid-dom";
import {
  ContextActions,
  createDocumentInspectorRuntime,
  type ContextActionsController,
  type MesurerSolidRuntimeService,
  type MesurerWorkspaceRuntime,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin, PluginValue } from "./core";
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
import { MESURER_VERSION } from "./version";

export const MESURER_CONTEXT_PLUGIN_ID = "mesurer.context";
export const MESURER_CONTEXT_SERVICE_ID = "context:v1";
export const MESURER_CONTEXT_SETTINGS_STATE_ID = "mesurer.context.settings";

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
type ContextSettingsState = {
  [key: string]: PluginValue;
  ui: boolean;
};
type ContextTriggerFallback = "current" | "current-and-next";

type LegacyMouseHandoff = {
  selector: string;
  startX: number;
  startY: number;
  selection: ReturnType<MesurerWorkspaceRuntime["currentSelection"]>;
};

export type MesurerContextPluginOptions = {
  /** Initial human-facing Context UI state. The Settings toggle can change it at runtime. Defaults to true. */
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
    version: MESURER_VERSION,
    requires: ["runtime:solid"],
    provides: [MESURER_CONTEXT_SERVICE_ID],
    setup(ctx) {
      const solid = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");
      if (!solid) throw new Error("Mesurer context plugin requires the renderer runtime service.");

      const { runtime: contextRuntime, documentBacked } = createDocumentInspectorRuntime(solid);
      const runtime = contextRuntime.createWorkspaceRuntime();
      const service = createService(runtime, solid.ownerDocument, solid.ownerWindow);
      ctx.service.provide(MESURER_CONTEXT_SERVICE_ID, service);

      ctx.state.register<ContextSettingsState>({
        id: MESURER_CONTEXT_SETTINGS_STATE_ID,
        initial: { ui: options.ui ?? true },
        persist: true,
      });
      ctx.state.register<ContextUiState>({
        id: CONTEXT_UI_STATE_ID,
        initial: { hasSelection: hasContextSelection(runtime) },
      });

      const uiEnabled = () => ctx.state.get<ContextSettingsState>(MESURER_CONTEXT_SETTINGS_STATE_ID)?.ui ?? true;
      const hasSelection = () => ctx.state.get<ContextUiState>(CONTEXT_UI_STATE_ID)?.hasSelection === true;
      const setUiEnabled = (ui: boolean) => {
        ctx.state.update<ContextSettingsState>(MESURER_CONTEXT_SETTINGS_STATE_ID, (current) => ({ ...current, ui }));
      };

      let uiController: ContextActionsController | null = null;
      let disposeUi: (() => void) | null = null;
      let uiMount: { element: HTMLDivElement; dispose(): void } | null = null;
      let nextUiTriggerFallback: ContextTriggerFallback | undefined;
      let resetOpenComposer: ((fallback: ContextTriggerFallback) => void) | null = null;
      let legacyMouseHandoff: LegacyMouseHandoff | null = null;
      const composerIsOpen = () => Boolean(
        uiMount?.element.querySelector("[data-mesurer-annotation-composer='true']"),
      );
      const initialSelection = runtime.currentSelection();
      let previousSelection = {
        elements: [...initialSelection.elements],
        region: initialSelection.region ? { ...initialSelection.region } : null,
      };

      const sameSelection = (
        left: ReturnType<MesurerWorkspaceRuntime["currentSelection"]>,
        right: ReturnType<MesurerWorkspaceRuntime["currentSelection"]>,
      ) => {
        if (left.elements.length !== right.elements.length) return false;
        if (left.elements.some((element, index) => element !== right.elements[index])) return false;
        if (left.region === right.region) return true;
        if (!left.region || !right.region) return false;
        return left.region.left === right.region.left
          && left.region.top === right.region.top
          && left.region.width === right.region.width
          && left.region.height === right.region.height;
      };

      const syncSelection = () => {
        const nextSelection = runtime.currentSelection();
        const selectionChanged = !sameSelection(previousSelection, nextSelection);
        previousSelection = {
          elements: [...nextSelection.elements],
          region: nextSelection.region ? { ...nextSelection.region } : null,
        };

        if (selectionChanged) {
          if (composerIsOpen()) resetOpenComposer?.("current");
          else uiController?.closeNoteComposer();
        }

        const next = nextSelection.elements.length > 0 || nextSelection.region !== null;
        const current = ctx.state.get<ContextUiState>(CONTEXT_UI_STATE_ID)?.hasSelection ?? false;
        if (next !== current) ctx.state.update<ContextUiState>(CONTEXT_UI_STATE_ID, () => ({ hasSelection: next }));
      };
      const unsubscribeRuntime = runtime.subscribe(syncSelection);

      ctx.command.register("context.copy", () => service.copyContext());
      ctx.command.register("context.copy-selection", () => service.copyContext({ scope: "selection" }));

      const destroyUi = () => {
        uiController = null;
        disposeUi?.();
        disposeUi = null;
        uiMount?.dispose();
        uiMount = null;
      };

      const createUi = () => {
        if (uiMount) return;
        uiMount = contextRuntime.createInspectorMount();
        uiMount.element.dataset.mesurerLayer = "evidence";
        if (documentBacked) uiMount.element.dataset.mesurerContextDocumentLayer = "true";
        const initialTriggerFallback = nextUiTriggerFallback;
        nextUiTriggerFallback = undefined;
        const actionProps: Parameters<typeof ContextActions>[0] = {
          runtime,
          onCopy: service.copyContext,
          onController: (controller: ContextActionsController | null) => { uiController = controller; },
          initialTriggerFallback,
        };
        disposeUi = render(() => <ContextActions {...actionProps} />, uiMount.element);
      };

      resetOpenComposer = (fallback) => {
        if (!composerIsOpen()) return;
        // The composer is transient draft UI. Remount only this Context surface
        // so abandoning it never depends on the controller's renderer-settlement
        // timing in an injected or external consumer. Preserve only the one-shot
        // document-coordinate handoff needed to avoid Chromium's stale anchor.
        nextUiTriggerFallback = fallback;
        destroyUi();
        if (uiEnabled()) createUi();
      };

      const syncUi = () => {
        if (uiEnabled()) createUi();
        else destroyUi();
      };
      syncUi();
      ctx.state.subscribe(syncUi);

      // SAFETY: solid.ownerWindow is the browsing-context global paired with solid.ownerDocument.
      const ownerWindow = solid.ownerWindow as Window & typeof globalThis;
      const startsInsideContextUi = (event: Event) => {
        const mount = uiMount?.element;
        if (!mount) return false;
        return event.composedPath().some((node) =>
          node === mount || (node instanceof ownerWindow.Node && mount.contains(node)),
        );
      };
      const dismissComposerBeforeExternalPointer = (event: PointerEvent) => {
        legacyMouseHandoff = null;
        if (!composerIsOpen() || startsInsideContextUi(event)) return;

        // Abandon the transient draft on pointerdown, before Select sees the same
        // physical gesture. The current selection stays cached while pointerdown
        // is in flight and exactly one following selection inherits that fallback.
        resetOpenComposer?.("current-and-next");
      };
      const legacyMousePageTarget = (event: MouseEvent) => {
        const path = event.composedPath();
        const startsInsideMesurerUi = path.some((node) =>
          node instanceof ownerWindow.Element
          && (
            node.getAttribute("data-mesurer-root") === "true"
            || node.getAttribute("data-mesurer-island") === "true"
            || node.getAttribute("data-mesurer-inspector-ui") === "true"
          ),
        );
        if (startsInsideMesurerUi) return null;
        return path.find((node): node is HTMLElement =>
          node instanceof ownerWindow.HTMLElement
          && node.isConnected
          && isElementWithinDomTarget(node, solid.pageTarget),
        ) ?? null;
      };
      const dismissComposerBeforeExternalMouse = (event: MouseEvent) => {
        legacyMouseHandoff = null;
        if (event.button !== 0 || !composerIsOpen() || startsInsideContextUi(event)) return;

        // Browsers with Pointer Events already ran the pointerdown path above, so
        // their compatibility mousedown observes a closed composer and stops here.
        // Some browser/agent hosts emit only legacy MouseEvents at the page node.
        // Remember that concrete page target before the Context remount so mouseup
        // can complete the same one-shot selection handoff without touching the
        // normal PointerEvent path.
        const target = legacyMousePageTarget(event);
        if (target) {
          try {
            legacyMouseHandoff = {
              selector: getElementSelector(target),
              startX: event.clientX,
              startY: event.clientY,
              selection: runtime.currentSelection(),
            };
          } catch {
            legacyMouseHandoff = null;
          }
        }
        resetOpenComposer?.("current-and-next");
      };
      const completeLegacyMouseHandoff = (event: MouseEvent) => {
        const pending = legacyMouseHandoff;
        legacyMouseHandoff = null;
        if (!pending || event.button !== 0) return;
        if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 6) return;
        if (!sameSelection(pending.selection, runtime.currentSelection())) return;
        try {
          runtime.select([pending.selector]);
        } catch {
          // The page may have removed/replaced the target during the gesture.
          // Abandoning the stale draft is still correct; leave selection unchanged.
        }
      };
      ownerWindow.addEventListener("pointerdown", dismissComposerBeforeExternalPointer, true);
      ownerWindow.addEventListener("mousedown", dismissComposerBeforeExternalMouse, true);
      ownerWindow.addEventListener("mouseup", completeLegacyMouseHandoff, true);

      ctx.command.register("context.add-note", () => uiController?.openNoteComposer());
      ctx.tool.register({
        id: "context.copy",
        label: "Copy context",
        shortcut: "C",
        command: "context.copy",
        order: 70,
        icon: COPY_ICON,
        hidden: () => !uiEnabled(),
      });
      ctx.tool.register({
        id: "context.copy-selection",
        label: "Copy selection",
        shortcut: "Shift+C",
        command: "context.copy-selection",
        order: 71,
        icon: COPY_SELECTION_ICON,
        hidden: () => !uiEnabled(),
        disabled: () => !hasSelection(),
      });
      ctx.tool.register({
        id: "context.add-note",
        label: "Add note",
        shortcut: "N",
        command: "context.add-note",
        order: 72,
        icon: NOTE_ICON,
        hidden: () => !uiEnabled(),
        disabled: () => !hasSelection(),
      });
      ctx.settings.register({
        id: "context",
        label: "Context",
        order: 30,
        controls: [{
          type: "toggle",
          id: "ui",
          label: "Context tools",
          description: "Show Copy Context, Copy Selection, Add Note, and annotation controls.",
          value: uiEnabled,
          set: setUiEnabled,
        }],
      });

      ctx.lifecycle.onDispose(() => {
        ownerWindow.removeEventListener("pointerdown", dismissComposerBeforeExternalPointer, true);
        ownerWindow.removeEventListener("mousedown", dismissComposerBeforeExternalMouse, true);
        ownerWindow.removeEventListener("mouseup", completeLegacyMouseHandoff, true);
        unsubscribeRuntime();
        legacyMouseHandoff = null;
        nextUiTriggerFallback = undefined;
        resetOpenComposer = null;
        destroyUi();
        runtime.dispose();
      });
    },
  };
}
