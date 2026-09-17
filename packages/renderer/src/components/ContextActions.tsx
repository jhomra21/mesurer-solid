import { For, Show, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import type { MesurerAnnotation, MesurerContextRequest, MesurerWorkspaceRuntime } from "../runtime/workspace-context";
import {
  installNestedScrollCompensation,
  type MesurerNestedScrollCompensation,
} from "../runtime/nested-scroll-compensation";
import { layoutAnnotationMarkers } from "./annotation-marker-layout";
import { CloseIcon, CopyIcon, NoteIcon, TrashIcon } from "./Icons";

export type ContextActionsController = {
  openNoteComposer(): void;
  closeNoteComposer(): void;
  abandonNoteComposer(): void;
};

export type ContextActionsProps = {
  runtime: MesurerWorkspaceRuntime;
  onCopy: (request?: MesurerContextRequest) => Promise<void>;
  onController?: (controller: ContextActionsController | null) => void;
  initialTriggerFallback?: "current" | "current-and-next";
  coordinateSpace?: "document" | "viewport";
};

type PositionedRect = { left: number; top: number; width: number; height: number };
type ContextSelectionSnapshot = { elements: HTMLElement[]; region: PositionedRect | null };
type AnnotationScrollBinding = {
  target: HTMLElement;
  anchorName: string | null;
  releaseAnchor: (() => void) | null;
  scroll: MesurerNestedScrollCompensation;
};

type SurfacePlacement = {
  left: number;
  top: number;
  nativeAnchor: boolean;
  anchorName?: string;
  anchorX?: number;
  anchorY?: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const PROTECTED_ANNOTATION_Z_INDEX = "2147483647";
const ANNOTATION_PANEL_Z_INDEX = "2147483646";
const ANNOTATION_HIGHLIGHT_Z_INDEX = "2147483645";
const annotationButtonClass = "msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:text-black msr:outline-none msr:hover:bg-black/4 msr:disabled:cursor-default msr:disabled:opacity-40";
let annotationAnchorSequence = 0;

const anchorNames = (value: string) => value
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0 && name !== "none");

const addAnchorName = (element: HTMLElement, name: string) => {
  const before = element.style.getPropertyValue("anchor-name");
  const beforePriority = element.style.getPropertyPriority("anchor-name");
  const names = anchorNames(before);
  if (!names.includes(name)) {
    element.style.setProperty("anchor-name", [...names, name].join(", "), beforePriority);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = anchorNames(element.style.getPropertyValue("anchor-name"));
    const remaining = current.filter((candidate) => candidate !== name);
    if (remaining.length) {
      element.style.setProperty(
        "anchor-name",
        remaining.join(", "),
        element.style.getPropertyPriority("anchor-name"),
      );
    } else if (before.trim() === "none") {
      element.style.setProperty("anchor-name", before, beforePriority);
    } else {
      element.style.removeProperty("anchor-name");
    }
  };
};

const unionRects = (rects: PositionedRect[]): PositionedRect | null => {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
};

const placeSurfaceNear = (
  rect: PositionedRect,
  width: number,
  height: number,
  ownerWindow: Window,
  gap = 8,
) => {
  const padding = 8;
  const maxLeft = ownerWindow.innerWidth - width - padding;
  const maxTop = ownerWindow.innerHeight - height - padding;
  const right = rect.left + rect.width + gap;
  const left = rect.left - width - gap;
  const positionedLeft = right + width <= ownerWindow.innerWidth - padding
    ? right
    : left >= padding
      ? left
      : clamp(rect.left + rect.width - width, padding, maxLeft);
  const positionedTop = clamp(rect.top, padding, maxTop);
  return { left: positionedLeft, top: positionedTop };
};

const placeComposerNear = (
  rect: PositionedRect,
  width: number,
  height: number,
  ownerWindow: Window,
  gap = 8,
) => {
  const padding = 8;
  const maxLeft = ownerWindow.innerWidth - width - padding;
  const centeredLeft = clamp(rect.left + rect.width / 2 - width / 2, padding, maxLeft);
  const below = rect.top + rect.height + gap;
  if (below + height <= ownerWindow.innerHeight - padding) {
    return { left: centeredLeft, top: below };
  }
  const above = rect.top - height - gap;
  if (above >= padding) {
    return { left: centeredLeft, top: above };
  }
  return placeSurfaceNear(rect, width, height, ownerWindow, gap);
};

export function ContextActions(props: ContextActionsProps) {
  const [revision, setRevision] = createSignal(0);
  const [triggerRevision, setTriggerRevision] = createSignal(0);
  const [activeAnnotationId, setActiveAnnotationId] = createSignal<string | null>(null);
  const [hoveredAnnotationId, setHoveredAnnotationId] = createSignal<string | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = createSignal<string | null>(null);
  const [panelPositions, setPanelPositions] = createSignal<Record<string, { left: number; top: number }>>({});
  const [composerPosition, setComposerPosition] = createSignal<{ left: number; top: number } | null>(null);
  const [noteComposerOpen, setNoteComposerOpen] = createSignal(false);
  const [note, setNote] = createSignal("");
  const [noteError, setNoteError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal<string | null>(null);
  const [draggingSurfaceId, setDraggingSurfaceId] = createSignal<string | null>(null);
  let selectionTriggerAnchorName = `--mesurer-annotation-trigger-${++annotationAnchorSequence}`;
  let fallbackTriggerElement: HTMLElement | null = null;
  let fallbackNextSelection = props.initialTriggerFallback === "current-and-next";
  let composerSelection: ContextSelectionSnapshot | null = null;
  let surfaceDrag: {
    surfaceId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    width: number;
    height: number;
  } | null = null;
  let surfaceDragCleanup: (() => void) | null = null;
  let anchorElement: HTMLSpanElement | undefined;
  let annotationTriggerElement: HTMLButtonElement | undefined;
  let trackedTriggerElement: HTMLElement | null = null;
  let anchoredTriggerElement: HTMLElement | null = null;
  let releaseTriggerAnchor: (() => void) | null = null;
  let nestedTriggerScroll: MesurerNestedScrollCompensation | null = null;
  let triggerResizeObserver: ResizeObserver | null = null;
  let triggerResizeWindow: Window | null = null;
  const annotationScrollBindings = new Map<string, AnnotationScrollBinding>();

  const ownerWindow = () => anchorElement?.ownerDocument.defaultView ?? window;
  const usesViewportCoordinates = () => props.coordinateSpace === "viewport";
  const scrollMode = (nativeAnchor: boolean) => nativeAnchor
    ? "native-anchor"
    : usesViewportCoordinates()
      ? "cached-delta"
      : "document";
  const documentPosition = (position: { left: number; top: number }) => {
    if (usesViewportCoordinates()) return position;
    const currentWindow = ownerWindow();
    return {
      left: position.left + currentWindow.scrollX,
      top: position.top + currentWindow.scrollY,
    };
  };
  const captureSelection = (): ContextSelectionSnapshot => {
    const value = props.runtime.currentSelection();
    return {
      elements: [...value.elements],
      region: value.region ? { ...value.region } : null,
    };
  };
  const sameSelection = (left: ContextSelectionSnapshot, right: ContextSelectionSnapshot) => {
    if (left.elements.length !== right.elements.length) return false;
    if (left.elements.some((element, index) => element !== right.elements[index])) return false;
    if (left.region === right.region) return true;
    if (!left.region || !right.region) return false;
    return left.region.left === right.region.left
      && left.region.top === right.region.top
      && left.region.width === right.region.width
      && left.region.height === right.region.height;
  };
  const resetNoteComposerState = () => {
    composerSelection = null;
    setNote("");
    setNoteComposerOpen(false);
    setNoteError(null);
    setComposerPosition(null);
  };

  const supportsNativeAnchors = () => {
    const currentWindow = ownerWindow();
    return Boolean(
      currentWindow.CSS?.supports("anchor-name: --mesurer-annotation-trigger")
      && currentWindow.CSS.supports("position-anchor: --mesurer-annotation-trigger")
      && currentWindow.CSS.supports("left: anchor(left)"),
    );
  };

  const currentSelectionTriggerElement = () => {
    const elements = props.runtime.currentSelection().elements;
    if (!elements.length) return null;
    const hovered = props.runtime.hoveredElement();
    return elements.find((element) => element === hovered)
      ?? elements.find((element) => hovered && element.contains(hovered))
      ?? elements[0];
  };

  const contextRoot = () => anchorElement?.parentElement;
  const selectionScrollSurfaces = () => {
    const root = contextRoot();
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>(
      "[data-mesurer-annotation-trigger='true'], [data-mesurer-annotation-composer='true']",
    )].filter((surface) => surface !== annotationTriggerElement || anchoredTriggerElement === null);
  };
  const annotationScrollSurfaces = (annotationId: string) => {
    const root = contextRoot();
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>("[data-mesurer-annotation-id]")]
      .filter((surface) => surface.dataset.mesurerAnnotationId === annotationId);
  };

  const releaseAnnotationScrollBinding = (annotationId: string) => {
    const binding = annotationScrollBindings.get(annotationId);
    if (!binding) return;
    binding.scroll.release();
    binding.releaseAnchor?.();
    annotationScrollBindings.delete(annotationId);
  };
  const annotationScrollTarget = (annotationId: string) => {
    const annotation = props.runtime.annotation(annotationId);
    if (!annotation || annotation.anchor.kind !== "elements") return null;
    return annotation.resolvedTargets.find(({ element }) => element?.isConnected)?.element ?? null;
  };
  const canUseNativeAnnotationAnchor = (target: HTMLElement) => Boolean(
    usesViewportCoordinates()
    && anchorElement
    && supportsNativeAnchors()
    && target.getRootNode() === anchorElement.getRootNode()
  );
  const syncAnnotationScrollBinding = (annotationId: string) => {
    const target = annotationScrollTarget(annotationId);
    const existing = annotationScrollBindings.get(annotationId);
    if (!target) {
      if (existing) {
        releaseAnnotationScrollBinding(annotationId);
        setTriggerRevision((value) => value + 1);
      }
      return;
    }
    const useNativeAnchor = canUseNativeAnnotationAnchor(target);
    if (
      existing?.target === target
      && Boolean(existing.anchorName) === useNativeAnchor
    ) {
      existing.scroll.sync();
      return;
    }
    releaseAnnotationScrollBinding(annotationId);
    const currentWindow = target.ownerDocument.defaultView;
    if (!currentWindow) return;
    if (useNativeAnchor) {
      const anchorName = `--mesurer-annotation-${++annotationAnchorSequence}`;
      annotationScrollBindings.set(annotationId, {
        target,
        anchorName,
        releaseAnchor: addAnchorName(target, anchorName),
        scroll: installNestedScrollCompensation(
          currentWindow,
          target,
          () => annotationScrollSurfaces(annotationId),
          { trackWindow: false },
        ),
      });
    } else {
      annotationScrollBindings.set(annotationId, {
        target,
        anchorName: null,
        releaseAnchor: null,
        scroll: installNestedScrollCompensation(
          currentWindow,
          target,
          () => annotationScrollSurfaces(annotationId),
          { trackWindow: usesViewportCoordinates() },
        ),
      });
    }
    setTriggerRevision((value) => value + 1);
  };
  const syncAnnotationScrollBindings = () => {
    const liveIds = new Set(props.runtime.annotations().map((annotation) => annotation.id));
    for (const annotationId of annotationScrollBindings.keys()) {
      if (!liveIds.has(annotationId)) releaseAnnotationScrollBinding(annotationId);
    }
    for (const annotationId of liveIds) syncAnnotationScrollBinding(annotationId);
  };
  const syncAnnotationSurface = (annotationId: string) => {
    ownerWindow().queueMicrotask(() => syncAnnotationScrollBinding(annotationId));
  };
  const reconcileAnnotationGeometry = () => {
    ownerWindow().queueMicrotask(() => {
      syncAnnotationScrollBindings();
      for (const binding of annotationScrollBindings.values()) {
        if (!binding.anchorName) binding.scroll.rebase();
      }
    });
  };

  if (props.initialTriggerFallback) {
    fallbackTriggerElement = currentSelectionTriggerElement();
  }

  const releaseSelectionTriggerAnchor = () => {
    nestedTriggerScroll?.release();
    nestedTriggerScroll = null;
    releaseTriggerAnchor?.();
    releaseTriggerAnchor = null;
    trackedTriggerElement = null;
    anchoredTriggerElement = null;
  };

  const canUseNativeTriggerAnchor = (element: HTMLElement) => Boolean(
    usesViewportCoordinates()
    && anchorElement
    && element !== fallbackTriggerElement
    && supportsNativeAnchors()
    && element.getRootNode() === anchorElement.getRootNode(),
  );

  const syncSelectionTriggerAnchor = () => {
    const element = currentSelectionTriggerElement();
    if (fallbackTriggerElement && element !== fallbackTriggerElement) fallbackTriggerElement = null;
    const previousElement = trackedTriggerElement;
    const shouldUseNative = Boolean(element?.isConnected && canUseNativeTriggerAnchor(element));
    const alreadyNative = anchoredTriggerElement === element;
    if (
      element === trackedTriggerElement
      && element?.isConnected
      && shouldUseNative === alreadyNative
    ) {
      nestedTriggerScroll?.sync();
      return;
    }

    const targetChanged = element !== previousElement;
    const nextAnchorName = targetChanged
      ? `--mesurer-annotation-trigger-${++annotationAnchorSequence}`
      : selectionTriggerAnchorName;
    releaseSelectionTriggerAnchor();
    if (!element?.isConnected) return;
    trackedTriggerElement = element;
    const currentWindow = element.ownerDocument.defaultView;
    if (!currentWindow) return;

    if (shouldUseNative) {
      releaseTriggerAnchor = addAnchorName(element, nextAnchorName);
      anchoredTriggerElement = element;
      selectionTriggerAnchorName = nextAnchorName;
      nestedTriggerScroll = installNestedScrollCompensation(
        currentWindow,
        element,
        selectionScrollSurfaces,
        { trackWindow: false },
      );
      return;
    }

    selectionTriggerAnchorName = nextAnchorName;
    nestedTriggerScroll = installNestedScrollCompensation(
      currentWindow,
      element,
      selectionScrollSurfaces,
      { trackWindow: usesViewportCoordinates() },
    );
  };

  const observeTriggerGeometry = (element: HTMLElement | null) => {
    triggerResizeObserver?.disconnect();
    triggerResizeObserver = null;
    if (!element?.isConnected) return;
    const currentWindow = element.ownerDocument.defaultView;
    if (!currentWindow) return;
    triggerResizeObserver = new currentWindow.ResizeObserver(() => {
      setTriggerRevision((value) => value + 1);
    });
    triggerResizeObserver.observe(element);
  };

  const bindTriggerViewportResize = () => {
    const currentWindow = ownerWindow();
    if (triggerResizeWindow === currentWindow) return;
    triggerResizeWindow?.removeEventListener("resize", bumpTriggerPlacement);
    triggerResizeWindow = currentWindow;
    triggerResizeWindow.addEventListener("resize", bumpTriggerPlacement, { passive: true });
  };

  function bumpTriggerPlacement() {
    setTriggerRevision((value) => value + 1);
  }

  let placementTarget = currentSelectionTriggerElement();
  observeTriggerGeometry(placementTarget);
  const unsubscribe = props.runtime.subscribe(() => {
    const selectGestureActive = props.runtime.selectGestureActive();
    if (noteComposerOpen() && selectGestureActive) {
      fallbackNextSelection = true;
      resetNoteComposerState();
    } else if (
      noteComposerOpen()
      && composerSelection !== null
      && !sameSelection(composerSelection, captureSelection())
    ) {
      fallbackTriggerElement = currentSelectionTriggerElement();
      fallbackNextSelection = false;
      resetNoteComposerState();
    }

    const nextPlacementTarget = currentSelectionTriggerElement();
    const targetChanged = nextPlacementTarget !== placementTarget;
    if (targetChanged) {
      placementTarget = nextPlacementTarget;
      observeTriggerGeometry(placementTarget);
      if (fallbackNextSelection) {
        fallbackNextSelection = false;
        fallbackTriggerElement = nextPlacementTarget;
      }
    }
    syncSelectionTriggerAnchor();
    if (targetChanged) bumpTriggerPlacement();
    setRevision((value) => value + 1);
    reconcileAnnotationGeometry();
  });
  syncSelectionTriggerAnchor();
  ownerWindow().queueMicrotask(syncAnnotationScrollBindings);
  onCleanup(() => {
    triggerResizeObserver?.disconnect();
    triggerResizeObserver = null;
    triggerResizeWindow?.removeEventListener("resize", bumpTriggerPlacement);
    triggerResizeWindow = null;
    releaseSelectionTriggerAnchor();
    for (const annotationId of annotationScrollBindings.keys()) releaseAnnotationScrollBinding(annotationId);
    unsubscribe();
  });

  const selection = createMemo(() => {
    revision();
    return props.runtime.currentSelection();
  });
  const annotations = createMemo(() => {
    revision();
    return props.runtime.annotations();
  });
  const activeAnnotation = createMemo(() => {
    const id = activeAnnotationId();
    return id ? annotations().find((annotation) => annotation.id === id) ?? null : null;
  });
  const highlightedAnnotationId = createMemo(() =>
    hoveredAnnotationId() ?? focusedAnnotationId() ?? activeAnnotationId(),
  );
  const annotationNumber = (annotationId: string) =>
    annotations().findIndex((annotation) => annotation.id === annotationId) + 1;
  const annotationHighlightRects = createMemo(() => {
    revision();
    triggerRevision();
    const annotationId = highlightedAnnotationId();
    if (!annotationId) return [];
    const annotation = props.runtime.annotation(annotationId);
    if (!annotation) return [];
    if (annotation.anchor.kind === "region") {
      return [{ ...annotation.anchor.rect }];
    }
    const rects = annotation.resolvedTargets.flatMap(({ element }) => {
      if (!element?.isConnected) return [];
      const rect = element.getBoundingClientRect();
      return [{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }];
    });
    if (rects.length) return rects;
    const fallback = props.runtime.annotationRect(annotationId);
    return fallback ? [{ ...fallback }] : [];
  });
  const hasSelection = () => selection().elements.length > 0 || selection().region !== null;
  const composerOwnsCurrentSelection = () => {
    revision();
    const captured = composerSelection;
    return captured !== null && sameSelection(captured, captureSelection());
  };
  const selectionObstacleRects = createMemo(() => {
    const value = selection();
    const rects = value.elements
      .filter((element) => element.isConnected)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
    if (value.region) rects.push({ ...value.region });
    return rects;
  });
  const selectionRect = createMemo(() => unionRects(selectionObstacleRects()));

  const selectionLabel = () => {
    const count = selection().elements.length;
    if (count > 1) return `${count} selected elements`;
    if (count === 1) return "Selected element";
    return "Selected region";
  };

  const annotationSelectionLabel = (value: MesurerAnnotation) => {
    if (value.anchor.kind !== "elements") return "Selected region";
    return `${value.anchor.targets.length} selected ${value.anchor.targets.length === 1 ? "element" : "elements"}`;
  };

  const selectionTriggerElement = createMemo(() => {
    triggerRevision();
    const elements = props.runtime.currentSelection().elements;
    if (!elements.length) return null;
    const hovered = props.runtime.hoveredElement();
    return elements.find((element) => element === hovered)
      ?? elements.find((element) => hovered && element.contains(hovered))
      ?? elements[0];
  });

  const selectionTriggerPosition = () => {
    const element = selectionTriggerElement();
    if (!element?.isConnected) return null;
    const rect = element.getBoundingClientRect();
    const value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const currentWindow = ownerWindow();
    const size = 24;
    const markerObstacles = [...untrack(annotationMarkerPositions).values()].map((position) => ({
      left: position.left,
      top: position.top,
      width: size,
      height: size,
    }));
    const [placement] = layoutAnnotationMarkers(
      [{ id: "selection-note-trigger", rect: value }],
      { width: currentWindow.innerWidth, height: currentWindow.innerHeight },
      { obstacles: markerObstacles, maxShiftRings: 1 },
    );
    const padding = 4;
    const viewportLeft = placement?.left
      ?? clamp(value.left + value.width + 6, padding, currentWindow.innerWidth - size - padding);
    const viewportTop = placement?.top
      ?? clamp(value.top, padding, currentWindow.innerHeight - size - padding);
    const nativeAnchor = anchoredTriggerElement === element;
    const viewportOwned = usesViewportCoordinates() && !nativeAnchor;
    return {
      left: nativeAnchor || viewportOwned ? viewportLeft : viewportLeft + currentWindow.scrollX,
      top: nativeAnchor || viewportOwned ? viewportTop : viewportTop + currentWindow.scrollY,
      anchorX: viewportLeft - value.left,
      anchorY: viewportTop - value.top,
      nativeAnchor,
      viewportOwned,
    };
  };

  const annotationMarkerPositions = createMemo(() => {
    revision();
    triggerRevision();
    const currentWindow = ownerWindow();
    const items = annotations().flatMap((annotation) => {
      const rect = props.runtime.annotationRect(annotation.id);
      return rect ? [{ id: annotation.id, rect }] : [];
    });
    return new Map(
      layoutAnnotationMarkers(items, {
        width: currentWindow.innerWidth,
        height: currentWindow.innerHeight,
      }, {
        obstacles: selectionObstacleRects(),
      }).map((placement) => [placement.id, placement] as const),
    );
  });

  const markerPosition = (annotationId: string) => annotationMarkerPositions().get(annotationId) ?? null;

  const nativeAnnotationPlacement = (
    annotationId: string,
    position: { left: number; top: number },
  ): SurfacePlacement => {
    triggerRevision();
    const binding = annotationScrollBindings.get(annotationId);
    if (!binding?.anchorName || !binding.target.isConnected) {
      return { ...documentPosition(position), nativeAnchor: false };
    }
    const targetRect = binding.target.getBoundingClientRect();
    return {
      ...position,
      nativeAnchor: true,
      anchorName: binding.anchorName,
      anchorX: position.left - targetRect.left,
      anchorY: position.top - targetRect.top,
    };
  };

  const notePanelPosition = () => {
    const value = selectionRect();
    const currentWindow = ownerWindow();
    const width = 272;
    const height = 168;
    const offset = composerPosition();
    if (offset && value) {
      return {
        left: value.left + offset.left,
        top: value.top + offset.top,
      };
    }
    if (!value) return { left: 8, top: 8 };
    return placeComposerNear(value, width, height, currentWindow);
  };

  const composerPlacement = (): SurfacePlacement => {
    triggerRevision();
    const position = notePanelPosition();
    const target = selectionTriggerElement();
    if (!target?.isConnected || anchoredTriggerElement !== target) {
      return { ...documentPosition(position), nativeAnchor: false };
    }
    const rect = target.getBoundingClientRect();
    return {
      ...position,
      nativeAnchor: true,
      anchorName: selectionTriggerAnchorName,
      anchorX: position.left - rect.left,
      anchorY: position.top - rect.top,
    };
  };

  const defaultPanelPosition = (annotationId: string, value: PositionedRect) => {
    const currentWindow = ownerWindow();
    const padding = 8;
    const markerSize = 24;
    const panelGap = 8;
    const panelWidth = 272;
    const panelHeight = 176;
    const positions = annotationMarkerPositions();
    const activeMarker = positions.get(annotationId);
    if (!activeMarker) return placeSurfaceNear(value, panelWidth, panelHeight, currentWindow);

    const maxLeft = currentWindow.innerWidth - panelWidth - padding;
    const maxTop = currentWindow.innerHeight - panelHeight - padding;
    const markerRects = [...positions.values()].map((position) => ({
      left: position.left,
      top: position.top,
      width: markerSize,
      height: markerSize,
    }));
    const overlapArea = (left: PositionedRect, right: PositionedRect) => {
      const width = Math.max(0, Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left));
      const height = Math.max(0, Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top));
      return width * height;
    };
    const seen = new Set<string>();
    const candidates = [
      { left: activeMarker.left + markerSize + panelGap, top: activeMarker.top },
      { left: activeMarker.left - panelWidth - panelGap, top: activeMarker.top },
      { left: activeMarker.left, top: activeMarker.top + markerSize + panelGap },
      { left: activeMarker.left, top: activeMarker.top - panelHeight - panelGap },
    ].map((candidate) => ({
      left: clamp(candidate.left, padding, maxLeft),
      top: clamp(candidate.top, padding, maxTop),
    })).filter((candidate) => {
      const key = `${candidate.left}:${candidate.top}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const ranked = candidates.map((candidate, index) => {
      const rect = { ...candidate, width: panelWidth, height: panelHeight };
      const markerOverlap = markerRects.reduce((total, marker) => total + overlapArea(rect, marker), 0);
      return {
        candidate,
        markerOverlap,
        targetOverlap: overlapArea(rect, value),
        index,
      };
    }).sort((left, right) =>
      left.markerOverlap - right.markerOverlap
      || left.targetOverlap - right.targetOverlap
      || left.index - right.index,
    );

    return ranked[0]?.candidate ?? placeSurfaceNear(value, panelWidth, panelHeight, currentWindow);
  };

  const panelPosition = (annotationId: string) => {
    const value = props.runtime.annotationRect(annotationId);
    if (!value) return { left: 8, top: 8 };
    const offset = panelPositions()[annotationId];
    if (offset) {
      return {
        left: value.left + offset.left,
        top: value.top + offset.top,
      };
    }
    return defaultPanelPosition(annotationId, value);
  };

  const freezePanelPosition = (annotationId: string) => {
    ownerWindow().queueMicrotask(() => {
      const value = props.runtime.annotationRect(annotationId);
      if (!value) return;
      setPanelPositions((positions) => {
        if (positions[annotationId]) return positions;
        const initial = defaultPanelPosition(annotationId, value);
        return {
          ...positions,
          [annotationId]: {
            left: initial.left - value.left,
            top: initial.top - value.top,
          },
        };
      });
    });
  };

  const panelPlacement = (annotationId: string) =>
    nativeAnnotationPlacement(annotationId, panelPosition(annotationId));

  const openAnnotation = (annotationId: string) => {
    fallbackNextSelection = false;
    composerSelection = null;
    setNoteComposerOpen(false);
    syncAnnotationScrollBinding(annotationId);
    freezePanelPosition(annotationId);
    setActiveAnnotationId(annotationId);
    setStatus(null);
    syncAnnotationSurface(annotationId);
  };

  const startSurfaceDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }, surfaceId: string) => {
    const ElementCtor = event.currentTarget.ownerDocument.defaultView?.Element;
    const target = event.target;
    if (event.button !== 0 || (ElementCtor && target instanceof ElementCtor && target.closest("button"))) return;
    const panel = event.currentTarget.parentElement;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const currentWindow = ownerWindow();
    const root = currentWindow.document.documentElement;
    const previousUserSelect = root.style.userSelect;
    root.style.setProperty("user-select", "none", "important");
    surfaceDrag = {
      surfaceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    setDraggingSurfaceId(surfaceId);
    event.preventDefault();
    event.stopPropagation();

    const move = (next: PointerEvent) => {
      if (!surfaceDrag || next.pointerId !== surfaceDrag.pointerId) return;
      const drag = surfaceDrag;
      const maxLeft = Math.max(8, currentWindow.innerWidth - drag.width - 8);
      const maxTop = Math.max(8, currentWindow.innerHeight - drag.height - 8);
      const position = {
        left: clamp(drag.originLeft + next.clientX - drag.startX, 8, maxLeft),
        top: clamp(drag.originTop + next.clientY - drag.startY, 8, maxTop),
      };
      if (surfaceId === "composer") {
        const value = selectionRect();
        setComposerPosition(value ? {
          left: position.left - value.left,
          top: position.top - value.top,
        } : null);
      } else {
        const value = props.runtime.annotationRect(surfaceId);
        if (!value) return;
        setPanelPositions((positions) => ({
          ...positions,
          [surfaceId]: {
            left: position.left - value.left,
            top: position.top - value.top,
          },
        }));
      }
    };
    const end = (next: PointerEvent) => {
      if (!surfaceDrag || next.pointerId !== event.pointerId) return;
      root.style.userSelect = previousUserSelect;
      currentWindow.removeEventListener("pointermove", move);
      currentWindow.removeEventListener("pointerup", end);
      currentWindow.removeEventListener("pointercancel", end);
      surfaceDrag = null;
      setDraggingSurfaceId(null);
      surfaceDragCleanup = null;
    };
    currentWindow.addEventListener("pointermove", move);
    currentWindow.addEventListener("pointerup", end);
    currentWindow.addEventListener("pointercancel", end);
    surfaceDragCleanup = () => {
      root.style.userSelect = previousUserSelect;
      currentWindow.removeEventListener("pointermove", move);
      currentWindow.removeEventListener("pointerup", end);
      currentWindow.removeEventListener("pointercancel", end);
      setDraggingSurfaceId(null);
    };
  };

  onCleanup(() => {
    surfaceDragCleanup?.();
    surfaceDragCleanup = null;
    surfaceDrag = null;
  });

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy()) return;
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const resetNoteComposer = resetNoteComposerState;

  const openNoteComposer = () => {
    if (!hasSelection()) return;
    fallbackNextSelection = false;
    composerSelection = captureSelection();
    setNote("");
    setNoteError(null);
    setStatus(null);
    setActiveAnnotationId(null);
    const value = selectionRect();
    if (value) {
      const initial = placeComposerNear(value, 272, 168, ownerWindow());
      setComposerPosition({
        left: initial.left - value.left,
        top: initial.top - value.top,
      });
    } else {
      setComposerPosition(null);
    }
    setNoteComposerOpen(true);
    ownerWindow().queueMicrotask(() => nestedTriggerScroll?.sync());
  };

  const closeNoteComposer = () => {
    const wasOpen = noteComposerOpen();
    const changedSelection = composerSelection !== null && !sameSelection(composerSelection, captureSelection());
    if (changedSelection) {
      fallbackTriggerElement = currentSelectionTriggerElement();
      fallbackNextSelection = false;
      syncSelectionTriggerAnchor();
      bumpTriggerPlacement();
    } else if (wasOpen) {
      fallbackNextSelection = false;
    }
    resetNoteComposer();
  };

  const abandonNoteComposer = () => {
    if (!noteComposerOpen()) return;
    fallbackNextSelection = true;
    resetNoteComposer();
  };

  const addNote = () => {
    try {
      const annotation = props.runtime.addSelectionAnnotation(note());
      fallbackNextSelection = false;
      composerSelection = null;
      setNote("");
      setNoteError(null);
      setNoteComposerOpen(false);
      setComposerPosition(null);
      syncAnnotationScrollBinding(annotation.id);
      freezePanelPosition(annotation.id);
      setActiveAnnotationId(annotation.id);
      setStatus(null);
      syncAnnotationSurface(annotation.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : String(error));
    }
  };

  const controller: ContextActionsController = {
    openNoteComposer,
    closeNoteComposer,
    abandonNoteComposer,
  };
  props.onController?.(controller);
  onCleanup(() => props.onController?.(null));

  return (
    <>
      <span
        ref={(element) => {
          anchorElement = element;
          bindTriggerViewportResize();
          syncSelectionTriggerAnchor();
        }}
        aria-hidden="true"
        style={{ display: "none" }}
      />

      <Show when={selection().elements.length > 0 && !noteComposerOpen()}>
        <Show when={selectionTriggerElement()} keyed>{(_owner) => (
          <Show when={selectionTriggerPosition()}>{(position) => (
            <button
              ref={(element) => {
                annotationTriggerElement = element;
                nestedTriggerScroll?.sync();
              }}
              type="button"
              data-mesurer-layer="chrome"
              data-mesurer-inspector-ui="true"
              data-mesurer-annotation-trigger="true"
              data-mesurer-context-coordinate-space={usesViewportCoordinates() ? "viewport" : "document"}
              data-mesurer-annotation-scroll-mode={scrollMode(position().nativeAnchor)}
              aria-label="Annotate selection"
              title="Annotate selection"
              class="msr:pointer-events-auto msr:z-[95] msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:rounded-[7px] msr:border msr:border-ink-200 msr:bg-white msr:text-black msr:outline-none msr:hover:bg-ink-50 msr:focus-visible:border-[#0d99ff]"
              style={{
                position: position().nativeAnchor || position().viewportOwned ? "fixed" : "absolute",
                left: position().nativeAnchor
                  ? `calc(anchor(left) + ${position().anchorX}px)`
                  : `${position().left}px`,
                top: position().nativeAnchor
                  ? `calc(anchor(top) + ${position().anchorY}px)`
                  : `${position().top}px`,
                translate: "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)",
                "position-anchor": position().nativeAnchor ? selectionTriggerAnchorName : undefined,
                "z-index": PROTECTED_ANNOTATION_Z_INDEX,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); openNoteComposer(); }}
            >
              <NoteIcon size={14} />
            </button>
          )}</Show>
        )}</Show>
      </Show>

      <Show when={noteComposerOpen() && composerOwnsCurrentSelection() && selectionRect()}>
        <Show when={composerPlacement()}>{(placement) => (
          <div
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            data-mesurer-annotation-composer="true"
            data-mesurer-context-coordinate-space={usesViewportCoordinates() ? "viewport" : "document"}
            data-mesurer-annotation-scroll-mode={scrollMode(placement().nativeAnchor)}
            class="mesurer-menu-surface msr:pointer-events-auto msr:z-[95] msr:w-[272px] msr:max-w-[calc(100vw-16px)] msr:rounded-[10px] msr:border msr:border-ink-200 msr:bg-white msr:p-1.5 msr:text-black"
            style={{
              position: placement().nativeAnchor || usesViewportCoordinates() ? "fixed" : "absolute",
              left: placement().nativeAnchor
                ? `calc(anchor(left) + ${placement().anchorX}px)`
                : `${placement().left}px`,
              top: placement().nativeAnchor
                ? `calc(anchor(top) + ${placement().anchorY}px)`
                : `${placement().top}px`,
              translate: "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)",
              "position-anchor": placement().nativeAnchor ? placement().anchorName : undefined,
              "z-index": PROTECTED_ANNOTATION_Z_INDEX,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              class="msr:flex msr:h-7 msr:items-center msr:gap-1.5 msr:px-1"
              style={{ cursor: draggingSurfaceId() === "composer" ? "grabbing" : "grab" }}
              aria-label="Drag note composer"
              onPointerDown={(event) => startSurfaceDrag(event, "composer")}
            >
              <NoteIcon size={14} class="msr:text-ink-700" />
              <div class="msr:min-w-0 msr:flex-1">
                <div class="msr:text-[11px] msr:font-medium msr:text-ink-900">Add note</div>
                <div class="msr:text-[9px] msr:text-ink-500">{selectionLabel()}</div>
              </div>
              <button type="button" class={annotationButtonClass} aria-label="Close note composer" title="Close" onClick={closeNoteComposer}><CloseIcon size={14} /></button>
            </div>
            <textarea
              autofocus
              value={note()}
              placeholder="Describe what should change…"
              onInput={(event) => {
                setNote(event.currentTarget.value);
                setNoteError(null);
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  addNote();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeNoteComposer();
                }
              }}
              class="msr:box-border msr:mt-1 msr:h-20 msr:w-full msr:resize-none msr:rounded-[7px] msr:border msr:border-ink-200 msr:bg-white msr:p-2 msr:text-[12px] msr:leading-[1.4] msr:text-black msr:outline-none msr:placeholder:text-ink-400 msr:focus:border-[#0d99ff]"
            />
            <Show when={noteError()}>{(message) => <div class="msr:mt-1.5 msr:px-1 msr:text-[10px] msr:text-red-600">{message()}</div>}</Show>
            <div class="msr:mt-1.5 msr:flex msr:h-7 msr:items-center msr:justify-between msr:gap-2 msr:px-1">
              <span class="msr:text-[9px] msr:text-ink-400">⌘/Ctrl ↵</span>
              <div class="msr:flex msr:gap-1">
                <button type="button" class="msr:h-7 msr:rounded-[7px] msr:border-0 msr:bg-transparent msr:px-2 msr:text-[11px] msr:text-ink-700 msr:hover:bg-black/4" onClick={closeNoteComposer}>Cancel</button>
                <button type="button" class="msr:h-7 msr:rounded-[7px] msr:border-0 msr:bg-[#0d99ff] msr:px-2.5 msr:text-[11px] msr:font-medium msr:text-white msr:hover:bg-[#0b8eea]" onClick={addNote}>Add note</button>
              </div>
            </div>
          </div>
        )}</Show>
      </Show>

      <For each={annotationHighlightRects()}>{(rect) => {
        const annotationId = () => highlightedAnnotationId();
        const placement = () => {
          const id = annotationId();
          return id
            ? nativeAnnotationPlacement(id, { left: rect.left, top: rect.top })
            : { ...documentPosition({ left: rect.left, top: rect.top }), nativeAnchor: false };
        };
        return (
          <div
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            data-mesurer-annotation-target-highlight="true"
            data-mesurer-annotation-id={annotationId() ?? undefined}
            data-mesurer-annotation-scroll-mode={scrollMode(placement().nativeAnchor)}
            aria-hidden="true"
            class="msr:pointer-events-none"
            style={{
              position: placement().nativeAnchor || usesViewportCoordinates() ? "fixed" : "absolute",
              left: placement().nativeAnchor
                ? `calc(anchor(left) + ${placement().anchorX}px)`
                : `${placement().left}px`,
              top: placement().nativeAnchor
                ? `calc(anchor(top) + ${placement().anchorY}px)`
                : `${placement().top}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              "box-sizing": "border-box",
              border: "1.5px solid #0d99ff",
              translate: "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)",
              "position-anchor": placement().nativeAnchor ? placement().anchorName : undefined,
              "z-index": ANNOTATION_HIGHLIGHT_Z_INDEX,
            }}
          />
        );
      }}</For>

      <For each={annotations()}>{(annotation, index) => {
        const position = () => markerPosition(annotation.id);
        const placement = () => {
          const value = position();
          return value ? nativeAnnotationPlacement(annotation.id, value) : null;
        };
        const highlighted = () => highlightedAnnotationId() === annotation.id;
        const muted = () => highlightedAnnotationId() !== null && !highlighted();
        return (
          <Show when={placement()}>{(value) => (
            <button
              type="button"
              data-mesurer-layer="evidence"
              data-mesurer-annotation-marker="true"
              data-mesurer-annotation-id={annotation.id}
              data-mesurer-annotation-number={index() + 1}
              data-mesurer-annotation-highlighted={highlighted() ? "true" : undefined}
              data-mesurer-annotation-muted={muted() ? "true" : undefined}
              data-mesurer-annotation-scroll-mode={scrollMode(value().nativeAnchor)}
              data-mesurer-context-coordinate-space={usesViewportCoordinates() ? "viewport" : "document"}
              aria-label={`Mesurer annotation ${index() + 1}: ${annotation.note}`}
              title={annotation.note}
              aria-expanded={activeAnnotationId() === annotation.id ? "true" : "false"}
              onPointerEnter={() => {
                setHoveredAnnotationId(annotation.id);
                syncAnnotationSurface(annotation.id);
              }}
              onPointerLeave={() => setHoveredAnnotationId((current) => current === annotation.id ? null : current)}
              onFocus={() => {
                setFocusedAnnotationId(annotation.id);
                syncAnnotationSurface(annotation.id);
              }}
              onBlur={() => setFocusedAnnotationId((current) => current === annotation.id ? null : current)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openAnnotation(annotation.id);
              }}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openAnnotation(annotation.id);
              }}
              class="msr:pointer-events-auto msr:z-[94] msr:flex msr:w-6 msr:h-6 msr:items-center msr:justify-center msr:border-0 msr:bg-transparent msr:p-0 msr:outline-none"
              style={{
                position: value().nativeAnchor || usesViewportCoordinates() ? "fixed" : "absolute",
                left: value().nativeAnchor
                  ? `calc(anchor(left) + ${value().anchorX}px)`
                  : `${value().left}px`,
                top: value().nativeAnchor
                  ? `calc(anchor(top) + ${value().anchorY}px)`
                  : `${value().top}px`,
                opacity: muted() ? "0.36" : "1",
                translate: "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)",
                "position-anchor": value().nativeAnchor ? value().anchorName : undefined,
                transition: "opacity 150ms ease",
                "z-index": PROTECTED_ANNOTATION_Z_INDEX,
              }}
            >
              <span
                data-mesurer-annotation-badge="true"
                aria-hidden="true"
                class="msr:flex msr:h-5 msr:w-5 msr:items-center msr:justify-center msr:rounded-[6px] msr:border msr:text-[10px] msr:font-semibold msr:leading-none"
                style={{
                  border: "1px solid #0d99ff",
                  color: highlighted() ? "white" : "#0d99ff",
                  background: highlighted() ? "#0d99ff" : "white",
                  transform: highlighted() ? "scale(1.2)" : "scale(1)",
                  "box-shadow": highlighted()
                    ? "0 3px 10px rgba(13, 153, 255, 0.28)"
                    : "0 1px 3px rgba(15, 23, 42, 0.12)",
                  transition: "transform 150ms ease, background 150ms ease, color 150ms ease, box-shadow 150ms ease",
                  "font-variant-numeric": "tabular-nums",
                }}
              >{index() + 1}</span>
            </button>
          )}</Show>
        );
      }}</For>

      <Show when={activeAnnotation()}>{(annotation) => {
        const placement = () => panelPlacement(annotation().id);
        const number = () => annotationNumber(annotation().id);
        return (
          <div
            data-mesurer-layer="chrome"
            data-mesurer-inspector-ui="true"
            data-mesurer-annotation-panel="true"
            data-mesurer-annotation-id={annotation().id}
            data-mesurer-annotation-scroll-mode={scrollMode(placement().nativeAnchor)}
            data-mesurer-context-coordinate-space={usesViewportCoordinates() ? "viewport" : "document"}
            class="mesurer-menu-surface msr:pointer-events-auto msr:z-[95] msr:w-[272px] msr:max-h-[220px] msr:rounded-[10px] msr:border msr:border-ink-200 msr:bg-white msr:p-1.5 msr:text-black"
            style={{
              position: placement().nativeAnchor || usesViewportCoordinates() ? "fixed" : "absolute",
              left: placement().nativeAnchor
                ? `calc(anchor(left) + ${placement().anchorX}px)`
                : `${placement().left}px`,
              top: placement().nativeAnchor
                ? `calc(anchor(top) + ${placement().anchorY}px)`
                : `${placement().top}px`,
              translate: "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)",
              "position-anchor": placement().nativeAnchor ? placement().anchorName : undefined,
              "z-index": ANNOTATION_PANEL_Z_INDEX,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              class="msr:flex msr:h-7 msr:items-center msr:gap-1.5 msr:px-1"
              style={{ cursor: draggingSurfaceId() === annotation().id ? "grabbing" : "grab" }}
              aria-label="Drag annotation panel"
              onPointerDown={(event) => startSurfaceDrag(event, annotation().id)}
            >
              <span
                data-mesurer-annotation-panel-badge="true"
                aria-hidden="true"
                class="msr:flex msr:h-[18px] msr:w-[18px] msr:items-center msr:justify-center msr:rounded-[5px] msr:text-[9px] msr:font-semibold msr:leading-none msr:text-white"
                style={{ background: "#0d99ff", "font-variant-numeric": "tabular-nums" }}
              >{number()}</span>
              <div class="msr:min-w-0 msr:flex-1">
                <div class="msr:text-[11px] msr:font-medium msr:text-ink-700">Note {number()}</div>
                <div class="msr:text-[9px] msr:text-ink-500">{annotationSelectionLabel(annotation())}</div>
              </div>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <button type="button" class={annotationButtonClass} aria-label="Copy annotation context" title="Copy context" disabled={busy()} onClick={() => void run(() => props.onCopy({ annotation: annotation().id }), "Copied")}><CopyIcon size={14} /></button>
                <button type="button" class={annotationButtonClass} aria-label="Delete annotation" title="Delete" onClick={() => {
                  const annotationId = annotation().id;
                  props.runtime.removeAnnotation(annotationId);
                  setPanelPositions((positions) => {
                    const next = { ...positions };
                    delete next[annotationId];
                    return next;
                  });
                  releaseAnnotationScrollBinding(annotationId);
                  setHoveredAnnotationId((current) => current === annotationId ? null : current);
                  setFocusedAnnotationId((current) => current === annotationId ? null : current);
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><TrashIcon size={14} /></button>
                <button type="button" class={annotationButtonClass} aria-label="Close annotation" title="Close" onClick={() => {
                  setActiveAnnotationId(null);
                  setStatus(null);
                }}><CloseIcon size={14} /></button>
              </div>
            </div>
            <div class="msr:mx-1 msr:mt-1 msr:max-h-36 msr:overflow-auto msr:whitespace-pre-wrap msr:rounded-[7px] msr:bg-ink-50 msr:px-2 msr:py-2 msr:text-[12px] msr:leading-[1.45] msr:text-ink-800">{annotation().note}</div>
            <Show when={status()}>{(message) => <div class="msr:mt-1.5 msr:px-1 msr:text-[10px] msr:text-ink-500" role="status">{message()}</div>}</Show>
          </div>
        );
      }}</Show>
    </>
  );
}
