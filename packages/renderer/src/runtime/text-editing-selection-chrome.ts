import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type InlineOpacity = {
  value: string;
  priority: string;
  marker: string | null;
};

const SELECTED_ROOT = "[data-mesurer-selected-measurement='true']";
const HOVER_ROOT = "[data-mesurer-hover-measurement='true']";
const EDITOR = "[data-mesurer-text-editor='true']";
const SELECTED_SUPPRESSED = "data-mesurer-direct-edit-selection-suppressed";
const HOVER_SUPPRESSED = "data-mesurer-direct-edit-hover-suppressed";

/**
 * Direct text edit owns the visible blue border for the edited element.
 *
 * Keep ordinary selected chrome logically mounted and native-anchored while the
 * editor is active, but do not let it paint in either the document layer or the
 * original isolated renderer. Select remains active during editing, so its hover
 * surface also needs one ownership rule: hovering either the edit-owned element
 * or the currently selected element must not create a second copy of that same
 * rectangle. Hovering another element remains visible.
 */
export function installDirectEditSelectionChromeOwnership(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
  sourcePortalTarget: HTMLElement | ShadowRoot = runtime.portalTarget,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns the runtime and source portal roots.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const workspace = runtime.createWorkspaceRuntime();
  const selectedSuppressed = new Map<HTMLElement, InlineOpacity>();
  const hoverSuppressed = new Map<HTMLElement, InlineOpacity>();
  const selectedRoots = new Set<HTMLElement>();
  const hoverRoots = new Set<HTMLElement>();
  let editOwnedElements = new Set<HTMLElement>();
  let active = false;
  let queued = false;
  let disposed = false;
  let surfaceObserver: MutationObserver | null = null;

  const scopes = () => {
    const values: ParentNode[] = [portalTarget];
    if (sourcePortalTarget !== portalTarget) values.push(sourcePortalTarget);
    if (ownerDocument.body && !values.includes(ownerDocument.body)) values.push(ownerDocument.body);
    return values;
  };

  const registerRoot = (root: HTMLElement) => {
    if (root.matches(SELECTED_ROOT)) selectedRoots.add(root);
    if (root.matches(HOVER_ROOT)) hoverRoots.add(root);
  };

  const registerNode = (node: Node) => {
    if (!(node instanceof realm.HTMLElement)) return;
    registerRoot(node);
    for (const root of node.querySelectorAll<HTMLElement>(`${SELECTED_ROOT}, ${HOVER_ROOT}`)) {
      registerRoot(root);
    }
  };

  const scanScope = (scope: ParentNode) => {
    for (const root of scope.querySelectorAll<HTMLElement>(`${SELECTED_ROOT}, ${HOVER_ROOT}`)) {
      registerRoot(root);
    }
  };

  for (const scope of scopes()) scanScope(scope);

  const suppressRoot = (
    root: HTMLElement,
    values: Map<HTMLElement, InlineOpacity>,
    marker: string,
  ) => {
    if (!values.has(root)) {
      values.set(root, {
        value: root.style.getPropertyValue("opacity"),
        priority: root.style.getPropertyPriority("opacity"),
        marker: root.getAttribute(marker),
      });
    }
    if (root.getAttribute(marker) !== "true") root.setAttribute(marker, "true");
    if (
      root.style.getPropertyValue("opacity") !== "0"
      || root.style.getPropertyPriority("opacity") !== "important"
    ) {
      root.style.setProperty("opacity", "0", "important");
    }
  };

  const restoreRoot = (
    root: HTMLElement,
    previous: InlineOpacity,
    values: Map<HTMLElement, InlineOpacity>,
    marker: string,
  ) => {
    if (root.isConnected) {
      if (previous.value || previous.priority) {
        root.style.setProperty("opacity", previous.value, previous.priority);
      } else {
        root.style.removeProperty("opacity");
      }
      if (previous.marker === null) root.removeAttribute(marker);
      else root.setAttribute(marker, previous.marker);
    }
    values.delete(root);
  };

  const restoreAll = (
    values: Map<HTMLElement, InlineOpacity>,
    marker: string,
  ) => {
    for (const [root, previous] of Array.from(values)) {
      restoreRoot(root, previous, values, marker);
    }
  };

  const suppressCurrentSelections = () => {
    for (const root of Array.from(selectedRoots)) {
      if (!root.isConnected) {
        selectedRoots.delete(root);
        const previous = selectedSuppressed.get(root);
        if (previous) restoreRoot(root, previous, selectedSuppressed, SELECTED_SUPPRESSED);
        continue;
      }
      suppressRoot(root, selectedSuppressed, SELECTED_SUPPRESSED);
    }
    for (const [root, previous] of Array.from(selectedSuppressed)) {
      if (!root.isConnected || !selectedRoots.has(root)) {
        restoreRoot(root, previous, selectedSuppressed, SELECTED_SUPPRESSED);
      }
    }
  };

  const syncHoverOwnership = () => {
    const hovered = workspace.hoveredElement();
    const selected = workspace.currentSelection().elements;
    const editOwned = hovered ? editOwnedElements.has(hovered) : false;
    const selectionOwned = hovered ? selected.includes(hovered) : false;

    if (!editOwned && !selectionOwned) {
      restoreAll(hoverSuppressed, HOVER_SUPPRESSED);
      return;
    }

    for (const root of Array.from(hoverRoots)) {
      if (!root.isConnected) {
        hoverRoots.delete(root);
        const previous = hoverSuppressed.get(root);
        if (previous) restoreRoot(root, previous, hoverSuppressed, HOVER_SUPPRESSED);
        continue;
      }
      suppressRoot(root, hoverSuppressed, HOVER_SUPPRESSED);
    }
    for (const [root, previous] of Array.from(hoverSuppressed)) {
      if (!root.isConnected || !hoverRoots.has(root)) {
        restoreRoot(root, previous, hoverSuppressed, HOVER_SUPPRESSED);
      }
    }
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const observeMutations = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) registerNode(node);
    }
    schedule();
  };

  const startSurfaceObserver = () => {
    if (surfaceObserver) return;
    surfaceObserver = new realm.MutationObserver(observeMutations);
    const observed = new Set<Node>();
    const observe = (root: Node, subtree: boolean) => {
      if (observed.has(root)) return;
      observed.add(root);
      surfaceObserver!.observe(root, { childList: true, subtree });
    };

    for (const scope of scopes()) scanScope(scope);
    observe(portalTarget, portalTarget !== ownerDocument.body);
    if (sourcePortalTarget !== portalTarget) observe(sourcePortalTarget, true);
    if (ownerDocument.body) observe(ownerDocument.body, false);
  };

  const stopSurfaceObserver = () => {
    surfaceObserver?.disconnect();
    surfaceObserver = null;
  };

  const sync = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>(EDITOR);
    if (editor) {
      if (!active) editOwnedElements = new Set(workspace.currentSelection().elements);
      active = true;
      suppressCurrentSelections();
      syncHoverOwnership();
      startSurfaceObserver();
      return;
    }
    if (!active && selectedSuppressed.size === 0 && hoverSuppressed.size === 0) return;
    active = false;
    editOwnedElements.clear();
    stopSurfaceObserver();
    restoreAll(selectedSuppressed, SELECTED_SUPPRESSED);
    restoreAll(hoverSuppressed, HOVER_SUPPRESSED);
  };

  // Register before render-in-place creates its visible edit ring. Model updates
  // catch hover/selection ownership changes, while DOM observation catches Solid
  // replacement roots before the next paint. Surface discovery is incremental,
  // so sync work scales with Mesurer's active chrome rather than page DOM size.
  const runtimeObserver = new realm.MutationObserver(observeMutations);
  runtimeObserver.observe(runtimeMount, { childList: true, subtree: true });
  const unsubscribeWorkspace = workspace.subscribe(schedule);
  sync();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    runtimeObserver.disconnect();
    stopSurfaceObserver();
    unsubscribeWorkspace();
    workspace.dispose();
    restoreAll(selectedSuppressed, SELECTED_SUPPRESSED);
    restoreAll(hoverSuppressed, HOVER_SUPPRESSED);
    selectedRoots.clear();
    hoverRoots.clear();
  });
}
