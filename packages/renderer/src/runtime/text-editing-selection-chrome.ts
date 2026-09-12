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
 * Direct text edit already owns a dedicated edit ring and range highlight.
 * Keeping the ordinary selection box visible at the same time gives Chromium
 * two independently anchored copies of the same blue geometry. If their
 * compositor handoff lands on different frames, the selection box appears as a
 * transient trailing/duplicate "ghost" while scrolling.
 *
 * Keep the logical selection intact, but make its presentation paintless for
 * the lifetime of the editor. The root keeps layout and anchor geometry so the
 * normal selection path can continue stabilizing in the background and resume
 * immediately when editing ends.
 */
export function installDirectEditSelectionChromeOwnership(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies its matching DOM constructors.
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
    const collect = (scope: ParentNode) => {
      for (const root of scope.querySelectorAll<HTMLElement>(SELECTED_ROOT)) roots.add(root);
    };

    collect(portalTarget);
    // A public isolated mount portals selected MeasurementBox roots into the
    // document while the canonical toolbar remains in Shadow DOM.
    if (portalTarget.getRootNode() !== ownerDocument || portalTarget !== ownerDocument.body) {
      collect(ownerDocument);
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

  const suppressCurrentRoots = () => {
    for (const root of selectionRoots()) suppressRoot(root);
  };

  const restoreRoot = (root: HTMLElement, previous: InlineOpacity) => {
    if (previous.value || previous.priority) {
      root.style.setProperty("opacity", previous.value, previous.priority);
    } else {
      root.style.removeProperty("opacity");
    }
    if (previous.marker === undefined) delete root.dataset.mesurerDirectEditSelectionSuppressed;
    else root.dataset.mesurerDirectEditSelectionSuppressed = previous.marker;
  };

  const restoreAll = () => {
    for (const [root, previous] of suppressed) restoreRoot(root, previous);
    suppressed.clear();
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
    if (portalTarget === ownerDocument.body) {
      // Selected page MeasurementBox portals are direct body children. Watching
      // only this list avoids observing arbitrary application subtree churn.
      selectionObserver.observe(portalTarget, { childList: true });
    } else {
      selectionObserver.observe(portalTarget, { childList: true, subtree: true });
      if (ownerDocument.body && portalTarget.getRootNode() !== ownerDocument) {
        selectionObserver.observe(ownerDocument.body, { childList: true });
      }
    }
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

  // Register before render-in-place does its own editor observer. Mutation
  // observers run before the next paint, so the ordinary selection box is
  // already paintless by the frame where the edit ring first appears.
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
