import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const SCROLL_IDLE_MS = 80;
const VIEWPORT_PADDING = 8;
const INSPECTOR_GAP = 8;

let anchorSequence = 0;

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type AnchorBinding = {
  target: HTMLElement;
  name: string;
  release: () => void;
};

type Placement = {
  element: HTMLElement;
  release: () => void;
};

type SelectionBinding = AnchorBinding & {
  root: HTMLElement;
  chrome: HTMLElement;
  label: HTMLElement | null;
  placement: Placement;
};

type HoverBinding = AnchorBinding & {
  surface: HTMLElement;
  placement: Placement;
};

type EditBinding = AnchorBinding & {
  ring: HTMLElement;
};

type InspectorPairBinding = AnchorBinding & {
  box: HTMLElement;
  card: HTMLElement | null;
};

type TargetAnchorState = {
  original: string;
  originalPriority: string;
  names: Set<string>;
};

const rectFromDom = (rect: DOMRect): Rect => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

const inlineRect = (element: HTMLElement): Rect => {
  const left = Number.parseFloat(element.style.left) || 0;
  const top = Number.parseFloat(element.style.top) || 0;
  const width = Number.parseFloat(element.style.width) || element.getBoundingClientRect().width;
  const height = Number.parseFloat(element.style.height) || element.getBoundingClientRect().height;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
};

const sameRect = (left: Rect, right: Rect, tolerance = 5) => (
  Math.abs(left.left - right.left) <= tolerance
  && Math.abs(left.top - right.top) <= tolerance
  && Math.abs(left.width - right.width) <= tolerance
  && Math.abs(left.height - right.height) <= tolerance
);

const isVisibleRect = (rect: Rect) => rect.width > 0
  && rect.height > 0
  && rect.right > 0
  && rect.bottom > 0;

const supportsAnchors = (ownerWindow: Window & typeof globalThis) => Boolean(
  ownerWindow.CSS?.supports("anchor-name: --mesurer-native-anchor")
  && ownerWindow.CSS.supports("position-anchor: --mesurer-native-anchor")
  && ownerWindow.CSS.supports("left: anchor(left)")
  && ownerWindow.CSS.supports("width: anchor-size(width)"),
);

const setImportant = (element: HTMLElement, property: string, value: string) => {
  if (
    element.style.getPropertyValue(property) === value
    && element.style.getPropertyPriority(property) === "important"
  ) return;
  element.style.setProperty(property, value, "important");
};

const clearAnchorSurface = (element: HTMLElement | null | undefined) => {
  if (!element) return;
  delete element.dataset.mesurerNativeScrollAnchor;
  delete element.dataset.mesurerNativeScrollOwner;
  element.style.removeProperty("position-anchor");
  element.style.removeProperty("--mesurer-native-anchor-x");
  element.style.removeProperty("--mesurer-native-anchor-y");
};

const elementAncestors = (
  element: Element,
  stop: HTMLElement,
  realm: Window & typeof globalThis,
) => {
  const values: HTMLElement[] = [];
  let current: Element | null = element;
  while (current instanceof realm.HTMLElement) {
    values.push(current);
    if (current === stop) break;
    current = current.parentElement;
  }
  return values;
};

const findTargetForRect = (
  intended: Rect,
  ownerDocument: Document,
  ownerWindow: Window & typeof globalThis,
  pageTarget: HTMLElement,
) => {
  if (!isVisibleRect(intended)) return null;
  const x = Math.min(Math.max(intended.left + intended.width / 2, 0), Math.max(0, ownerWindow.innerWidth - 1));
  const y = Math.min(Math.max(intended.top + intended.height / 2, 0), Math.max(0, ownerWindow.innerHeight - 1));
  const seen = new Set<HTMLElement>();

  for (const hit of ownerDocument.elementsFromPoint(x, y)) {
    for (const candidate of elementAncestors(hit, pageTarget, ownerWindow)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      if (candidate !== pageTarget && !pageTarget.contains(candidate)) continue;
      if (candidate.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']")) continue;
      const rect = rectFromDom(candidate.getBoundingClientRect());
      if (sameRect(rect, intended)) return candidate;
    }
  }

  return null;
};

const snapshotStyles = (element: HTMLElement, properties: readonly string[]) => properties.map((property) => ({
  property,
  value: element.style.getPropertyValue(property),
  priority: element.style.getPropertyPriority(property),
}));

const restoreStyles = (
  element: HTMLElement,
  values: ReturnType<typeof snapshotStyles>,
) => {
  for (const { property, value, priority } of values) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }
};

