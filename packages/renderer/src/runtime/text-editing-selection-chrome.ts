import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type SuppressedKind = "selection" | "hover";

type InlineOpacity = {
  value: string;
  priority: string;
  marker: string | undefined;
  kind: SuppressedKind;
};

const SELECTED_ROOT = "[data-mesurer-selected-measurement='true']";
const HOVER_ROOT = "[data-mesurer-hover-measurement='true']";
const EDITOR = "[data-mesurer-text-editor='true']";
const EDIT_RING = "[data-mesurer-text-edit-ring='true']";

const sameRect = (left: DOMRect, right: DOMRect, tolerance = 2) => (
  Math.abs(left.left - right.left) <= tolerance
  && Math.abs(left.top - right.top) <= tolerance
  && Math.abs(left.width - right.width) <= tolerance
  && Math.abs(left.height - right.height) <= tolerance
);

/**
 * Direct text edit owns the visible blue geometry for the element being edited.
 * Select can remain active in the background, but neither its selected
 * MeasurementBox nor its hover box for that same page element may paint at the
 * same time as the edit ring. Those surfaces use independent native anchors;
 * if two compositor handoffs land on different frames, the redundant surface
 * becomes the trailing/duplicate blue rectangle seen during entry and scroll.
 *
 * Keep logical selection and hover state intact. Only their redundant visual
 * presentation is made paintless while the editor owns that exact target.
 * Hovering a different page element remains visible so Select keeps working
 * normally during direct editing.
 */
export function installDirectEditSelectionChromeOwnership(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
  sourcePortalTarget: HTMLElement | ShadowRoot = runtime.portalTarget,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns all supplied roots and supplies their matching DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const workspace = runtime.createWorkspaceRuntime();
  const suppressed = new Map<HTMLElement, InlineOpacity>();
  let active = false;
  let queued = false;
  let disposed = false;
  let chromeObserver: MutationObserver | null = null;

  const chromeRoots = (selector: string) => {
    const roots = new Set<HTMLElement>();
    const scopes: ParentNode[] = [portalTarget];
    if (sourcePortalTarget !== portalTarget) scopes.push(sourcePortalTarget);
    if (ownerDocument.body && !scopes.includes(ownerDocument.body)) scopes.push(ownerDocument.body);
    for (const scope of scopes) {
      for (const root of scope.querySelectorAll<HTMLElement>(selector)) roots.add(root);
    }
    return roots;
  };

  const markerFor = (root: HTMLElement, kind: SuppressedKind) => kind === "selection"
    ? root.dataset.mesurerDirectEditSelectionSuppressed
    : root.dataset.mesurerDirectEditHoverSuppressed;

  const setMarker = (root: HTMLElement, kind: SuppressedKind, value: string | undefined) => {
    if (kind === "selection") {
      if (value === undefined) delete root.dataset.mesurerDirectEditSelectionSuppressed;
      else root.dataset.mesurerDirectEditSelectionSuppressed = value;
      return;
    }
    if (value === undefined) delete root.dataset.mesurerDirectEditHoverSuppressed;
    else root.dataset.mesurerDirectEditHoverSuppressed = value;
  };

  const suppressRoot = (root: HTMLElement, kind: SuppressedKind) => {
    const previous = suppressed.get(root);
    if (!previous) {
      suppressed.set(root, {
        value: root.style.getPropertyValue("opacity"),
        priority: root.style.getPropertyPriority("opacity"),
        marker: markerFor(root, kind),
        kind,
      });
    } else if (previous.kind !== kind) {
      return;
    }
    setMarker(root, kind, "true");
    root.style.setProperty("opacity", "0", "important");
  };

  const restoreRoot = (root: HTMLElement, previous: InlineOpacity) => {
    if (root.isConnected) {
      if (previous.value || previous.priority) {
        root.style.setProperty("opacity", previous.value, previous.priority);
      } else {
        root.style.removeProperty("opacity");
      }
      setMarker(root, previous.kind, previous.marker);
    }
    suppressed.delete(root);
  };

  const restoreKind = (kind: SuppressedKind) => {
    for (const [root, previous] of Array.from(suppressed)) {
      if (previous.kind === kind) restoreRoot(root, previous);
    }
  };

  const restoreAll = () => {
    for (const [root, previous] of Array.from(suppressed)) restoreRoot(root, previous);
  };

  const hoverBelongsToEditedTarget = () => {
    const hovered = workspace.hoveredElement();
    if (!hovered?.isConnected) return false;
    if (workspace.currentSelection().elements.includes(hovered)) return true;

    // Direct editing can begin before Select has committed a logical selection
    // in some host/event orderings. The edit ring is already the authoritative
    // source geometry at that point, so use it only as a narrow fallback.
    const ring = runtimeMount.querySelector<HTMLElement>(EDIT_RING);
    if (!ring?.isConnected) return false;
    return sameRect(hovered.getBoundingClientRect(), ring.getBoundingClientRect());
  };

  const suppressCurrentChrome = () => {
    const selectionRoots = chromeRoots(SELECTED_ROOT);
    for (const root of selectionRoots) suppressRoot(root, "selection");

    const hoverRoots = chromeRoots(HOVER_ROOT);
    const suppressHover = hoverBelongsToEditedTarget();
    if (suppressHover) {
      for (const root of hoverRoots) suppressRoot(root, "hover");
    } else {
      restoreKind("hover");
    }

    for (const [root, previous] of Array.from(suppressed)) {
      if (!root.isConnected) {
        suppressed.delete(root);
        continue;
      }
      if (previous.kind === "selection" && !selectionRoots.has(root)) restoreRoot(root, previous);
      if (previous.kind === "hover" && (!suppressHover || !hoverRoots.has(root))) restoreRoot(root, previous);
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

  const startChromeObserver = () => {
    if (chromeObserver) return;
    chromeObserver = new realm.MutationObserver(schedule);
    const observed = new Set<Node>();
    const observe = (root: Node, subtree: boolean) => {
      if (observed.has(root)) return;
      observed.add(root);
      chromeObserver!.observe(root, { childList: true, subtree });
    };

    observe(portalTarget, portalTarget !== ownerDocument.body);
    if (sourcePortalTarget !== portalTarget) observe(sourcePortalTarget, true);
    if (ownerDocument.body) observe(ownerDocument.body, false);
  };

  const stopChromeObserver = () => {
    chromeObserver?.disconnect();
    chromeObserver = null;
  };

  const sync = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>(EDITOR);
    if (editor) {
      active = true;
      suppressCurrentChrome();
      startChromeObserver();
      return;
    }
    if (!active && suppressed.size === 0) return;
    active = false;
    stopChromeObserver();
    restoreAll();
  };

  // Register before render-in-place does its own editor observer. Mutation
  // observers run before the next paint, so redundant Select chrome is already
  // paintless by the frame where the direct-edit ring first appears.
  const runtimeObserver = new realm.MutationObserver(schedule);
  runtimeObserver.observe(runtimeMount, { childList: true, subtree: true });
  const unsubscribeWorkspace = workspace.subscribe(schedule);
  sync();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    runtimeObserver.disconnect();
    stopChromeObserver();
    unsubscribeWorkspace();
    restoreAll();
    workspace.dispose();
  });
}