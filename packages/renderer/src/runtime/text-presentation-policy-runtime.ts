import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { presentationPreferences } from "./presentation-preferences";

/**
 * Give the text-edit core two distinct notions that used to be conflated:
 *
 * - interaction mode: Select and Typography may open the direct editor;
 * - saved presentation: Desired text is visible only in Typography, while an
 *   editor is open, or when the user explicitly enables Keep text changes.
 *
 * The core schedules its presentation reconciliation with requestAnimationFrame
 * while synchronous input handlers read the same runtime mode. This adapter
 * marks only those scheduled callbacks as presentation passes. A small, typed
 * Window facade forwards exactly the browser APIs the text core consumes with
 * the real Window as their receiver, avoiding dynamic proxy reflection and DOM
 * brand-check hazards.
 *
 * Preference/tool checks are O(1). The MutationObserver maintains editor-active
 * state only on editor DOM changes; there is no document query or geometry read
 * on scroll or pointer hot paths.
 */
export const createTextPresentationPolicyRuntime = (
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
): MesurerSolidRuntimeService => {
  // SAFETY: runtime.ownerWindow is the browsing-context global paired with
  // runtime.ownerDocument, so its DOM constructors belong to the target realm.
  const realWindow = runtime.ownerWindow as Window & typeof globalThis;
  let presentationPass = false;
  let editorActive = false;
  let editorObserver: MutationObserver | null = null;

  const policyWindowFacade = {
    document: realWindow.document,
    location: realWindow.location,
    crypto: realWindow.crypto,
    navigator: realWindow.navigator,
    performance: realWindow.performance,
    CSS: realWindow.CSS,
    Node: realWindow.Node,
    Text: realWindow.Text,
    Element: realWindow.Element,
    HTMLElement: realWindow.HTMLElement,
    ShadowRoot: realWindow.ShadowRoot,
    MouseEvent: realWindow.MouseEvent,
    MutationObserver: realWindow.MutationObserver,
    get innerWidth() { return realWindow.innerWidth; },
    get innerHeight() { return realWindow.innerHeight; },
    get scrollX() { return realWindow.scrollX; },
    get scrollY() { return realWindow.scrollY; },
    getComputedStyle: (element: Element, pseudoElement?: string | null) =>
      realWindow.getComputedStyle(element, pseudoElement),
    matchMedia: (query: string) => realWindow.matchMedia(query),
    setTimeout: realWindow.setTimeout.bind(realWindow),
    clearTimeout: realWindow.clearTimeout.bind(realWindow),
    cancelAnimationFrame: realWindow.cancelAnimationFrame.bind(realWindow),
    addEventListener: realWindow.addEventListener.bind(realWindow),
    removeEventListener: realWindow.removeEventListener.bind(realWindow),
    requestAnimationFrame: (callback: FrameRequestCallback) => realWindow.requestAnimationFrame((time) => {
      presentationPass = true;
      try {
        callback(time);
      } finally {
        presentationPass = false;
      }
    }),
  };
  // SAFETY: installTextEditing consumes only the explicitly forwarded Window
  // members above; each method is bound to realWindow and each constructor is
  // sourced from the same realm. The facade is never exposed outside that core.
  const policyWindow = policyWindowFacade as unknown as Window;

  const currentToolMode: NonNullable<MesurerSolidRuntimeService["currentToolMode"]> = () => {
    const mode = runtime.currentToolMode?.() ?? "none";
    if (!presentationPass) return mode;

    if (editorActive) {
      return mode === "text-inspector" ? "text-inspector" : "select";
    }
    if (mode === "text-inspector" || presentationPreferences(ctx).keepTextChanges) {
      return "text-inspector";
    }
    return "none";
  };

  const createInspectorMount: MesurerSolidRuntimeService["createInspectorMount"] = () => {
    const mount = runtime.createInspectorMount();
    editorObserver?.disconnect();
    const syncEditorActive = () => {
      editorActive = Boolean(mount.element.querySelector("[data-mesurer-text-editor='true']"));
    };
    editorObserver = new realWindow.MutationObserver(syncEditorActive);
    editorObserver.observe(mount.element, { childList: true, subtree: true });
    syncEditorActive();

    return {
      element: mount.element,
      dispose() {
        editorObserver?.disconnect();
        editorObserver = null;
        editorActive = false;
        mount.dispose();
      },
    };
  };

  ctx.lifecycle.onDispose(() => {
    editorObserver?.disconnect();
    editorObserver = null;
    editorActive = false;
    presentationPass = false;
  });

  return {
    ...runtime,
    ownerWindow: policyWindow,
    currentToolMode,
    createInspectorMount,
  };
};
