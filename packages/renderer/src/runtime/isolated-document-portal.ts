import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { ensureMesurerStyles } from "./style-inject";
import { MESURER_STYLES } from "../styles.generated";

type RootPlacement = {
  root: HTMLElement;
  marker: Comment | null;
  parent: Node | null;
};

type DocumentRuntime = {
  runtime: MesurerSolidRuntimeService;
  isolated: boolean;
};

const isDocumentBackedShadow = (
  runtime: MesurerSolidRuntimeService,
  realm: Window & typeof globalThis,
) => runtime.portalTarget instanceof realm.ShadowRoot
  && !(runtime.pageTarget instanceof realm.ShadowRoot)
  && runtime.pageTarget.getRootNode() === runtime.ownerDocument;

/**
 * Direct text editing is transient UI, but its geometry needs to participate in
 * the same document positioning tree as the page it follows. In an isolated
 * public mount, keep the main toolbar inside its ShadowRoot while giving the
 * text-edit runtime a document-backed inspector mount. The existing native
 * anchor coordinator can then own ring/highlight/Typography movement without a
 * fixed ShadowRoot surface chasing compositor scroll from JavaScript.
 */
export function createDocumentTextRuntime(
  runtime: MesurerSolidRuntimeService,
): DocumentRuntime {
  const { ownerDocument, ownerWindow } = runtime;
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedShadow(runtime, realm)) {
    return { runtime, isolated: false };
  }

  // The public isolated mount normally keeps renderer CSS inside its ShadowRoot.
  // Text-edit surfaces moved into the document use the same generated, namespaced
  // stylesheet so their appearance remains identical to the isolated toolbar.
  ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);

  const createInspectorMount = () => {
    const element = ownerDocument.createElement("div");
    element.dataset.mesurerInspectorUi = "true";
    element.dataset.mesurerIsolatedDocumentRuntime = "true";
    ownerDocument.body.append(element);
    let disposed = false;
    return {
      element,
      dispose() {
        if (disposed) return;
        disposed = true;
        element.remove();
      },
    };
  };

  return {
    isolated: true,
    runtime: {
      ...runtime,
      portalTarget: ownerDocument.body,
      createInspectorMount,
    },
  };
}

/**
 * Selected MeasurementBox roots are Solid-owned by the isolated renderer. Move
 * each complete root, never its children, into the document layer while it is
 * selected. This preserves Solid ownership/reconciliation and lets the normal
 * document scroll-anchor coordinator claim the chrome and label as a unit.
 */
export function installIsolatedSelectionPortal(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  const realm = ownerWindow as Window & typeof globalThis;
  if (!ownerDocument.body || !isDocumentBackedShadow(runtime, realm)) return;

  ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);
  const workspace = runtime.createWorkspaceRuntime();
  const placements = new Map<HTMLElement, RootPlacement>();
  let disposed = false;
  let queued = false;

  const moveRoot = (root: HTMLElement) => {
    if (placements.has(root) || root.dataset.mesurerSelectionGroup === "true") return;
    const parent = root.parentNode;
    const marker = parent ? ownerDocument.createComment("mesurer-isolated-selection-portal") : null;
    if (marker && parent) parent.insertBefore(marker, root);
    placements.set(root, { root, marker, parent });
    root.dataset.mesurerIsolatedDocumentLayer = "true";
    ownerDocument.body.append(root);
  };

  const releaseRoot = (placement: RootPlacement, restore: boolean) => {
    const { root, marker, parent } = placement;
    delete root.dataset.mesurerIsolatedDocumentLayer;
    if (restore && root.isConnected && marker?.parentNode === parent && parent) {
      parent.insertBefore(root, marker);
    }
    marker?.remove();
    placements.delete(root);
  };

  const stabilize = () => {
    if (disposed) return;
    for (const root of portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-selected-measurement='true']")) {
      moveRoot(root);
    }

    const selectedElements = new Set(workspace.currentSelection().elements);
    for (const placement of Array.from(placements.values())) {
      const { root } = placement;
      if (!root.isConnected) {
        releaseRoot(placement, false);
        continue;
      }
      const selectedRootTarget = selectedElements.size === 1
        || Array.from(selectedElements).some((element) => {
          const target = element.getBoundingClientRect();
          const chrome = root.children.item(0);
          if (!(chrome instanceof realm.HTMLElement)) return false;
          const rect = chrome.getBoundingClientRect();
          return Math.abs(target.left - rect.left) <= 5
            && Math.abs(target.top - rect.top) <= 5
            && Math.abs(target.width - rect.width) <= 5
            && Math.abs(target.height - rect.height) <= 5;
        });
      if (!selectedRootTarget && selectedElements.size === 0) releaseRoot(placement, true);
    }
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      stabilize();
    });
  };

  const observer = new realm.MutationObserver(schedule);
  observer.observe(portalTarget, { subtree: true, childList: true });
  const unsubscribeWorkspace = workspace.subscribe(schedule);
  ownerWindow.addEventListener("pointerup", schedule, true);
  ownerWindow.addEventListener("dblclick", schedule, true);
  ownerWindow.addEventListener("resize", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    unsubscribeWorkspace();
    ownerWindow.removeEventListener("pointerup", schedule, true);
    ownerWindow.removeEventListener("dblclick", schedule, true);
    ownerWindow.removeEventListener("resize", schedule, true);
    for (const placement of Array.from(placements.values())) releaseRoot(placement, true);
    workspace.dispose();
  });
}
