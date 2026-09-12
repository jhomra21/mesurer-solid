import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const VIEWPORT_PADDING = 8;
const SURFACE_GAP = 8;
const RECT_TOLERANCE = 4;
const MEASUREMENT_ROOT = "[data-mesurer-measurement='true']";
const EDITOR = "[data-mesurer-text-editor='true']";
const EDIT_RING = "[data-mesurer-text-edit-ring='true']";
const INSPECTOR_CARD = "[data-mesurer-text-inspector-info='true']";
const INSPECTOR_SHELL = "[data-mesurer-text-inspector-placement-shell='true']";
const CLEARANCE_MARKER = "data-mesurer-measurement-label-clearance";

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Placement = {
  left: number;
  top: number;
  placement: "above" | "below" | "side" | "viewport";
  maxHeight: number | null;
};

type StyleSnapshot = {
  value: string;
  priority: string;
};

type AdjustmentSnapshot = {
  shell: HTMLElement;
  card: HTMLElement;
  shellLeft: StyleSnapshot;
  shellTop: StyleSnapshot;
  anchorX: StyleSnapshot;
  anchorY: StyleSnapshot;
  cardMaxHeight: StyleSnapshot;
  placement: string | null;
  marker: string | null;
};

const rectFromDom = (rect: DOMRect): Rect => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

const sameRect = (left: Rect, right: Rect, tolerance = RECT_TOLERANCE) => (
  Math.abs(left.left - right.left) <= tolerance
  && Math.abs(left.top - right.top) <= tolerance
  && Math.abs(left.width - right.width) <= tolerance
  && Math.abs(left.height - right.height) <= tolerance
);

export const rectsOverlap = (left: Rect, right: Rect) => (
  Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) > 0
  && Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)) > 0
);

const unionRects = (rects: Rect[]) => rects.reduce((result, rect) => ({
  left: Math.min(result.left, rect.left),
  top: Math.min(result.top, rect.top),
  right: Math.max(result.right, rect.right),
  bottom: Math.max(result.bottom, rect.bottom),
  width: Math.max(result.right, rect.right) - Math.min(result.left, rect.left),
  height: Math.max(result.bottom, rect.bottom) - Math.min(result.top, rect.top),
}));

export function resolveMeasurementAwareInspectorPlacement(
  host: Rect,
  measurementLabels: Rect[],
  cardSize: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement {
  const protectedRect = measurementLabels.length
    ? unionRects([host, ...measurementLabels])
    : host;
  const width = cardSize.width;
  const height = cardSize.height;
  const viewportRight = viewport.width - VIEWPORT_PADDING;
  const viewportBottom = viewport.height - VIEWPORT_PADDING;
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportRight - width);
  const maxTop = Math.max(VIEWPORT_PADDING, viewportBottom - height);
  const centeredLeft = Math.min(
    Math.max(host.left + host.width / 2 - width / 2, VIEWPORT_PADDING),
    maxLeft,
  );
  const centeredTop = Math.min(
    Math.max(host.top + host.height / 2 - height / 2, VIEWPORT_PADDING),
    maxTop,
  );

  const candidates: Placement[] = [
    {
      left: centeredLeft,
      top: protectedRect.top - SURFACE_GAP - height,
      placement: "above",
      maxHeight: null,
    },
    {
      left: centeredLeft,
      top: protectedRect.bottom + SURFACE_GAP,
      placement: "below",
      maxHeight: null,
    },
    {
      left: protectedRect.right + SURFACE_GAP,
      top: centeredTop,
      placement: "side",
      maxHeight: null,
    },
    {
      left: protectedRect.left - SURFACE_GAP - width,
      top: centeredTop,
      placement: "side",
      maxHeight: null,
    },
  ];
  const fits = (candidate: Placement) => candidate.left >= VIEWPORT_PADDING
    && candidate.top >= VIEWPORT_PADDING
    && candidate.left + width <= viewportRight
    && candidate.top + height <= viewportBottom;
  const full = candidates.find((candidate) => fits(candidate));
  if (full) return full;

  const lanes = [
    {
      placement: "above" as const,
      top: VIEWPORT_PADDING,
      height: Math.max(0, protectedRect.top - SURFACE_GAP - VIEWPORT_PADDING),
    },
    {
      placement: "below" as const,
      top: protectedRect.bottom + SURFACE_GAP,
      height: Math.max(0, viewportBottom - protectedRect.bottom - SURFACE_GAP),
    },
  ].sort((left, right) => right.height - left.height);
  const lane = lanes[0];
  if (lane && lane.height > 0) {
    return {
      left: centeredLeft,
      top: lane.top,
      placement: lane.placement,
      maxHeight: lane.height,
    };
  }

  return {
    left: centeredLeft,
    top: VIEWPORT_PADDING,
    placement: "viewport",
    maxHeight: Math.max(0, viewport.height - VIEWPORT_PADDING * 2),
  };
}

