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
 * The legacy core asks currentToolMode() from its scheduled presentation pass
 * and from synchronous input handlers. A very narrow Window proxy marks only
 * requestAnimationFrame callbacks as presentation passes; every other Window
 * member is forwarded with the real Window as its receiver. This keeps direct
 * editing in Select while allowing the same core to restore the original page
 * between editing sessions without duplicating its ownership/restoration logic.
 *
 * Preference/tool checks are O(1). The MutationObserver maintains editor-active
 * state only on editor DOM changes; there is no document query or geometry read
 * on scroll or pointer hot paths.
 */
export const createTextPresentationPolicyRuntime = (
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
): MesurerSolidRuntimeService => {
  const realWindow = runtime.ownerWindow as Window & typeof globalThis;
  let presentationPass = false;
  let editorActive = false;
  let editorObserver: MutationObserver | null = null;

  const policyWindow = new Proxy(realWindow, {
    get(target, property) {
      if (property === "requestAnimationFrame") {
        return (callback: FrameRequestCallback) => target.requestAnimationFrame((time) => {
          presentationPass = true;
          try {
            callback(time);
          } finally {
            presentationPass = false;
          }
        });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Window;

  const currentToolMode = (): ReturnType<NonNullable<MesurerSolidRuntimeService["currentToolMode"]>> => {
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
