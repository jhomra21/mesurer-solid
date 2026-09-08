import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type AnchorBinding = {
  target: HTMLElement;
  name: string;
  release: () => void;
};

type TargetAnchorState = {
  base: string;
  basePriority: string;
  names: Set<string>;
};

let anchorSequence = 0;
const MATCH_TOLERANCE = 3;
const SCROLL_IDLE_MS = 90;

const rectFrom = (left: number, top: number, width: number, height: number): RectLike => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const domRect = (rect: DOMRect): RectLike => rectFrom(rect.left, rect.top, rect.width, rect.height);

const inlineRect = (element: HTMLElement): RectLike => {
  const style = element.style;
  const left = Number.parseFloat(style.left);
  const top = Number.parseFloat(style.top);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  if ([left, top, width, height].every(Number.isFinite)) return rectFrom(left, top, width, height);
  return domRect(element.getBoundingClientRect());
};

const rectDistance = (left: RectLike, right: RectLike) => Math.max(
  Math.abs(left.left - right.left),
  Math.abs(left.top - right.top),
  Math.abs(left.width - right.width),
  Math.abs(left.height - right.height),
);

const sameRect = (left: RectLike, right: RectLike, tolerance = MATCH_TOLERANCE) =>
  rectDistance(left, right) <= tolerance;

const anchorSupported = (ownerWindow: Window & typeof globalThis) => Boolean(
  ownerWindow.CSS?.supports?.("anchor-name: --mesurer-native-anchor")
  && ownerWindow.CSS.supports("position-anchor: --mesurer-native-anchor")
  && ownerWindow.CSS.supports("left: anchor(left)")
  && ownerWindow.CSS.supports("width: anchor-size(width)"),
);

const setImportant = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) === value
    && element.style.getPropertyPriority(property) === "important") return;
  element.style.setProperty(property, value, "important");
};

const setStyle = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) === value) return;
  element.style.setProperty(property, value);
};

const clearSurface = (element: HTMLElement | null | undefined) => {
  if (!element) return;
  delete element.dataset.mesurerNativeScrollAnchor;
  element.style.removeProperty("position-anchor");
  element.style.removeProperty("--mesurer-native-anchor-x");
  element.style.removeProperty("--mesurer-native-anchor-y");
};

const pageContains = (
  pageTarget: HTMLElement | ShadowRoot,
  element: HTMLElement,
) => pageTarget === element || pageTarget.contains(element);

const inspectorElement = (element: HTMLElement) => Boolean(
  element.closest("[data-mesurer-root='true'], [data-mesurer-inspector-ui='true']"),
);

const samplePoints = (rect: RectLike, ownerWindow: Window) => {
  const insetX = Math.min(Math.max(rect.width * 0.2, 1), Math.max(1, rect.width / 2));
  const insetY = Math.min(Math.max(rect.height * 0.2, 1), Math.max(1, rect.height / 2));
  const raw = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + insetX, rect.top + insetY],
    [rect.right - insetX, rect.top + insetY],
    [rect.left + insetX, rect.bottom - insetY],
    [rect.right - insetX, rect.bottom - insetY],
  ];
  return raw.filter(([x, y]) => x >= 0 && y >= 0 && x < ownerWindow.innerWidth && y < ownerWindow.innerHeight);
};

const findTargetForRect = (
  rect: RectLike,
  ownerDocument: Document,
  ownerWindow: Window & typeof globalThis,
  pageTarget: HTMLElement | ShadowRoot,
) => {
  let best: { element: HTMLElement; distance: number } | null = null;
  for (const [x, y] of samplePoints(rect, ownerWindow)) {
    const elements = pageTarget instanceof ownerWindow.ShadowRoot
      ? pageTarget.elementsFromPoint(x, y)
      : ownerDocument.elementsFromPoint(x, y);
    for (const candidate of elements) {
      if (!(candidate instanceof ownerWindow.HTMLElement)) continue;
      if (!pageContains(pageTarget, candidate) || inspectorElement(candidate)) continue;
      const candidateRect = domRect(candidate.getBoundingClientRect());
      const distance = rectDistance(candidateRect, rect);
      if (!best || distance < best.distance) best = { element: candidate, distance };
      if (distance <= MATCH_TOLERANCE) return candidate;
    }
  }
  return best && best.distance <= 8 ? best.element : null;
};