const styleSnapshot = (element: HTMLElement, property: string): StyleSnapshot => ({
  value: element.style.getPropertyValue(property),
  priority: element.style.getPropertyPriority(property),
});

const restoreStyle = (element: HTMLElement, property: string, snapshot: StyleSnapshot) => {
  if (snapshot.value || snapshot.priority) {
    element.style.setProperty(property, snapshot.value, snapshot.priority);
  } else {
    element.style.removeProperty(property);
  }
};

const visibleMeasurementLabelRects = (
  scopes: ParentNode[],
  host: Rect,
  realm: Window & typeof globalThis,
) => {
  const roots = new Set<HTMLElement>();
  for (const scope of scopes) {
    for (const root of scope.querySelectorAll<HTMLElement>(MEASUREMENT_ROOT)) roots.add(root);
  }

  const labels: Rect[] = [];
  for (const root of roots) {
    const rootStyle = realm.getComputedStyle(root);
    if (
      rootStyle.display === "none"
      || rootStyle.visibility === "hidden"
      || Number.parseFloat(rootStyle.opacity) <= 0.01
    ) continue;

    const children = Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof realm.HTMLElement);
    if (children.length < 2) continue;
    const label = children[children.length - 1];
    const chrome = children.slice(0, -1).find((child) => {
      const rect = rectFromDom(child.getBoundingClientRect());
      return rect.width > 0 && rect.height > 0 && sameRect(rect, host);
    });
    if (!chrome) continue;

    const labelStyle = realm.getComputedStyle(label);
    if (labelStyle.display === "none" || labelStyle.visibility === "hidden") continue;
    const labelRect = rectFromDom(label.getBoundingClientRect());
    if (labelRect.width <= 0 || labelRect.height <= 0) continue;
    labels.push(labelRect);
  }
  return labels;
};

/**
 * Keep the selected element's dimensions pill readable when direct-edit
 * Typography is placed beside it. The canonical inspector placers still own the
 * normal lane choice; this adapter only intervenes when a visible MeasurementBox
 * label actually intersects the interactive Typography card.
 */