const moveToBody = (
  ownerDocument: Document,
  element: HTMLElement,
  normalize: "none" | "selection-root" | "runtime" | "inspector-overlay" = "none",
): Placement => {
  const body = ownerDocument.body;
  const parent = element.parentNode;
  const marker = parent && parent !== body
    ? ownerDocument.createComment("mesurer-document-scroll-layer")
    : null;
  if (marker && parent) parent.insertBefore(marker, element);
  if (element.parentNode !== body) body.append(element);

  const properties = normalize === "selection-root"
    ? ["display", "position", "left", "top", "width", "height"] as const
    : normalize === "runtime" || normalize === "inspector-overlay"
      ? ["display", "position", "inset", "width", "height"] as const
      : [] as const;
  const previous = snapshotStyles(element, properties);

  if (normalize === "selection-root") {
    setImportant(element, "display", "block");
    setImportant(element, "position", "absolute");
    setImportant(element, "left", "0px");
    setImportant(element, "top", "0px");
    setImportant(element, "width", "100vw");
    setImportant(element, "height", "0px");
  } else if (normalize === "runtime" || normalize === "inspector-overlay") {
    setImportant(element, "display", "block");
    setImportant(element, "position", "static");
    setImportant(element, "inset", "auto");
    setImportant(element, "width", "0px");
    setImportant(element, "height", "0px");
  }

  let released = false;
  return {
    element,
    release() {
      if (released) return;
      released = true;
      restoreStyles(element, previous);
      if (marker?.parentNode) {
        if (element.isConnected) marker.parentNode.insertBefore(element, marker);
        marker.remove();
      }
    },
  };
};