export function installNativeScrollAnchoring(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, pageTarget, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument, so its DOM constructors
  // are the correct realm for portalTarget/pageTarget instanceof checks in this runtime.
  const realm = ownerWindow as Window & typeof globalThis;
  if (!anchorSupported(realm)) return;

  const targetAnchors = new Map<HTMLElement, TargetAnchorState>();
  const selectionBindings = new Map<HTMLElement, AnchorBinding>();
  let hoverBinding: (AnchorBinding & { surface: HTMLElement }) | null = null;
  let editBinding: (AnchorBinding & { ring: HTMLElement }) | null = null;
  let disposed = false;
  let queued = false;
  let frame = 0;
  let scrollIdleTimer = 0;
  let scrolling = false;

  const style = ownerDocument.createElement("style");
  style.dataset.mesurerNativeScrollAnchoring = "true";
  style.dataset.mesurerInspectorUi = "true";
  style.textContent = `
[data-mesurer-native-scroll-anchor="box"] {
  position: fixed !important;
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
  position: fixed !important;
  left: anchor(center) !important;
  top: calc(anchor(bottom) + 4px) !important;
  right: auto !important;
  bottom: auto !important;
  transition: none !important;
  animation: none !important;
}
[data-mesurer-native-scroll-anchor="offset"] {
  position: fixed !important;
  left: calc(anchor(left) + var(--mesurer-native-anchor-x, 0px)) !important;
  top: calc(anchor(top) + var(--mesurer-native-anchor-y, 0px)) !important;
  right: auto !important;
  bottom: auto !important;
  transition: none !important;
  animation: none !important;
}
`;
  if (portalTarget instanceof realm.ShadowRoot) portalTarget.append(style);
  else ownerDocument.head.append(style);

  const nextAnchorName = (kind: string) => `--mesurer-${kind}-${++anchorSequence}`;

  const syncTargetAnchors = (target: HTMLElement, state: TargetAnchorState) => {
    const names = [...state.names];
    const base = state.base.trim();
    const combined = [base && base !== "none" ? base : "", ...names].filter(Boolean).join(", ");
    if (combined) target.style.setProperty("anchor-name", combined, state.basePriority);
    else target.style.removeProperty("anchor-name");
  };

  const addTargetAnchor = (target: HTMLElement, name: string) => {
    let state = targetAnchors.get(target);
    if (!state) {
      state = {
        base: target.style.getPropertyValue("anchor-name"),
        basePriority: target.style.getPropertyPriority("anchor-name"),
        names: new Set(),
      };
      targetAnchors.set(target, state);
    }
    state.names.add(name);
    syncTargetAnchors(target, state);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = targetAnchors.get(target);
      if (!current) return;
      current.names.delete(name);
      if (current.names.size > 0) {
        syncTargetAnchors(target, current);
        return;
      }
      if (current.base) target.style.setProperty("anchor-name", current.base, current.basePriority);
      else target.style.removeProperty("anchor-name");
      targetAnchors.delete(target);
    };
  };

  const makeBinding = (target: HTMLElement, kind: string): AnchorBinding => {
    const name = nextAnchorName(kind);
    return { target, name, release: addTargetAnchor(target, name) };
  };

  const applyAnchor = (surface: HTMLElement, binding: AnchorBinding, kind: "box" | "label" | "offset") => {
    surface.dataset.mesurerNativeScrollAnchor = kind;
    setImportant(surface, "position-anchor", binding.name);
  };

  const bindSelection = (root: HTMLElement, target: HTMLElement) => {
    selectionBindings.get(root)?.release();
    const binding = makeBinding(target, "selection");
    selectionBindings.set(root, binding);
    const chrome = root.children.item(0);
    const label = root.children.item(root.children.length - 1);
    if (chrome instanceof realm.HTMLElement) applyAnchor(chrome, binding, "box");
    if (label instanceof realm.HTMLElement && label !== chrome) applyAnchor(label, binding, "label");
  };

  const stabilizeSelections = () => {
    const roots = Array.from(portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-selected-measurement='true']"))
      .filter((root) => root.dataset.mesurerSelectionGroup !== "true");
    const liveRoots = new Set(roots);

    for (const root of roots) {
      const chrome = root.children.item(0);
      if (!(chrome instanceof realm.HTMLElement)) continue;
      const existing = selectionBindings.get(root);
      if (existing?.target.isConnected) {
        applyAnchor(chrome, existing, "box");
        const label = root.children.item(root.children.length - 1);
        if (label instanceof realm.HTMLElement && label !== chrome) applyAnchor(label, existing, "label");
        if (scrolling) continue;
        const intended = inlineRect(chrome);
        if (sameRect(domRect(existing.target.getBoundingClientRect()), intended, 5)) continue;
      }

      const intended = inlineRect(chrome);
      const target = findTargetForRect(intended, ownerDocument, realm, pageTarget);
      if (!target || target.getRootNode() !== chrome.getRootNode()) continue;
      bindSelection(root, target);
    }

    for (const [root, binding] of selectionBindings) {
      if (liveRoots.has(root) && root.isConnected) continue;
      binding.release();
      selectionBindings.delete(root);
    }
  };

  const stabilizeHover = () => {
    const surface = portalTarget.querySelector<HTMLElement>("[data-mesurer-hover-measurement='true']");
    if (!surface?.isConnected) {
      if (hoverBinding) {
        hoverBinding.release();
        hoverBinding = null;
      }
      return;
    }

    if (hoverBinding?.surface === surface && hoverBinding.target.isConnected) {
      applyAnchor(surface, hoverBinding, "box");
      if (scrolling) return;
      if (sameRect(domRect(hoverBinding.target.getBoundingClientRect()), inlineRect(surface), 5)) return;
    }

    const target = findTargetForRect(inlineRect(surface), ownerDocument, realm, pageTarget);
    if (!target || target.getRootNode() !== surface.getRootNode()) return;
    hoverBinding?.release();
    const binding = makeBinding(target, "hover");
    hoverBinding = { ...binding, surface };
    applyAnchor(surface, hoverBinding, "box");
  };

  const clearEditBinding = () => {
    if (!editBinding) return;
    editBinding.release();
    clearSurface(editBinding.ring);
    editBinding = null;
  };

  const stabilizeEdit = () => {
    const rings = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-ring='true']");
    const ring = rings.item(rings.length - 1);
    if (!ring?.isConnected) {
      clearEditBinding();
      return;
    }

    if (!editBinding || editBinding.ring !== ring || !editBinding.target.isConnected) {
      clearEditBinding();
      const target = findTargetForRect(inlineRect(ring), ownerDocument, realm, pageTarget);
      if (!target || target.getRootNode() !== ring.getRootNode()) return;
      const binding = makeBinding(target, "edit");
      editBinding = { ...binding, ring };
    }

    const binding = editBinding;
    applyAnchor(ring, binding, "box");
    const targetRect = domRect(binding.target.getBoundingClientRect());

    for (const highlight of portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-selection-highlight='true']")) {
      applyAnchor(highlight, binding, "offset");
      if (!scrolling) {
        const intended = inlineRect(highlight);
        setStyle(highlight, "--mesurer-native-anchor-x", `${intended.left - targetRect.left}px`);
        setStyle(highlight, "--mesurer-native-anchor-y", `${intended.top - targetRect.top}px`);
      }
    }

    const shell = portalTarget.querySelector<HTMLElement>("[data-mesurer-text-inspector-placement-shell='true']");
    const card = portalTarget.querySelector<HTMLElement>("[data-mesurer-text-inspector-info='true']");
    if (shell?.isConnected && card?.dataset.mesurerTextInspectorPlacement
      && shell.dataset.mesurerNativeScrollAnchor !== "offset") {
      const intended = inlineRect(shell);
      applyAnchor(shell, binding, "offset");
      setStyle(shell, "--mesurer-native-anchor-x", `${intended.left - targetRect.left}px`);
      setStyle(shell, "--mesurer-native-anchor-y", `${intended.top - targetRect.top}px`);
      shell.dataset.mesurerNativeAnchorPlacement = card.dataset.mesurerTextInspectorPlacement;
    }
  };

  const stabilize = () => {
    if (disposed) return;
    stabilizeSelections();
    stabilizeHover();
    stabilizeEdit();
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

  const observer = new realm.MutationObserver(() => schedule());
  observer.observe(portalTarget, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
  });

  const onScroll = () => {
    scrolling = true;
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = ownerWindow.setTimeout(() => {
      scrollIdleTimer = 0;
      scrolling = false;
      schedule(true);
    }, SCROLL_IDLE_MS);
    schedule();
  };
  const onPointerActivity = () => schedule(true);

  ownerWindow.addEventListener("scroll", onScroll, true);
  ownerWindow.addEventListener("resize", onPointerActivity, true);
  ownerWindow.addEventListener("pointermove", onPointerActivity, true);
  ownerWindow.addEventListener("pointerup", onPointerActivity, true);
  ownerWindow.addEventListener("dblclick", onPointerActivity, true);
  schedule(true);

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    observer.disconnect();
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    if (scrollIdleTimer) ownerWindow.clearTimeout(scrollIdleTimer);
    ownerWindow.removeEventListener("scroll", onScroll, true);
    ownerWindow.removeEventListener("resize", onPointerActivity, true);
    ownerWindow.removeEventListener("pointermove", onPointerActivity, true);
    ownerWindow.removeEventListener("pointerup", onPointerActivity, true);
    ownerWindow.removeEventListener("dblclick", onPointerActivity, true);
    for (const binding of selectionBindings.values()) binding.release();
    selectionBindings.clear();
    hoverBinding?.release();
    hoverBinding = null;
    clearEditBinding();
    for (const [target, state] of targetAnchors) {
      if (state.base) target.style.setProperty("anchor-name", state.base, state.basePriority);
      else target.style.removeProperty("anchor-name");
    }
    targetAnchors.clear();
    style.remove();
  });
}
