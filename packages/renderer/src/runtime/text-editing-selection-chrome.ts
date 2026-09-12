import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type InlineOpacity = {
  value: string;
  priority: string;
  marker: string | undefined;
};

const SELECTED_ROOT = "[data-mesurer-selected-measurement='true']";
const EDITOR = "[data-mesurer-text-editor='true']";

/**
 * Direct text edit owns the visible blue border for the edited element.
 *
 * In the public isolated mount, selected MeasurementBox presentation can cross
 * from the renderer ShadowRoot into the document layer while Solid reconciles
 * the portal. The text-edit runtime itself is already document-backed, so only
 * scanning its portal misses a transient selected root that is still alive in
 * the original isolated renderer. If both copies paint, their independently
 * updated geometry can separate for a frame and appear as the duplicate/trailing
 * blue rectangle seen during direct-edit entry and compositor scrolling.
 *
 * Keep logical selection and all native anchor state mounted. Make every
 * selected MeasurementBox presentation paintless for the editor lifetime in
 * both ownership layers, then restore its exact prior inline opacity when the
 * editor closes.
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

  const suppressed = new Map<HTMLElement, InlineOpacity>();
  let active = false;
  let queued = false;
  let disposed = false;
  let selectionObserver: MutationObserver | null = null;

  const selectionRoots = () => {
    const roots = new Set<HTMLElement>();
    const scopes: ParentNode[] = [portalTarget];
    if (sourcePortalTarget !== portalTarget) scopes.push(sourcePortalTarget);
    if (ownerDocument.body && !scopes.includes(ownerDocument.body)) scopes.push(ownerDocument.body);

    for (const scope of scopes) {
      for (const root of scope.querySelectorAll<HTMLElement>(SELECTED_ROOT)) roots.add(root);
    }
    return roots;
  };

  const suppressRoot = (root: HTMLElement) => {
    if (!suppressed.has(root)) {
      suppressed.set(root, {
        value: root.style.getPropertyValue("opacity"),
        priority: root.style.getPropertyPriority("opacity"),
        marker: root.dataset.mesurerDirectEditSelectionSuppressed,
      });
    }
    root.dataset.mesurerDirectEditSelectionSuppressed = "true";
    root.style.setProperty("opacity", "0", "important");
  };

  const restoreRoot = (root: HTMLElement, previous: InlineOpacity) => {
    if (root.isConnected) {
      if (previous.value || previous.priority) {
        root.style.setProperty("opacity", previous.value, previous.priority);
      } else {
        root.style.removeProperty("opacity");
      }
      if (previous.marker === undefined) delete root.dataset.mesurerDirectEditSelectionSuppressed;
      else root.dataset.mesurerDirectEditSelectionSuppressed = previous.marker;
    }
    suppressed.delete(root);
  };

  const suppressCurrentRoots = () => {
    const current = selectionRoots();
    for (const root of current) suppressRoot(root);
    for (const [root, previous] of Array.from(suppressed)) {
      if (!root.isConnected || !current.has(root)) restoreRoot(root, previous);
    }
  };

  const restoreAll = () => {
    for (const [root, previous] of Array.from(suppressed)) restoreRoot(root, previous);
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const startSelectionObserver = () => {
    if (selectionObserver) return;
    selectionObserver = new realm.MutationObserver(schedule);
    const observed = new Set<Node>();
    const observe = (root: Node, subtree: boolean) => {
      if (observed.has(root)) return;
      observed.add(root);
      selectionObserver!.observe(root, { childList: true, subtree });
    };

    observe(portalTarget, portalTarget !== ownerDocument.body);
    if (sourcePortalTarget !== portalTarget) observe(sourcePortalTarget, true);
    if (ownerDocument.body) observe(ownerDocument.body, false);
  };

  const stopSelectionObserver = () => {
    selectionObserver?.disconnect();
    selectionObserver = null;
  };

  const sync = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>(EDITOR);
    if (editor) {
      active = true;
      suppressCurrentRoots();
      startSelectionObserver();
      return;
    }
    if (!active && suppressed.size === 0) return;
    active = false;
    stopSelectionObserver();
    restoreAll();
  };

  // Register before render-in-place creates its visible edit ring. Mutation
  // observers flush before the next paint, including selected roots that Solid
  // creates/replaces in either the isolated or document portal during startup.
  const runtimeObserver = new realm.MutationObserver(schedule);
  runtimeObserver.observe(runtimeMount, { childList: true, subtree: true });
  sync();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    runtimeObserver.disconnect();
    stopSelectionObserver();
    restoreAll();
  });
}