export function installDocumentScrollAnchoring(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget, portalTarget } = runtime;
  // SAFETY: ownerWindow owns pageTarget/portalTarget and supplies this runtime's DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!supportsAnchors(realm)) return;
  if (portalTarget instanceof realm.ShadowRoot || pageTarget instanceof realm.ShadowRoot) return;
  if (portalTarget.getRootNode() !== ownerDocument || pageTarget.getRootNode() !== ownerDocument) return;
  if (!ownerDocument.body) return;

  const workspace = runtime.createWorkspaceRuntime();
  const targetAnchors = new Map<HTMLElement, TargetAnchorState>();
  const selectionBindings = new Map<HTMLElement, SelectionBinding>();
  const highlightPlacements = new Map<HTMLElement, Placement>();
  const inspectorPairBindings = new Map<HTMLElement, InspectorPairBinding>();
  const inspectorOverlayPlacements = new Map<HTMLElement, Placement>();
  let hoverBinding: HoverBinding | null = null;
  let editBinding: EditBinding | null = null;
  let disposed = false;
  let queued = false;
  let frame = 0;
  let scrolling = false;
  let scrollIdleTimer = 0;

  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  const runtimePlacement = runtimeMount?.isConnected
    ? moveToBody(ownerDocument, runtimeMount, "runtime")
    : null;
  if (runtimeMount) runtimeMount.dataset.mesurerNativeScrollRuntimeLayer = "true";

  const style = ownerDocument.createElement("style");
  style.dataset.mesurerNativeScrollAnchoring = "true";
  style.dataset.mesurerInspectorUi = "true";
  style.textContent = `
[data-mesurer-native-scroll-anchor="box"] {
  position: absolute !important;
  left: anchor(left) !important;
  top: anchor(top) !important;
  right: auto !important;
  bottom: auto !important;
  width: anchor-size(width) !important;
  height: anchor-size(height) !important;
  transition: none !important;
  animation: none !important;
}
[data-mesurer-native-scroll-anchor="label"] {
  position: absolute !important;
  left: anchor(center) !important;
  top: calc(anchor(bottom) + 2px) !important;
  right: auto !important;
  bottom: auto !important;
  transition: none !important;
  animation: none !important;
}
[data-mesurer-native-scroll-anchor="offset"] {
  position: absolute !important;
  left: calc(anchor(left) + var(--mesurer-native-anchor-x, 0px)) !important;
  top: calc(anchor(top) + var(--mesurer-native-anchor-y, 0px)) !important;
  right: auto !important;
  bottom: auto !important;
  transition: none !important;
  animation: none !important;
}
[data-mesurer-native-scroll-owner="typography"][data-mesurer-native-scroll-anchor="box"],
[data-mesurer-native-scroll-owner="typography"][data-mesurer-native-scroll-anchor="offset"] {
  position: fixed !important;
}
`;
  ownerDocument.head.append(style);

  const syncTargetAnchor = (target: HTMLElement, state: TargetAnchorState) => {
    const original = state.original.trim();
    const names = Array.from(state.names);
    const value = [original && original !== "none" ? original : "", ...names].filter(Boolean).join(", ");
    if (value) target.style.setProperty("anchor-name", value, state.originalPriority);
    else target.style.removeProperty("anchor-name");
  };

  const addTargetAnchor = (target: HTMLElement, name: string) => {
    let state = targetAnchors.get(target);
    if (!state) {
      state = {
        original: target.style.getPropertyValue("anchor-name"),
        originalPriority: target.style.getPropertyPriority("anchor-name"),
        names: new Set<string>(),
      };
      targetAnchors.set(target, state);
    }
    state.names.add(name);
    syncTargetAnchor(target, state);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = targetAnchors.get(target);
      if (!current) return;
      current.names.delete(name);
      if (current.names.size) {
        syncTargetAnchor(target, current);
        return;
      }
      if (current.original) target.style.setProperty("anchor-name", current.original, current.originalPriority);
      else target.style.removeProperty("anchor-name");
      targetAnchors.delete(target);
    };
  };

  const makeBinding = (target: HTMLElement, kind: string): AnchorBinding => {
    const name = `--mesurer-${kind}-${++anchorSequence}`;
    return { target, name, release: addTargetAnchor(target, name) };
  };

  const applyAnchor = (surface: HTMLElement, binding: AnchorBinding, kind: "box" | "label" | "offset") => {
    surface.dataset.mesurerNativeScrollAnchor = kind;
    setImportant(surface, "position-anchor", binding.name);
  };

  const releaseSelection = (binding: SelectionBinding) => {
    clearAnchorSurface(binding.chrome);
    clearAnchorSurface(binding.label);
    binding.release();
    binding.placement.release();
  };

  const bindSelection = (
    root: HTMLElement,
    target: HTMLElement,
    chrome: HTMLElement,
    label: HTMLElement | null,
  ) => {
    const previous = selectionBindings.get(root);
    if (previous) releaseSelection(previous);
    const anchor = makeBinding(target, "selection");
    const placement = moveToBody(
      ownerDocument,
      root,
      root.parentNode === ownerDocument.body ? "none" : "selection-root",
    );
    const binding: SelectionBinding = { ...anchor, root, chrome, label, placement };
    selectionBindings.set(root, binding);
    applyAnchor(chrome, binding, "box");
    if (label) applyAnchor(label, binding, "label");
  };

  const selectedTargetForRect = (intended: Rect, selectedTargets: HTMLElement[]) => {
    const exact = selectedTargets.find((target) => sameRect(rectFromDom(target.getBoundingClientRect()), intended));
    if (exact) return exact;
    return selectedTargets.length === 1 ? selectedTargets[0] : null;
  };

  const stabilizeSelections = () => {
    const roots = new Set<HTMLElement>();
    for (const root of selectionBindings.keys()) if (root.isConnected) roots.add(root);
    for (const root of portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-selected-measurement='true']")) {
      if (root.dataset.mesurerSelectionGroup !== "true") roots.add(root);
    }

    const selectedTargets = workspace.currentSelection().elements;
    for (const root of roots) {
      const existing = selectionBindings.get(root);
      if (existing?.target.isConnected && existing.chrome.isConnected) {
        applyAnchor(existing.chrome, existing, "box");
        if (existing.label?.isConnected) applyAnchor(existing.label, existing, "label");
        // The model already owns selection identity. Preserve the existing CSS
        // anchor while that same connected element remains selected instead of
        // rediscovering it from transient inline coordinates during edit/scroll.
        if (selectedTargets.includes(existing.target) || scrolling) continue;
        const intended = inlineRect(existing.chrome);
        const target = selectedTargetForRect(intended, selectedTargets)
          ?? findTargetForRect(intended, ownerDocument, realm, pageTarget);
        if (target) bindSelection(root, target, existing.chrome, existing.label);
        continue;
      }

      if (existing) {
        releaseSelection(existing);
        selectionBindings.delete(root);
      }
      const chrome = root.children.item(0);
      if (!(chrome instanceof realm.HTMLElement)) continue;
      const labelCandidate = root.children.item(root.children.length - 1);
      const label = labelCandidate instanceof realm.HTMLElement && labelCandidate !== chrome
        ? labelCandidate
        : null;
      const intended = inlineRect(chrome);
      const target = selectedTargetForRect(intended, selectedTargets)
        ?? findTargetForRect(intended, ownerDocument, realm, pageTarget);
      if (target) bindSelection(root, target, chrome, label);
    }

    for (const [root, binding] of Array.from(selectionBindings)) {
      if (root.isConnected) continue;
      releaseSelection(binding);
      selectionBindings.delete(root);
    }
  };

  const releaseHover = () => {
    if (!hoverBinding) return;
    clearAnchorSurface(hoverBinding.surface);
    hoverBinding.release();
    hoverBinding.placement.release();
    hoverBinding = null;
  };

  const stabilizeHover = () => {
    const surface = hoverBinding?.surface.isConnected
      ? hoverBinding.surface
      : portalTarget.querySelector<HTMLElement>("[data-mesurer-hover-measurement='true']");
    if (!surface?.isConnected) {
      releaseHover();
      return;
    }

    const intended = inlineRect(surface);
    if (hoverBinding?.surface === surface && hoverBinding.target.isConnected) {
      applyAnchor(surface, hoverBinding, "box");
      if (scrolling || sameRect(rectFromDom(hoverBinding.target.getBoundingClientRect()), intended)) return;
    }

    const target = findTargetForRect(intended, ownerDocument, realm, pageTarget);
    if (!target) return;
    releaseHover();
    const anchor = makeBinding(target, "hover");
    const placement = moveToBody(ownerDocument, surface);
    hoverBinding = { ...anchor, surface, placement };
    applyAnchor(surface, hoverBinding, "box");
  };

  const clearEditBinding = () => {
    if (!editBinding) return;
    clearAnchorSurface(editBinding.ring);
    editBinding.release();
    editBinding = null;
  };

  const inspectorPlacement = (
    shell: HTMLElement,
    card: HTMLElement,
    targetRect: Rect,
  ) => {
    const measured = card.getBoundingClientRect();
    if (measured.width <= 0 || measured.height <= 0) return;
    const width = measured.width;
    const height = measured.height;
    const viewportRight = ownerWindow.innerWidth - VIEWPORT_PADDING;
    const viewportBottom = ownerWindow.innerHeight - VIEWPORT_PADDING;
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportRight - width);
    const maxTop = Math.max(VIEWPORT_PADDING, viewportBottom - height);
    const centeredLeft = Math.min(
      Math.max(targetRect.left + targetRect.width / 2 - width / 2, VIEWPORT_PADDING),
      maxLeft,
    );
    const centeredTop = Math.min(
      Math.max(targetRect.top + targetRect.height / 2 - height / 2, VIEWPORT_PADDING),
      maxTop,
    );
    const candidates = [
      { left: centeredLeft, top: targetRect.top - INSPECTOR_GAP - height, placement: "above" },
      { left: centeredLeft, top: targetRect.bottom + INSPECTOR_GAP, placement: "below" },
      { left: targetRect.right + INSPECTOR_GAP, top: centeredTop, placement: "side" },
      { left: targetRect.left - INSPECTOR_GAP - width, top: centeredTop, placement: "side" },
    ];
    const fits = (left: number, top: number) => left >= VIEWPORT_PADDING
      && top >= VIEWPORT_PADDING
      && left + width <= viewportRight
      && top + height <= viewportBottom;
    const overlaps = (left: number, top: number) => (
      Math.max(0, Math.min(left + width, targetRect.right) - Math.max(left, targetRect.left)) > 0
      && Math.max(0, Math.min(top + height, targetRect.bottom) - Math.max(top, targetRect.top)) > 0
    );
    const full = candidates.find((candidate) => fits(candidate.left, candidate.top) && !overlaps(candidate.left, candidate.top));

    let left = centeredLeft;
    let top = VIEWPORT_PADDING;
    let placement = "viewport";
    if (full) {
      ({ left, top, placement } = full);
      card.style.maxHeight = `calc(100vh - ${VIEWPORT_PADDING * 2}px)`;
    } else {
      const lanes = [
        { name: "above", top: VIEWPORT_PADDING, height: Math.max(0, targetRect.top - INSPECTOR_GAP - VIEWPORT_PADDING) },
        { name: "below", top: targetRect.bottom + INSPECTOR_GAP, height: Math.max(0, viewportBottom - targetRect.bottom - INSPECTOR_GAP) },
      ].sort((a, b) => b.height - a.height);
      const lane = lanes[0];
      if (lane && lane.height > 0) {
        top = lane.top;
        placement = lane.name;
        card.style.maxHeight = `${lane.height}px`;
      }
    }

    shell.style.setProperty("--mesurer-native-anchor-x", `${left - targetRect.left}px`);
    shell.style.setProperty("--mesurer-native-anchor-y", `${top - targetRect.top}px`);
    card.dataset.mesurerTextInspectorPlacement = placement;
  };

  const stabilizeEdit = () => {
    if (!runtimeMount?.isConnected) {
      clearEditBinding();
      return;
    }
    const rings = runtimeMount.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const ring = editBinding?.ring.isConnected ? editBinding.ring : rings.item(rings.length - 1);
    if (!ring?.isConnected) {
      clearEditBinding();
      return;
    }

    const intendedRing = inlineRect(ring);
    if (!editBinding || editBinding.ring !== ring || !editBinding.target.isConnected
      || (!scrolling && !sameRect(rectFromDom(editBinding.target.getBoundingClientRect()), intendedRing))) {
      const target = findTargetForRect(intendedRing, ownerDocument, realm, pageTarget);
      if (target) {
        clearEditBinding();
        const anchor = makeBinding(target, "edit");
        editBinding = { ...anchor, ring };
      }
    }
    if (!editBinding) return;

    applyAnchor(ring, editBinding, "box");
    const targetRect = rectFromDom(editBinding.target.getBoundingClientRect());

    const highlights = new Set<HTMLElement>();
    for (const highlight of ownerDocument.querySelectorAll<HTMLElement>("[data-mesurer-text-selection-highlight='true']")) {
      if (!highlight.isConnected) continue;
      highlights.add(highlight);
      const intended = inlineRect(highlight);
      if (!highlightPlacements.has(highlight)) {
        highlightPlacements.set(highlight, moveToBody(ownerDocument, highlight));
      }
      applyAnchor(highlight, editBinding, "offset");
      if (!scrolling) {
        highlight.style.setProperty("--mesurer-native-anchor-x", `${intended.left - targetRect.left}px`);
        highlight.style.setProperty("--mesurer-native-anchor-y", `${intended.top - targetRect.top}px`);
      }
    }
    for (const [highlight, placement] of Array.from(highlightPlacements)) {
      if (highlights.has(highlight) && highlight.isConnected) continue;
      clearAnchorSurface(highlight);
      placement.release();
      highlightPlacements.delete(highlight);
    }

    const shell = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-placement-shell='true']");
    const card = runtimeMount.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    if (shell?.isConnected && card?.isConnected) {
      const alreadyAnchored = shell.dataset.mesurerNativeScrollOwner === "typography"
        && shell.dataset.mesurerNativeScrollAnchor === "offset";
      shell.dataset.mesurerNativeScrollOwner = "typography";
      applyAnchor(shell, editBinding, "offset");
      // A newly claimed shell still carries its fallback fixed-position lane.
      // Resolve its native offset immediately even if a prior scrollIntoView is
      // still settling; established anchors remain compositor-only on scroll.
      if (!scrolling || !alreadyAnchored) inspectorPlacement(shell, card, targetRect);
    }
  };

  const releaseInspectorPair = (binding: InspectorPairBinding) => {
    clearAnchorSurface(binding.box);
    clearAnchorSurface(binding.card);
    binding.release();
  };

  const stabilizeStandaloneInspector = () => {
    const overlays = new Set<HTMLElement>();
    for (const existing of inspectorOverlayPlacements.keys()) if (existing.isConnected) overlays.add(existing);
    for (const box of portalTarget.querySelectorAll<HTMLElement>(".mesurer-ti-box")) {
      const overlay = box.parentElement;
      if (overlay?.dataset.mesurerInspectorUi === "true") overlays.add(overlay);
    }

    const liveBoxes = new Set<HTMLElement>();
    for (const overlay of overlays) {
      const children = Array.from(overlay.children).filter((child): child is HTMLElement => child instanceof realm.HTMLElement);
      const visiblePairs: Array<{ box: HTMLElement; card: HTMLElement | null }> = [];
      for (let index = 0; index < children.length; index += 1) {
        const box = children[index];
        if (!box.classList.contains("mesurer-ti-box") || box.dataset.state !== "visible") continue;
        const next = children[index + 1];
        const card = next?.classList.contains("mesurer-ti-card") ? next : null;
        visiblePairs.push({ box, card });
        liveBoxes.add(box);
      }
      if (!visiblePairs.length) continue;

      if (!inspectorOverlayPlacements.has(overlay)) {
        inspectorOverlayPlacements.set(overlay, moveToBody(ownerDocument, overlay, "inspector-overlay"));
      }

      for (const { box, card } of visiblePairs) {
        const intended = inlineRect(box);
        let binding = inspectorPairBindings.get(box);
        if (!binding?.target.isConnected || (!scrolling && !sameRect(rectFromDom(binding.target.getBoundingClientRect()), intended))) {
          if (binding) releaseInspectorPair(binding);
          const target = findTargetForRect(intended, ownerDocument, realm, pageTarget);
          if (!target) {
            inspectorPairBindings.delete(box);
            continue;
          }
          binding = { ...makeBinding(target, "typography"), box, card };
          inspectorPairBindings.set(box, binding);
        }
        box.dataset.mesurerNativeScrollOwner = "typography";
        applyAnchor(box, binding, "box");
        if (card?.isConnected && !card.classList.contains("mesurer-ti-card--pinned")) {
          card.dataset.mesurerNativeScrollOwner = "typography";
          applyAnchor(card, binding, "offset");
          if (!scrolling) {
            const targetRect = rectFromDom(binding.target.getBoundingClientRect());
            const cardLeft = Number.parseFloat(card.style.left);
            const cardTop = Number.parseFloat(card.style.top);
            if (Number.isFinite(cardLeft)) card.style.setProperty("--mesurer-native-anchor-x", `${cardLeft - targetRect.left}px`);
            if (Number.isFinite(cardTop)) card.style.setProperty("--mesurer-native-anchor-y", `${cardTop - targetRect.top}px`);
          }
        } else if (card) {
          clearAnchorSurface(card);
        }
      }
    }

    for (const [box, binding] of Array.from(inspectorPairBindings)) {
      if (liveBoxes.has(box) && box.isConnected) continue;
      releaseInspectorPair(binding);
      inspectorPairBindings.delete(box);
    }
    for (const [overlay, placement] of Array.from(inspectorOverlayPlacements)) {
      if (overlay.isConnected) continue;
      placement.release();
      inspectorOverlayPlacements.delete(overlay);
    }
  };

  const stabilize = () => {
    if (disposed) return;
    stabilizeSelections();
    stabilizeHover();
    stabilizeEdit();
    stabilizeStandaloneInspector();
  };

  const schedule = (withFrame = false) => {
    if (disposed) return;
    if (!queued) {
      queued = true;
      ownerWindow.queueMicrotask(() => {
        queued = false;
        stabilize();
      });
    }
    if (withFrame && !frame) {
      frame = ownerWindow.requestAnimationFrame(() => {
        frame = 0;
        stabilize();
      });
    }
  };

  const observer = new realm.MutationObserver(() => {
    if (!scrolling) schedule();
  });
  observer.observe(portalTarget, {
    subtree: true,
    childList: true,
  });
  if (runtimeMount) {
    observer.observe(runtimeMount, {
      subtree: true,
      childList: true,
    });
  }

  const onScroll = () => {
    scrolling = true;
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scrolling = false;
      schedule(true);
    }, SCROLL_IDLE_MS);
  };
  const onActivity = () => schedule(true);

  ownerWindow.addEventListener("scroll", onScroll, true);
  ownerWindow.addEventListener("resize", onActivity, true);
  ownerWindow.addEventListener("pointermove", onActivity, true);
  ownerWindow.addEventListener("pointerup", onActivity, true);
  ownerWindow.addEventListener("dblclick", onActivity, true);
  schedule(true);

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    ownerWindow.removeEventListener("resize", onActivity, true);
    ownerWindow.removeEventListener("pointermove", onActivity, true);
    ownerWindow.removeEventListener("pointerup", onActivity, true);
    ownerWindow.removeEventListener("dblclick", onActivity, true);

    for (const binding of selectionBindings.values()) releaseSelection(binding);
    selectionBindings.clear();
    releaseHover();
    clearEditBinding();
    for (const [highlight, placement] of highlightPlacements) {
      clearAnchorSurface(highlight);
      placement.release();
    }
    highlightPlacements.clear();
    for (const binding of inspectorPairBindings.values()) releaseInspectorPair(binding);
    inspectorPairBindings.clear();
    for (const placement of inspectorOverlayPlacements.values()) placement.release();
    inspectorOverlayPlacements.clear();
    if (runtimeMount) delete runtimeMount.dataset.mesurerNativeScrollRuntimeLayer;
    runtimePlacement?.release();
    workspace.dispose();
    for (const [target, state] of targetAnchors) {
      if (state.original) target.style.setProperty("anchor-name", state.original, state.originalPriority);
      else target.style.removeProperty("anchor-name");
    }
    targetAnchors.clear();
    style.remove();
  });
}