export function installTextEditingMeasurementLabelClearance(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
  sourcePortalTarget: HTMLElement | ShadowRoot = runtime.portalTarget,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns every runtime/source portal node inspected here,
  // so its DOM constructors are the correct realm for instanceof checks.
  const realm = ownerWindow as Window & typeof globalThis;
  const runtimeMounts = portalTarget.querySelectorAll<HTMLElement>("[data-mesurer-text-edit-runtime='true']");
  const runtimeMount = runtimeMounts.item(runtimeMounts.length - 1);
  if (!runtimeMount) return;

  const workspace = runtime.createWorkspaceRuntime();
  let adjustment: AdjustmentSnapshot | null = null;
  let queued = false;
  let frame = 0;
  let disposed = false;

  const scopes = () => {
    const values: ParentNode[] = [portalTarget];
    if (sourcePortalTarget !== portalTarget) values.push(sourcePortalTarget);
    if (ownerDocument.body && !values.includes(ownerDocument.body)) values.push(ownerDocument.body);
    return values;
  };

  const restoreAdjustment = () => {
    const snapshot = adjustment;
    if (!snapshot) return;
    const { shell, card } = snapshot;
    if (shell.isConnected) {
      restoreStyle(shell, "left", snapshot.shellLeft);
      restoreStyle(shell, "top", snapshot.shellTop);
      restoreStyle(shell, "--mesurer-native-anchor-x", snapshot.anchorX);
      restoreStyle(shell, "--mesurer-native-anchor-y", snapshot.anchorY);
      if (snapshot.marker === null) shell.removeAttribute(CLEARANCE_MARKER);
      else shell.setAttribute(CLEARANCE_MARKER, snapshot.marker);
    }
    if (card.isConnected) {
      restoreStyle(card, "max-height", snapshot.cardMaxHeight);
      if (snapshot.placement === null) delete card.dataset.mesurerTextInspectorPlacement;
      else card.dataset.mesurerTextInspectorPlacement = snapshot.placement;
    }
    adjustment = null;
  };

  const captureAdjustment = (shell: HTMLElement, card: HTMLElement) => {
    adjustment = {
      shell,
      card,
      shellLeft: styleSnapshot(shell, "left"),
      shellTop: styleSnapshot(shell, "top"),
      anchorX: styleSnapshot(shell, "--mesurer-native-anchor-x"),
      anchorY: styleSnapshot(shell, "--mesurer-native-anchor-y"),
      cardMaxHeight: styleSnapshot(card, "max-height"),
      placement: card.getAttribute("data-mesurer-text-inspector-placement"),
      marker: shell.getAttribute(CLEARANCE_MARKER),
    };
  };

  const sync = () => {
    if (disposed) return;
    const editor = runtimeMount.querySelector<HTMLTextAreaElement>(EDITOR);
    const shell = runtimeMount.querySelector<HTMLElement>(INSPECTOR_SHELL);
    const card = runtimeMount.querySelector<HTMLElement>(INSPECTOR_CARD);
    const rings = runtimeMount.querySelectorAll<HTMLElement>(EDIT_RING);
    const ring = rings.item(rings.length - 1);
    if (!editor?.isConnected || !shell?.isConnected || !card?.isConnected || !ring?.isConnected) {
      restoreAdjustment();
      return;
    }

    if (adjustment && (adjustment.shell !== shell || adjustment.card !== card)) {
      restoreAdjustment();
    }

    const host = rectFromDom(ring.getBoundingClientRect());
    if (host.width <= 0 || host.height <= 0) return;
    const labels = visibleMeasurementLabelRects(scopes(), host, realm);
    if (!labels.length) {
      restoreAdjustment();
      return;
    }

    const cardRect = rectFromDom(card.getBoundingClientRect());
    const intersectsLabel = labels.some((label) => rectsOverlap(cardRect, label));
    if (!adjustment && !intersectsLabel) return;
    if (!adjustment) captureAdjustment(shell, card);

    const fullHeight = Math.max(cardRect.height, card.scrollHeight);
    const next = resolveMeasurementAwareInspectorPlacement(
      host,
      labels,
      { width: cardRect.width, height: fullHeight },
      { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
    );
    const nativeAnchored = shell.dataset.mesurerNativeScrollOwner === "typography"
      && shell.dataset.mesurerNativeScrollAnchor === "offset";
    if (nativeAnchored) {
      shell.style.setProperty("--mesurer-native-anchor-x", `${next.left - host.left}px`);
      shell.style.setProperty("--mesurer-native-anchor-y", `${next.top - host.top}px`);
    } else {
      shell.style.left = `${next.left}px`;
      shell.style.top = `${next.top}px`;
    }

    if (next.maxHeight === null && adjustment) {
      restoreStyle(card, "max-height", adjustment.cardMaxHeight);
    } else if (next.maxHeight !== null) {
      card.style.maxHeight = `${next.maxHeight}px`;
    }
    card.dataset.mesurerTextInspectorPlacement = next.placement;
    shell.setAttribute(CLEARANCE_MARKER, "true");
  };

  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    ownerWindow.queueMicrotask(() => {
      queued = false;
      sync();
      if (frame) return;
      frame = ownerWindow.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    });
  };

  const runtimeObserver = new realm.MutationObserver(schedule);
  runtimeObserver.observe(runtimeMount, { childList: true, subtree: true });
  const sourceObserver = sourcePortalTarget === portalTarget
    ? null
    : new realm.MutationObserver(schedule);
  sourceObserver?.observe(sourcePortalTarget, { childList: true, subtree: true });
  const unsubscribeWorkspace = workspace.subscribe(schedule);
  ownerWindow.addEventListener("resize", schedule, true);
  schedule();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    runtimeObserver.disconnect();
    sourceObserver?.disconnect();
    unsubscribeWorkspace();
    workspace.dispose();
    ownerWindow.removeEventListener("resize", schedule, true);
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    restoreAdjustment();
  });
}
