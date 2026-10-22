import { For, Show, createEffect, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import { Portal } from "@solidjs/web";
import { GUIDE_DRAG_HOLD_MS, GUIDE_HITBOX_SIZE, MEASURE_LABEL_OFFSET } from "../core/constants";
import { getInspectMeasurement, getRectFromDom } from "../core/dom";
import { getSelectionSpacingOverlays } from "../core/distances";
import { getEdgeVisibilityForRects } from "../core/edge-visibility";
import { trySetPointerCapture } from "../core/events";
import type { SelectionSpacingStyle } from "../core/persistence";
import type { Guide, InspectMeasurement, Rect } from "../core/types";
import { formatValue } from "../core/utils";
import type { MesurerModel } from "../model/create-mesurer-model";
import { documentHoverPortalTarget } from "../runtime/document-hover-portal";
import { hasNativeScrollAnchoring } from "../runtime/native-scroll-registry";
import { ensureMesurerStyles } from "../runtime/style-inject";
import { MESURER_STYLES } from "../styles.generated";
import { intersectRect, responsivePreviewVisibleRect } from "../runtime/responsive-preview-geometry";
import { chromeEdgeScale, chromeEdgeThickness, snapChromeRect } from "../runtime/device-pixel-chrome";
import { DistanceOverlayItem, type SelectionSpacingInteraction } from "./DistanceOverlayItem";
import { MeasurementBox } from "./MeasurementBox";
import { InspectInfoCard } from "./InspectInfoCard";

type OverlayPointerEvent = PointerEvent & { currentTarget: HTMLDivElement };

export type MesurerOverlayProps = {
  model: MesurerModel;
  displayedSelectedMeasurements: InspectMeasurement[];
  activeRect: Rect | null;
  optionPairOverlay: import("../core/types").DistanceOverlay | null;
  guideDistanceOverlay: import("../core/types").DistanceOverlay | null;
  optionContainerLines: ReturnType<typeof import("../core/option-measurements").getOptionContainerLines>;
  hoverGuide: Guide | null;
  responsiveOpen?: boolean;
  selectionSpacingStyle: SelectionSpacingStyle;
  interactive: boolean;
  editSelectionHover(): boolean;
  onPointerDown: (event: OverlayPointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: OverlayPointerEvent) => void;
  onPointerLeave: (event: OverlayPointerEvent) => void;
  onGuidePointerDown: (guide: Guide, event: OverlayPointerEvent) => void;
  onGuidePointerUp: (guide: Guide, event: OverlayPointerEvent) => void;
};

const Tag = (props: { axis: "x" | "y"; left: number; top: number; children: any }) => (
  <div class={`msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:bg-ink-900/90 ${props.axis === "x" ? "msr:-translate-x-1/2" : "msr:-translate-y-1/2"}`} style={{ left: `${props.left}px`, top: `${props.top}px` }}>{props.children}</div>
);

export function MesurerOverlay(props: MesurerOverlayProps) {
  let overlayElement: HTMLDivElement | undefined;
  let hoverChromeElement: HTMLDivElement | undefined;
  let spacingInteractionLayer: HTMLDivElement | undefined;
  let spacingOriginX = 0;
  let spacingOriginY = 0;

  let passiveGuideDrag: {
    id: string;
    orientation: Guide["orientation"];
    pointerId: number;
    previousUserSelect: string | null;
  } | null = null;

  let guideHoldTimer = 0;
  let guideHoldId: string | null = null;
  let hoverScrollIdleTimer = 0;
  let hoverScrollFrame = 0;
  const [expandedSpacingGroup, setExpandedSpacingGroup] = createSignal<string | null>(null);
  const [pinnedSpacingGroup, setPinnedSpacingGroup] = createSignal<string | null>(null);
  const [selectionDocumentTarget, setSelectionDocumentTarget] = createSignal<HTMLElement | null>(null);
  const [hoverChromeDpr, setHoverChromeDpr] = createSignal(1);
  const [motionSurfaceActive, setMotionSurfaceActive] = createSignal(false);
  const [contextSurfaceActive, setContextSurfaceActive] = createSignal(false);

  const spacingInteraction: SelectionSpacingInteraction = {
    expandedKey: expandedSpacingGroup,
    setExpandedKey: setExpandedSpacingGroup,
    pinnedKey: pinnedSpacingGroup,
    setPinnedKey: setPinnedSpacingGroup,
  };

  const selectionVisible = () => props.model.state.toolMode === "select";
  const guidesMode = () => props.model.state.toolMode === "guides";
  const overlayVisible = () => props.model.state.enabled;

  const recordingInteractionActive = () =>
    overlayElement
      ?.closest<HTMLElement>("[data-mesurer-root='true']")
      ?.hasAttribute("data-mesurer-recording-active") ?? false;

  const overlayInteractive = () =>
    !recordingInteractionActive()
    && props.interactive
    && overlayVisible()
    && props.model.state.toolMode !== "none"
    && props.model.state.toolMode !== "text-inspector";

  const guidePointerEvents = () =>
    !recordingInteractionActive()
    && props.interactive
    && (props.model.state.toolMode !== "none" || props.model.state.rulersVisible);

  const outline = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 80%, transparent)`;
  const fill = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 8%, transparent)`;
  // Upstream paints the active measurement and persistent selection on the same
  // target. Keep one DOM box so it cannot become a scrolling/top-layer ghost,
  // but preserve the resulting opacity: 1 - (1 - alpha)^2.
  const selectedOutline = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 96%, transparent)`;
  const selectedFill = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 15.36%, transparent)`;
  createEffect(() => hoverChromeDpr(), (dpr) => {
    const ownerWindow = overlayElement?.ownerDocument.defaultView;

    if (!ownerWindow) return;

    if (dpr !== ownerWindow.devicePixelRatio) {
      setHoverChromeDpr(ownerWindow.devicePixelRatio || 1);

      return;
    }

    const resolution = ownerWindow.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setHoverChromeDpr(ownerWindow.devicePixelRatio || 1);
    resolution.addEventListener("change", update);
    onCleanup(() => resolution.removeEventListener("change", update));
  });
  onSettled(() => {
    const ownerWindow = overlayElement?.ownerDocument.defaultView;

    if (ownerWindow) setHoverChromeDpr(ownerWindow.devicePixelRatio || 1);
  });
  const selectedMeasurements = createMemo(() => props.model.state.selectedMeasurements);
  const [previewGeometryRevision, setPreviewGeometryRevision] = createSignal(0);
  onSettled(() => {
    const owner = overlayElement?.ownerDocument.defaultView;

    if (!owner) return;
    let frame = 0;

    const invalidate = () => {
      if (frame) return;
      frame = owner.requestAnimationFrame(() => {
        frame = 0;
        setPreviewGeometryRevision((revision) => revision + 1);
      });
    };

    owner.addEventListener("mesurer:responsive-preview-geometry-change", invalidate);
    owner.addEventListener("scroll", invalidate, { capture: true, passive: true });

    return () => {
      owner.removeEventListener("mesurer:responsive-preview-geometry-change", invalidate);
      owner.removeEventListener("scroll", invalidate, true);

      if (frame) owner.cancelAnimationFrame(frame);
    };
  });

  const presentMeasurement = (measurement: InspectMeasurement) => {
    const sourceDocument = measurement.sourceDocument ?? measurement.elementRef?.ownerDocument;
    const visible = sourceDocument ? responsivePreviewVisibleRect(sourceDocument) : undefined;

    // Measurements outside Responsive previews keep their identity so ordinary
    // page scrolling does not re-render every selected measurement.
    if (visible === undefined) return measurement;
    previewGeometryRevision();
    // Stage scrolling moves preview targets without refreshing stored selection
    // rects, so clip the live element geometry.
    const element = measurement.elementRef;
    const rect = intersectRect(element?.isConnected ? getRectFromDom(element) : measurement.rect, visible);

    return rect.width > 0 && rect.height > 0 ? { ...measurement, rect } : null;
  };

  const displayedPresentedMeasurements = createMemo(() =>
    displayedSelectedMeasurements().map(presentMeasurement).filter((item): item is InspectMeasurement => Boolean(item)),
  );

  const inspectCardSuppressed = () => {
    const root = props.model.rendererRoot;
    const screenshotSelection = root?.querySelector<HTMLElement>("[data-mesurer-screenshot-select='true']");
    const motionSurface = root?.querySelector<HTMLElement>("[data-mesurer-motion-surface='true']");

    return Boolean(
      props.editSelectionHover()
      || root?.hasAttribute("data-mesurer-direct-text-edit-active")
      || root?.hasAttribute("data-mesurer-recording-active")
      || (screenshotSelection
        && props.model.rendererRoot?.ownerDocument.defaultView?.getComputedStyle(screenshotSelection).display !== "none")
      || motionSurfaceActive()
      || (motionSurface && motionSurface.getBoundingClientRect().height > 0)
      || contextSurfaceActive(),
    );
  };

  const inspectCardMount = () => {
    const overlay = overlayElement;

    if (!overlay) return null;
    const ownerWindow = overlay.ownerDocument.defaultView;
    const renderRoot = overlay.getRootNode();

    if (ownerWindow && renderRoot instanceof ownerWindow.ShadowRoot) return renderRoot;

    return overlay.closest<HTMLElement>("[data-mesurer-island='true']")
      ?? overlay.ownerDocument.body;
  };

  const portalMount = (target: HTMLElement | ShadowRoot) => {
    // SAFETY: Solid Portal uses DOM child insertion/removal, which ShadowRoot supports.
    return target as Element;
  };

  const selectedCardMeasurement = createMemo(() => {
    if (props.model.state.settings.infoCardMode === "off"
      || props.model.state.toolMode !== "select"
      || !props.model.state.enabled) return null;

    if (props.model.state.settingsOpen || props.model.state.isDragging || props.model.state.altPressed
      || props.model.state.draggingGuideId || props.model.state.colorPickerActive
      || recordingInteractionActive() || inspectCardSuppressed()) return null;
    const selected = props.model.state.selectedMeasurement;
    const element = selected?.elementRef;

    if (!selected || !element?.isConnected || selected.id.startsWith("group-")) return null;

    if (responsivePreviewVisibleRect(element.ownerDocument) !== undefined && contextSurfaceActive()) return null;
    const presented = presentMeasurement(selected);

    if (!presented) return null;

    return { element, measurement: presented };
  });

  const hoverCardSource = createMemo(() => {
    const element = props.model.state.hoverElement;

    if (!element?.isConnected) return null;
    const ownerWindow = element.ownerDocument.defaultView;

    return ownerWindow ? { element, measurement: getInspectMeasurement(element, ownerWindow) } : null;
  });

  const hoverCardMeasurement = createMemo(() => {
    if (props.model.state.settings.infoCardMode !== "hover"
      || props.model.state.toolMode !== "select"
      || !props.model.state.enabled
      || props.model.state.settingsOpen
      || props.model.state.altPressed
      || props.model.state.isDragging
      || selectedMeasurements().length
      || inspectCardSuppressed()) return null;
    const source = hoverCardSource();
    const rect = source ? getRectFromDom(source.element) : props.model.state.hoverRect;

    if (!source || !rect || rect.width <= 0 || rect.height <= 0) return null;
    const presented = intersectRect(rect, responsivePreviewVisibleRect(source.element.ownerDocument));

    if (presented.width <= 0 || presented.height <= 0) return null;

    return { ...source, rect: presented };
  });

  // Spacing pills remain interactive inside the protected top layer. The
  // dotted strokes themselves move with the document's native scroll tree.
  createEffect(
    () => selectedMeasurements(),
    () => {
      const ownerWindow = overlayElement?.ownerDocument.defaultView;

      if (!ownerWindow) return;
      spacingOriginX = ownerWindow.scrollX;
      spacingOriginY = ownerWindow.scrollY;
      spacingInteractionLayer?.style.removeProperty("transform");
    },
  );

  // The multi-selection union, its per-target outlines, and pairwise spacing
  // share document coordinates. Keeping them inside the fixed interaction
  // overlay leaves old viewport pixels behind until the scroll-settle refresh.
  const selectionDocumentOrigin = createMemo(() => {
    const measurements = selectedMeasurements();
    const sample = measurements[0]?.documentScroll;

    // A scroll event can arrive before Solid paints the latest measurements.
    // Never pair a cached viewport rectangle with a newer window.scrollY:
    // carry the viewport origin recorded when the rectangle was sampled.
    if (sample) return sample;

    const ownerWindow = overlayElement?.ownerDocument.defaultView;

    return { x: ownerWindow?.scrollX ?? 0, y: ownerWindow?.scrollY ?? 0 };
  });

  const displayedMeasurements = createMemo(() => {
    const measurements = props.model.state.settings.multiMeasureEnabled && props.model.state.measurements.length > 0
      ? props.model.state.measurements
      : props.model.state.activeMeasurement
        ? [props.model.state.activeMeasurement]
        : [];

    const selectedElements = new Set(
      selectedMeasurements()
        .map((measurement) => measurement.elementRef)
        .filter((element): element is Element => Boolean(element)),
    );

    return measurements.filter((measurement) => !measurement.elementRef || !selectedElements.has(measurement.elementRef));
  });

  const displayedSelectedMeasurements = createMemo(() => props.displayedSelectedMeasurements);

  const selectionIsResponsive = () => selectedMeasurements().some((measurement) => {
    const sourceDocument = measurement.elementRef?.ownerDocument;

    return sourceDocument ? responsivePreviewVisibleRect(sourceDocument) !== undefined : false;
  });

  const hoverTargetsSelected = createMemo(() => {
    const target = props.model.state.hoverElement;

    return Boolean(target && selectedMeasurements().some((measurement) => measurement.elementRef === target));
  });

  const heldDistances = createMemo(() => props.model.state.heldDistances);
  const measurementEdges = createMemo(() => getEdgeVisibilityForRects(displayedMeasurements().map((item) => item.rect)));
  const selectedEdges = createMemo(() => getEdgeVisibilityForRects(displayedSelectedMeasurements().map((item) => item.rect)));

  const selectionSpacingOverlays = createMemo(() => {
    const selected = selectedMeasurements();

    if (!selectionVisible() || !props.selectionSpacingStyle.enabled || selected.length < 2) return [];
    const ownerWindow = overlayElement?.ownerDocument.defaultView;

    return ownerWindow ? getSelectionSpacingOverlays(selected, ownerWindow) : [];
  });

  // Preserve each distance's rendered DOM across scroll-settle refreshes.
  // Solid's For keys by object identity; every recomputation produces new
  // DistanceOverlay objects although the measured pair is unchanged.
  const selectionSpacingPairIds = createMemo(() => selectionSpacingOverlays().map((distance) => distance.id));
  const selectionSpacingForId = (id: string) => selectionSpacingOverlays().find((distance) => distance.id === id)!;

  const selectedSpacingIds = createMemo(() => selectedMeasurements().map((measurement) => measurement.id).join("|"));
  createEffect(
    () => selectedSpacingIds(),
    () => {
      setExpandedSpacingGroup(null);
      setPinnedSpacingGroup(null);
    },
  );

  const hoverEdges = () => {
    const hoverRect = props.model.state.hoverRect;

    if (!hoverRect) return null;

    return getEdgeVisibilityForRects([
      hoverRect,
      ...displayedSelectedMeasurements().map((item) => item.rect),
    ])[0] ?? null;
  };

  const hoverPortalTarget = () => documentHoverPortalTarget(
    overlayElement,
    props.model.state.hoverElement,
  );

  const hoverSurface = () => {
    previewGeometryRevision();
    const source = props.model.state.hoverElement;

    if (source
      && responsivePreviewVisibleRect(source.ownerDocument) !== undefined
      && props.model.state.selectedMeasurements.some((measurement) => measurement.elementRef === source)) return null;

    const rawRect = source ? getRectFromDom(source) : props.model.state.hoverRect;
    const previewVisible = source ? responsivePreviewVisibleRect(source.ownerDocument) : undefined;
    const rect = rawRect && source ? intersectRect(rawRect, previewVisible) : rawRect;

    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const documentLayer = Boolean(hoverPortalTarget());
    // The Responsive stage is a positioned sibling in this overlay's stacking
    // context, so preview hover chrome needs an explicit layer to paint above it.
    const zIndex = documentLayer || previewVisible ? "2147482700" : undefined;
    const paintedRect = snapChromeRect(rect, hoverChromeElement, hoverChromeDpr());
    const { x: scaleX, y: scaleY } = chromeEdgeScale(hoverChromeElement);
    const edgeWidth = chromeEdgeThickness(hoverChromeDpr(), scaleX);
    const edgeHeight = chromeEdgeThickness(hoverChromeDpr(), scaleY);

    return <div
      ref={(element) => { hoverChromeElement = element; }}
      data-mesurer-hover-measurement="true"
      data-mesurer-document-hover-layer={documentLayer ? "true" : undefined}
      class="msr:pointer-events-none msr:absolute"
      style={{
        position: "absolute",
        "pointer-events": "none",
        "z-index": zIndex,
        ...paintedRect,
        "background-color": fill(),
        transition: "none",
        animation: "none",
      }}
    >
      <Show when={hoverEdges()?.top}><svg data-mesurer-hover-edge="top" class="msr:absolute msr:left-0 msr:top-0 msr:w-full" style={{ position: "absolute", left: "0", top: "0", height: `${edgeHeight}px`, overflow: "visible", "shape-rendering": "crispEdges" }}><line x1="0" y1="50%" x2="100%" y2="50%" stroke={outline()} stroke-width={edgeHeight} /></svg></Show>
      <Show when={hoverEdges()?.right}><svg data-mesurer-hover-edge="right" class="msr:absolute msr:right-0 msr:top-0 msr:h-full" style={{ position: "absolute", right: "0", top: "0", width: `${edgeWidth}px`, overflow: "visible", "shape-rendering": "crispEdges" }}><line x1="50%" y1="0" x2="50%" y2="100%" stroke={outline()} stroke-width={edgeWidth} /></svg></Show>
      <Show when={hoverEdges()?.bottom}><svg data-mesurer-hover-edge="bottom" class="msr:absolute msr:bottom-0 msr:left-0 msr:w-full" style={{ position: "absolute", bottom: "0", left: "0", height: `${edgeHeight}px`, overflow: "visible", "shape-rendering": "crispEdges" }}><line x1="0" y1="50%" x2="100%" y2="50%" stroke={outline()} stroke-width={edgeHeight} /></svg></Show>
      <Show when={hoverEdges()?.left}><svg data-mesurer-hover-edge="left" class="msr:absolute msr:left-0 msr:top-0 msr:h-full" style={{ position: "absolute", left: "0", top: "0", width: `${edgeWidth}px`, overflow: "visible", "shape-rendering": "crispEdges" }}><line x1="50%" y1="0" x2="50%" y2="100%" stroke={outline()} stroke-width={edgeWidth} /></svg></Show>
    </div>;
  };

  const guideColor = (kind: "active" | "hover" | "default" | "preview") => {
    const amount = kind === "active" ? 100 : kind === "hover" ? 90 : kind === "preview" ? 50 : 70;

    return `color-mix(in oklch, ${props.model.state.settings.guideColor} ${amount}%, transparent)`;
  };

  const renderedGuides = createMemo((): Guide[] => {
    if (props.responsiveOpen) return [];

    if (props.model.state.guides.length > 0) return props.model.state.guides;

    if (!props.model.state.settingsOpen || props.model.state.settingsTab !== "guides") return props.model.state.guides;
    const ownerWindow = overlayElement?.ownerDocument.defaultView;

    if (!ownerWindow) return props.model.state.guides;

    return [
      { id: "__mesurer-preview-vertical", orientation: "vertical", position: ownerWindow.innerWidth / 2 },
      { id: "__mesurer-preview-horizontal", orientation: "horizontal", position: ownerWindow.innerHeight / 2 },
    ];
  });

  const clearGuideHold = () => {
    if (guideHoldTimer) overlayElement?.ownerDocument.defaultView?.clearTimeout(guideHoldTimer);
    guideHoldTimer = 0;
    guideHoldId = null;
  };

  const interactiveGuideDown = (guide: Guide, event: OverlayPointerEvent) => {
    if (!props.model.current.enabled || props.model.current.settingsOpen || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    props.model.checkpoint();

    if (event.shiftKey) {
      props.model.setSelectedGuideIds(
        props.model.current.selectedGuideIds.includes(guide.id)
          ? props.model.current.selectedGuideIds.filter((id) => id !== guide.id)
          : [...props.model.current.selectedGuideIds, guide.id],
      );

      return;
    }

    props.model.setSelectedGuideIds([guide.id]);
    clearGuideHold();
    const ownerWindow = event.currentTarget.ownerDocument.defaultView;

    if (ownerWindow) {
      guideHoldId = guide.id;
      guideHoldTimer = ownerWindow.setTimeout(() => {
        guideHoldTimer = 0;

        if (guideHoldId === guide.id) props.model.setTransient({ draggingGuideId: guide.id });
      }, GUIDE_DRAG_HOLD_MS);
    }

    trySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const interactiveGuideUp = (guide: Guide, event: OverlayPointerEvent) => {
    event.stopPropagation();
    clearGuideHold();

    if (props.model.current.draggingGuideId === guide.id) props.model.setTransient({ draggingGuideId: null });

    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  onSettled(() => {
    const overlay = overlayElement;
    const ownerWindow = overlay?.ownerDocument.defaultView;
    const ownerDocument = overlay?.ownerDocument;

    if (!overlay || !ownerWindow || !ownerDocument) return;

    spacingOriginX = ownerWindow.scrollX;
    spacingOriginY = ownerWindow.scrollY;

    // A document-backed multi-selection paints in the same native scroll tree
    // as the page. Only the toolbar and pointer input remain viewport-fixed.
    if (ownerDocument.body) {
      ensureMesurerStyles(MESURER_STYLES, ownerDocument.body);
      setSelectionDocumentTarget(ownerDocument.body);
    }

    const syncMotionSurface = () => {
      const surface = props.model.rendererRoot?.querySelector<HTMLElement>("[data-mesurer-motion-surface='true']");
      const active = Boolean(surface && surface.getBoundingClientRect().height > 0);

      const contextSurface = props.model.rendererRoot?.querySelector(
        "[data-mesurer-annotation-composer='true'], [data-mesurer-annotation-panel='true'], [data-mesurer-annotation-marker='true']",
      ) ?? ownerDocument.querySelector(
        "[data-mesurer-annotation-composer='true'], [data-mesurer-annotation-panel='true'], [data-mesurer-annotation-marker='true']",
      ) ?? ownerDocument.querySelector<HTMLElement>("[data-mesurer-island='true']")
        ?.shadowRoot?.querySelector(
          "[data-mesurer-annotation-composer='true'], [data-mesurer-annotation-panel='true'], [data-mesurer-annotation-marker='true']",
        );

      if (active !== motionSurfaceActive()) setMotionSurfaceActive(active);

      if (Boolean(contextSurface) !== contextSurfaceActive()) setContextSurfaceActive(Boolean(contextSurface));
    };

    const motionSurfaceObserver = new ownerWindow.MutationObserver(syncMotionSurface);

    if (props.model.rendererRoot) {
      motionSurfaceObserver.observe(props.model.rendererRoot, { childList: true, subtree: true });
    }

    if (ownerDocument.body && ownerDocument.body !== props.model.rendererRoot) {
      motionSurfaceObserver.observe(ownerDocument.body, { childList: true, subtree: true });
    }

    syncMotionSurface();

    const handleOverlayPointerMove = (event: PointerEvent) => props.onPointerMove(event);

    const syncSpacingInteractionScroll = () => {
      const layer = spacingInteractionLayer;

      if (!layer?.isConnected) return;
      const dx = spacingOriginX - ownerWindow.scrollX;
      const dy = spacingOriginY - ownerWindow.scrollY;

      if (dx === 0 && dy === 0) layer.style.removeProperty("transform");
      else layer.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };

    const handleEditWindowPointerMove = (event: PointerEvent) => {
      if (!props.editSelectionHover() || props.model.current.toolMode !== "select") return;
      const path = event.composedPath();

      if (path.includes(overlay)) return;

      const editBoxOwnsPointer = path.some((target) =>
        target instanceof ownerWindow.Element
        && target.getAttribute("data-mesurer-arrange-box") === "true");

      if (editBoxOwnsPointer || event.buttons !== 0) {
        props.model.setHoverTarget(null, null);

        return;
      }

      props.onPointerMove(event);
    };

    const syncHoverGeometry = () => {
      const target = props.model.current.hoverElement;
      const chrome = hoverChromeElement;

      if (!target?.isConnected || !chrome?.isConnected) return;
      const rawRect = target.getBoundingClientRect();
      const bounds = responsivePreviewVisibleRect(target.ownerDocument);
      const rect = intersectRect(rawRect, bounds);

      if (rect.width <= 0 || rect.height <= 0) {
        chrome.style.visibility = "hidden";

        return;
      }

      chrome.style.removeProperty("visibility");
      const paintedRect = snapChromeRect(rect, chrome, hoverChromeDpr());
      Object.assign(chrome.style, {
        ...paintedRect,
      });
    };

    const scheduleHoverFallback = () => {
      if (hoverScrollFrame) return;
      hoverScrollFrame = ownerWindow.requestAnimationFrame(() => {
        hoverScrollFrame = 0;

        if (hoverChromeElement?.dataset.mesurerNativeScrollAnchor === "box") return;
        syncHoverGeometry();
      });
    };

    const handleScroll = () => {
      const chrome = hoverChromeElement;

      if (!chrome?.isConnected) return;

      if (chrome.dataset.mesurerNativeScrollAnchor === "box") return;

      if (!hasNativeScrollAnchoring(ownerDocument)) {
        scheduleHoverFallback();

        return;
      }

      // During the short handoff before the native hover anchor is installed,
      // avoid DOM discovery/layout on every compositor scroll event. Hide the
      // fallback and reconcile once the burst settles; the native path takes
      // over without JavaScript as soon as the coordinator binds it.
      chrome.style.visibility = "hidden";

      if (hoverScrollIdleTimer) ownerWindow.clearTimeout(hoverScrollIdleTimer);
      hoverScrollIdleTimer = ownerWindow.setTimeout(() => {
        hoverScrollIdleTimer = 0;

        if (chrome.dataset.mesurerNativeScrollAnchor !== "box") syncHoverGeometry();

        if (chrome.isConnected) chrome.style.removeProperty("visibility");
      }, 80);
    };

    const handlePassiveGuideDown = (event: PointerEvent) => {
      if (props.responsiveOpen || !props.model.current.enabled || props.model.current.settingsOpen || props.model.current.toolMode !== "none") return;

      const toolbarTarget = event.composedPath().some((target) =>
        target instanceof ownerWindow.Element && target.hasAttribute("data-mesurer-toolbar"),
      );

      if (toolbarTarget) return;

      const point = { x: event.clientX, y: event.clientY };

      const guide = props.model.current.guides.find((candidate) => {
        const distance = candidate.orientation === "vertical"
          ? Math.abs(candidate.position - point.x)
          : Math.abs(candidate.position - point.y);

        return distance <= GUIDE_HITBOX_SIZE / 2;
      });

      if (!guide) return;

      props.model.checkpoint();

      if (event.shiftKey) {
        props.model.setSelectedGuideIds(
          props.model.current.selectedGuideIds.includes(guide.id)
            ? props.model.current.selectedGuideIds.filter((id) => id !== guide.id)
            : [...props.model.current.selectedGuideIds, guide.id],
        );
        passiveGuideDrag = null;

        return;
      }

      props.model.setSelectedGuideIds([guide.id]);

      if (event.button === 0) {
        passiveGuideDrag = {
          id: guide.id,
          orientation: guide.orientation,
          pointerId: event.pointerId,
          previousUserSelect: null,
        };
      }
    };

    const handlePassiveGuideMove = (event: PointerEvent) => {
      const drag = passiveGuideDrag;

      if (!drag || drag.pointerId !== event.pointerId) return;
      const guide = props.model.current.guides.find((candidate) => candidate.id === drag.id);

      if (!guide) return;
      event.preventDefault();

      if (drag.previousUserSelect === null) {
        drag.previousUserSelect = ownerDocument.documentElement.style.userSelect;
        ownerDocument.documentElement.style.userSelect = "none";
        ownerWindow.getSelection()?.removeAllRanges();
      }

      props.model.updateGuide(drag.id, {
        position: drag.orientation === "vertical" ? event.clientX : event.clientY,
      });
    };

    const handlePassiveGuideEnd = (event: PointerEvent) => {
      const drag = passiveGuideDrag;

      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.previousUserSelect !== null) ownerDocument.documentElement.style.userSelect = drag.previousUserSelect;
      passiveGuideDrag = null;
    };

    syncHoverGeometry();
    overlay.addEventListener("pointermove", handleOverlayPointerMove);
    ownerWindow.addEventListener("pointermove", handleEditWindowPointerMove, true);
    ownerWindow.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    ownerWindow.addEventListener("scroll", syncSpacingInteractionScroll, { capture: true, passive: true });
    ownerWindow.addEventListener("resize", syncHoverGeometry, true);
    ownerWindow.addEventListener("pointerdown", handlePassiveGuideDown, true);
    ownerWindow.addEventListener("pointermove", handlePassiveGuideMove, true);
    ownerWindow.addEventListener("pointerup", handlePassiveGuideEnd, true);
    ownerWindow.addEventListener("pointercancel", handlePassiveGuideEnd, true);

    return () => {
      overlay.removeEventListener("pointermove", handleOverlayPointerMove);
      ownerWindow.removeEventListener("pointermove", handleEditWindowPointerMove, true);
      ownerWindow.removeEventListener("scroll", handleScroll, true);
      ownerWindow.removeEventListener("scroll", syncSpacingInteractionScroll, true);
      ownerWindow.removeEventListener("resize", syncHoverGeometry, true);
      ownerWindow.removeEventListener("pointerdown", handlePassiveGuideDown, true);
      ownerWindow.removeEventListener("pointermove", handlePassiveGuideMove, true);
      ownerWindow.removeEventListener("pointerup", handlePassiveGuideEnd, true);
      ownerWindow.removeEventListener("pointercancel", handlePassiveGuideEnd, true);
      motionSurfaceObserver.disconnect();

      if (hoverScrollIdleTimer) ownerWindow.clearTimeout(hoverScrollIdleTimer);

      if (hoverScrollFrame) ownerWindow.cancelAnimationFrame(hoverScrollFrame);
      hoverScrollIdleTimer = 0;
      hoverScrollFrame = 0;
      hoverChromeElement?.style.removeProperty("visibility");
      clearGuideHold();

      if (passiveGuideDrag?.previousUserSelect !== null && passiveGuideDrag) {
        ownerDocument.documentElement.style.userSelect = passiveGuideDrag.previousUserSelect;
      }

      passiveGuideDrag = null;
    };
  });

  const SelectedPresentation = () => (
    <>
      <For
        each={displayedPresentedMeasurements()}
        keyed={(measurement) => measurement.id}
      >{(measurement, index) => (
        <MeasurementBox
          measurement={measurement()}
          showLabel={!(props.model.state.selectedMeasurements.length === 1
            && selectedCardMeasurement()?.element === measurement().elementRef)}
          clipRect={responsivePreviewVisibleRect(measurement().sourceDocument ?? measurement().elementRef?.ownerDocument)}
          edgeVisibility={selectedEdges()[index()]}
          outlineColor={selectedOutline()}
          fillColor={selectedFill()}
          theme={props.model.state.settings.theme}
        />
      )}</For>
      <Show when={props.editSelectionHover() && displayedSelectedMeasurements()[0]?.id.startsWith("group-")}>
        <div
          data-mesurer-selection-group-outline="true"
          class="msr:pointer-events-none msr:absolute"
          style={{
            left: `${displayedSelectedMeasurements()[0]!.rect.left}px`,
            top: `${displayedSelectedMeasurements()[0]!.rect.top}px`,
            width: `${displayedSelectedMeasurements()[0]!.rect.width}px`,
            height: `${displayedSelectedMeasurements()[0]!.rect.height}px`,
            "box-sizing": "border-box",
            border: "1px solid #0d99ff",
          }}
        />
      </Show>
      <Show when={selectedMeasurements().length > 1}>
        <For each={selectedMeasurements()}>{(measurement) => (
          <div
            data-mesurer-selection-spacing-target="true"
            class="msr:pointer-events-none msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70"
            style={{
              left: `${measurement.rect.left}px`,
              top: `${measurement.rect.top}px`,
              width: `${measurement.rect.width}px`,
              height: `${measurement.rect.height}px`,
            }}
          />
        )}</For>
        <For each={selectionSpacingPairIds()}>{(distanceId) => (
          <DistanceOverlayItem
            distance={selectionSpacingForId(distanceId)}
            kind="selection-spacing"
            showRects={false}
            spacingScopeId={selectedSpacingIds()}
            selectionSpacingStyle={props.selectionSpacingStyle}
            spacingInteraction={spacingInteraction}
            renderPart="paint"
          />
        )}</For>
      </Show>
    </>
  );

  return (
    <div
      ref={(element) => { overlayElement = element; }}
      data-mesurer-interaction-overlay="true"
      class={`msr:absolute msr:inset-0 msr:select-none ${overlayVisible() ? `msr:pointer-events-auto ${guidesMode() ? props.hoverGuide || props.model.state.draggingGuideId ? "msr:cursor-default" : "msr:cursor-crosshair" : "msr:cursor-default"} msr:opacity-100` : "msr:pointer-events-none msr:opacity-0"}`}
      style={{ "pointer-events": overlayInteractive() ? "auto" : "none" }}
      onPointerDown={(event) => props.onPointerDown(event)}
      onPointerUp={(event) => props.onPointerUp(event)}
      onPointerLeave={(event) => props.onPointerLeave(event)}
    >
      <Show when={selectionVisible()}>
        <For each={displayedMeasurements()}>{(measurement, index) => <MeasurementBox measurement={measurement} edgeVisibility={measurementEdges()[index()]} outlineColor={outline()} fillColor={fill()} theme={props.model.state.settings.theme} />}</For>

        <Show when={props.activeRect && props.model.state.isDragging}><>
          <div class="msr:pointer-events-none msr:absolute" style={{ left: `${props.activeRect!.left}px`, top: `${props.activeRect!.top}px`, width: `${props.activeRect!.width}px`, height: `${props.activeRect!.height}px`, "background-color": fill() }}>
            <div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} />
          </div>
          <Tag axis="x" left={props.activeRect!.left + props.activeRect!.width / 2} top={props.activeRect!.top + props.activeRect!.height + MEASURE_LABEL_OFFSET}>{formatValue(props.activeRect!.width)} x {formatValue(props.activeRect!.height)}</Tag>
        </></Show>

        <Show when={
          props.model.state.hoverRect
          && props.model.state.settings.hoverHighlightEnabled
          && (props.editSelectionHover() || selectedMeasurements().length <= 1)
          && !hoverTargetsSelected()
        }>
          <Show when={hoverPortalTarget()} fallback={hoverSurface()}>
            {(mount) => <Portal mount={mount()}>{hoverSurface()}</Portal>}
          </Show>
        </Show>
      </Show>

      <Show when={selectedCardMeasurement()}>{(selected) => {
        const mount = inspectCardMount();

        ensureMesurerStyles(MESURER_STYLES, overlayElement!.ownerDocument.body);

        return <Portal mount={portalMount(mount ?? overlayElement!)}>
          <InspectInfoCard
            element={selected().element}
            measurement={selected().measurement}
            rect={selected().measurement.rect}
            ownerWindow={overlayElement!.ownerDocument.defaultView!}
            theme={props.model.state.settings.theme}
            documentMounted
            layoutDetailsEnabled={props.model.state.settings.layoutDetailsEnabled}
            singleSelection={props.model.state.selectedMeasurements.length <= 1}
          />
        </Portal>;
      }}</Show>
      <Show when={!selectedCardMeasurement() && hoverCardMeasurement()}>{(hover) => {
        const mount = inspectCardMount();

        ensureMesurerStyles(MESURER_STYLES, overlayElement!.ownerDocument.body);

        return <Portal mount={portalMount(mount ?? overlayElement!)}>
          <InspectInfoCard
            element={hover().element}
            measurement={hover().measurement}
            rect={hover().rect}
            ownerWindow={overlayElement!.ownerDocument.defaultView!}
            theme={props.model.state.settings.theme}
            documentMounted
            layoutDetailsEnabled={props.model.state.settings.layoutDetailsEnabled}
            singleSelection
            passThrough
          />
        </Portal>;
      }}</Show>

      <Show when={props.interactive && guidesMode() && props.model.state.guidePreview && !props.model.state.draggingGuideId}>
        <div class="msr:pointer-events-none msr:absolute" style={props.model.state.guidePreview!.orientation === "vertical"
          ? { left: `${props.model.state.guidePreview!.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: "100%" }
          : { top: `${props.model.state.guidePreview!.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: "100%" }}>
          <div class="msr:absolute" style={props.model.state.guidePreview!.orientation === "vertical"
            ? { left: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, top: "0", width: "2px", height: "100%", "background-color": guideColor("preview") }
            : { top: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, left: "0", height: "2px", width: "100%", "background-color": guideColor("preview") }} />
        </div>
      </Show>

      <Show when={selectionVisible()}>
        <Show
          when={selectedMeasurements().length > 1 && !selectionIsResponsive() ? selectionDocumentTarget() : null}
          fallback={<SelectedPresentation />}
        >
          {(mount) => <Portal mount={mount()}>
            <div
              data-mesurer-multi-selection-document-layer="true"
              data-mesurer-selection-scope={selectedSpacingIds()}
              data-mesurer-inspector-ui="true"
              data-theme={props.model.state.settings.theme}
              class="msr:pointer-events-none"
              style={{
                position: "absolute",
                left: `${selectionDocumentOrigin().x}px`,
                top: `${selectionDocumentOrigin().y}px`,
                "pointer-events": "none",
              }}
            >
              <SelectedPresentation />
            </div>
          </Portal>}
        </Show>
      </Show>

      {/* Interactive spacing labels must remain in the top-layer host. Its
          pointer plane intercepts all labels rendered below it in <body>. */}
      <Show when={selectionVisible() && selectedMeasurements().length > 1}>
        <div ref={(element) => { spacingInteractionLayer = element; }} data-mesurer-spacing-interaction-layer="true" class="msr:pointer-events-none">
          <For each={selectionSpacingPairIds()}>{(distanceId) => (
            <DistanceOverlayItem
              distance={selectionSpacingForId(distanceId)}
              showRects={false}
              kind="selection-spacing"
              spacingScopeId={selectedSpacingIds()}
              selectionSpacingStyle={props.selectionSpacingStyle}
              spacingInteraction={spacingInteraction}
              renderPart={selectionDocumentTarget() ? "interaction" : "all"}
            />
          )}</For>
        </div>
      </Show>

      <For each={heldDistances()}>{(distance) => <DistanceOverlayItem distance={distance} onRemove={props.model.removeHeldDistance} kind="held" />}</For>
      <Show when={selectionVisible() && props.model.state.altPressed && props.optionPairOverlay}><DistanceOverlayItem distance={props.optionPairOverlay!} kind="preview" /></Show>
      <Show when={props.interactive && guidesMode() && props.model.state.altPressed && props.guideDistanceOverlay}><DistanceOverlayItem distance={props.guideDistanceOverlay!} kind="preview" /></Show>

      <Show when={selectionVisible() && props.model.state.altPressed && props.optionContainerLines}>{(lines) => <>
        <Show when={lines().top.value > 0}><><div class="msr:absolute msr:w-px msr:bg-[#2563eb]" style={{ top: `${lines().top.y1}px`, height: `${lines().top.y2 - lines().top.y1}px`, left: `${lines().top.x}px` }} /><Tag axis="y" left={lines().top.x + MEASURE_LABEL_OFFSET} top={(lines().top.y1 + lines().top.y2) / 2}>{formatValue(lines().top.value)}</Tag></></Show>
        <Show when={lines().bottom.value > 0}><><div class="msr:absolute msr:w-px msr:bg-[#2563eb]" style={{ top: `${lines().bottom.y1}px`, height: `${lines().bottom.y2 - lines().bottom.y1}px`, left: `${lines().bottom.x}px` }} /><Tag axis="y" left={lines().bottom.x + MEASURE_LABEL_OFFSET} top={(lines().bottom.y1 + lines().bottom.y2) / 2}>{formatValue(lines().bottom.value)}</Tag></></Show>
        <Show when={lines().left.value > 0}><><div class="msr:absolute msr:h-px msr:bg-[#2563eb]" style={{ left: `${lines().left.x1}px`, width: `${lines().left.x2 - lines().left.x1}px`, top: `${lines().left.y}px` }} /><Tag axis="x" left={(lines().left.x1 + lines().left.x2) / 2} top={lines().left.y + MEASURE_LABEL_OFFSET}>{formatValue(lines().left.value)}</Tag></></Show>
        <Show when={lines().right.value > 0}><><div class="msr:absolute msr:h-px msr:bg-[#2563eb]" style={{ left: `${lines().right.x1}px`, width: `${lines().right.x2 - lines().right.x1}px`, top: `${lines().right.y}px` }} /><Tag axis="x" left={(lines().right.x1 + lines().right.x2) / 2} top={lines().right.y + MEASURE_LABEL_OFFSET}>{formatValue(lines().right.value)}</Tag></></Show>
      </>}</Show>

      <For each={renderedGuides()}>{(guide) => {
        const previewGuide = () => guide.id.startsWith("__mesurer-preview-");
        const selected = () => !previewGuide() && props.model.state.selectedGuideIds.includes(guide.id);
        const hovered = () => !previewGuide() && props.hoverGuide?.id === guide.id;
        const strokeColor = () => selected() ? guideColor("active") : hovered() ? guideColor("hover") : guideColor("default");
        const strokeWidth = () => Math.max(props.model.state.settings.guideStyle.width, selected() || hovered() ? 2 : props.model.state.settings.guideStyle.width);

        const backgroundImage = () => props.model.state.settings.guideStyle.pattern === "solid" ? undefined
          : props.model.state.settings.guideStyle.pattern === "dotted"
            ? `radial-gradient(circle, ${strokeColor()} 0 ${strokeWidth() / 2}px, transparent ${strokeWidth() / 2 + 0.5}px)`
            : `repeating-linear-gradient(${guide.orientation === "vertical" ? "to bottom" : "to right"}, ${strokeColor()} 0 ${props.model.state.settings.guideStyle.dashLength}px, transparent ${props.model.state.settings.guideStyle.dashLength}px ${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px)`;

        const backgroundSize = () => props.model.state.settings.guideStyle.pattern === "dotted"
          ? guide.orientation === "vertical" ? `${strokeWidth()}px ${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px` : `${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px ${strokeWidth()}px`
          : undefined;

        return <div class="msr:absolute" data-mesurer-guide="true" style={guide.orientation === "vertical"
          ? { left: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: "100%", "pointer-events": !previewGuide() && guidePointerEvents() ? "auto" : "none" }
          : { top: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: "100%", "pointer-events": !previewGuide() && guidePointerEvents() ? "auto" : "none" }}
          onPointerDown={(event) => { if (!previewGuide() && props.model.current.toolMode !== "none") interactiveGuideDown(guide, event); }}
          onPointerUp={(event) => { if (!previewGuide() && props.model.current.toolMode !== "none") interactiveGuideUp(guide, event); }}
          onPointerCancel={(event) => { if (!previewGuide() && props.model.current.toolMode !== "none") interactiveGuideUp(guide, event); }}>
          <div class="msr:absolute" style={guide.orientation === "vertical"
            ? { left: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, top: "0", width: `${strokeWidth()}px`, height: "100%", "background-color": props.model.state.settings.guideStyle.pattern === "solid" ? strokeColor() : "transparent", "background-image": backgroundImage(), "background-size": backgroundSize(), opacity: props.model.state.settings.guideStyle.opacity }
            : { top: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, left: "0", height: `${strokeWidth()}px`, width: "100%", "background-color": props.model.state.settings.guideStyle.pattern === "solid" ? strokeColor() : "transparent", "background-image": backgroundImage(), "background-size": backgroundSize(), opacity: props.model.state.settings.guideStyle.opacity }} />
        </div>;
      }}</For>
    </div>
  );
}
