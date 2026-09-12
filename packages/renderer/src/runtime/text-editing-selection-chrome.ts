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
 * surface also needs one ownership rule: hovering the element that is already
 * selected must not create a second copy of the same rectangle, while hovering a
 * different element stays visible.
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

  const rootsFor = (selector: string) => {
    const roots = new Set<HTMLElement>();
    for (const scope of scopes()) {
      for (const root of scope.querySelectorAll<HTMLElement>(selector)) roots.add(root);
    }
    return roots;
  };

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
    const current = rootsFor(SELECTED_ROOT);
    for (const root of current) suppressRoot(root, selectedSuppressed, SELECTED_SUPPRESSED);
    for (const [root, previous] of Array.from(selectedSuppressed)) {
      if (!root.isConnected || !current.has(root)) {
        restoreRoot(root, previous, selectedSuppressed, SELECTED_SUPPRESSED);
      }
    }
  };

  const syncHoverOwnership = () => {
    const hovered = workspace.hoveredElement();
    const selected = workspace.currentSelection().elements;
    const sameTarget = Boolean(hovered && selected.includes(hovered));
    const current = rootsFor(HOVER_ROOT);

    if (!sameTarget) {
      restoreAll(hoverSuppressed, HOVER_SUPPRESSED);
      return;
    }

    for (const root of current) suppressRoot(root, hoverSuppressed, HOVER_SUPPRESSED);
    for (const [root, previous] of Array.from(hoverSuppressed)) {
      if (!root.isConnected || !current.has(root)) {
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

  const startSurfaceObserver = () => {
    if (surfaceObserver) return;
    surfaceObserver = new realm.MutationObserver(schedule);
    const observed = new Set<Node>();
    const observe = (root: Node, subtree: boolean) => {
      if (observed.has(root)) return;
      observed.add(root);
      surfaceObserver!.observe(root, { childList: true, subtree });
    };

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
      active = true;
      suppressCurrentSelections();
      syncHoverOwnership();
      startSurfaceObserver();
      return;
    }
    if (!active && selectedSuppressed.size === 0 && hoverSuppressed.size === 0) return;
    active = false;
    stopSurfaceObserver();
    restoreAll(selectedSuppressed, SELECTED_SUPPRESSED);
    restoreAll(hoverSuppressed, HOVER_SUPPRESSED);
  };

  // Register before render-in-place creates its visible edit ring. Model updates
  // catch hover/selection ownership changes, while DOM observation catches Solid
  // replacement roots before the next paint.
  const runtimeObserver = new realm.MutationObserver(schedule);
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
  });
}
