import { Show, createSignal, onSettled } from "solid-js";
import { Portal } from "@solidjs/web";
import type { InspectMeasurement, Measurement, Rect } from "../core/types";
import type { EdgeVisibility } from "../core/edge-visibility";
import type { MesurerTheme } from "../core/persistence";
import { MEASURE_LABEL_OFFSET, MEASURE_TRANSITION_MS } from "../core/constants";
import { installNestedScrollCompensation } from "../runtime/nested-scroll-compensation";
import { registerSelectionChromeTarget } from "../runtime/native-scroll-registry";
import { getRectFromDom } from "../core/dom";
import { intersectRect, responsivePreviewVisibleRect } from "../runtime/responsive-preview-geometry";

export type MeasurementBoxProps = {
  measurement: Measurement | InspectMeasurement | null;
  outlineColor: string;
  fillColor: string;
  edgeVisibility?: EdgeVisibility;
  showLabel?: boolean;
  clipRect?: Rect | null;
  theme?: MesurerTheme;
};

const allEdges: EdgeVisibility = { top: true, right: true, bottom: true, left: true };

const formatValue = (value: number) => Math.round(value);

const SELECTED_CHROME_Z_INDEX = "2147482800";

export function MeasurementBox(props: MeasurementBoxProps) {
  let chromeElement: HTMLDivElement | undefined;
  let labelElement: HTMLDivElement | undefined;
  const [selectionPortalTarget, setSelectionPortalTarget] = createSignal<HTMLElement | null>(null);
  const edges = () => props.edgeVisibility ?? allEdges;
  const isSelectionGroup = () => Boolean(props.measurement?.id.startsWith("group-"));
  const isSelectedMeasurement = () => Boolean(props.measurement && "paddingRect" in props.measurement);

  const labelRect = (measurement: Measurement | InspectMeasurement) =>
    "cssRect" in measurement && measurement.cssRect ? measurement.cssRect : measurement.rect;

  const transition = () => isSelectedMeasurement()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease, width ${MEASURE_TRANSITION_MS}ms ease, height ${MEASURE_TRANSITION_MS}ms ease`;

  const labelTransition = () => isSelectedMeasurement()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease`;

  const liveSelectedTarget = () => {
    const measurement = props.measurement;

    if (!measurement || !("paddingRect" in measurement)) return null;
    const target = measurement.elementRef;

    return target?.isConnected ? target : null;
  };

  const selectedPortalOffset = () => {
    const target = liveSelectedTarget();
    const mount = selectionPortalTarget();
    const ownerWindow = target?.ownerDocument.defaultView;

    if (!target || !ownerWindow || mount !== target.ownerDocument.body) return { x: 0, y: 0 };

    return { x: ownerWindow.scrollX, y: ownerWindow.scrollY };
  };

  const edgeStyle = (currentMeasurement: Measurement | InspectMeasurement, edge: "top" | "right" | "bottom" | "left") => {
    const rect = currentMeasurement.rect;
    const paintingWindow = chromeElement?.ownerDocument.defaultView;
    // The edges are DOM children of the root overlay, so its window owns the
    // raster grid even when the measured element belongs to a preview iframe.
    const ratio = paintingWindow?.devicePixelRatio || 1;
    const snap = (value: number) => Math.round(value * ratio) / ratio;
    const thickness = Math.max(1, Math.round(ratio)) / ratio;
    const bounds = chromeElement?.getBoundingClientRect();
    const originLeft = bounds?.left ?? rect.left;
    const originTop = bounds?.top ?? rect.top;
    const left = snap(originLeft);
    const right = snap(originLeft + (bounds?.width ?? rect.width));
    const top = snap(originTop);
    const bottom = snap(originTop + (bounds?.height ?? rect.height));
    // Transform the unit quad rather than laying out fractional CSS lengths.
    // Chromium snaps layout box edges before applying device scale, which can
    // turn a nominal one-device-pixel div into unequal painted edges.

    const quad = (x: number, y: number, width: number, height: number) => ({
      left: "0px", top: "0px", width: "1px", height: "1px",
      "transform-origin": "0 0",
      transform: `translate(${x}px, ${y}px) scale(${width}, ${height})`,
    });

    switch (edge) {
      case "top":
        return quad(left - originLeft, top - originTop, right - left, thickness);
      case "right":
        return quad(right - originLeft - thickness, top - originTop, thickness, bottom - top);
      case "bottom":
        return quad(left - originLeft, bottom - originTop - thickness, right - left, thickness);
      case "left":
        return quad(left - originLeft, top - originTop, thickness, bottom - top);
    }
  };

  const syncSelectedGeometry = () => {
    const target = liveSelectedTarget();

    if (!target || !chromeElement) return;
    const clipRect = responsivePreviewVisibleRect(target.ownerDocument);
    const rect = intersectRect(getRectFromDom(target), clipRect);
    const ownerWindow = target.ownerDocument.defaultView;
    const selectionRoot = chromeElement.parentElement;

    // A selected measurement is portaled to <body> for the document native-
    // anchor path. Its absolute fallback therefore uses document coordinates,
    // not viewport coordinates. Keeping this fallback correct prevents a
    // transient native-anchor handoff during direct edit from subtracting the
    // page scroll offset a second time. Local/Shadow DOM overlays keep the
    // original viewport-coordinate behavior.
    const documentLayer = Boolean(
      ownerWindow
      && selectionRoot?.parentNode === target.ownerDocument.body,
    );

    const offsetX = documentLayer ? ownerWindow!.scrollX : 0;
    const offsetY = documentLayer ? ownerWindow!.scrollY : 0;
    const left = rect.left + offsetX;
    const top = rect.top + offsetY;
    Object.assign(chromeElement.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: rect.width > 0 && rect.height > 0 ? "" : "none",
    });

    const edgeNames = ["top", "right", "bottom", "left"] as const;

    for (const edge of edgeNames) {
      const element = chromeElement.querySelector<SVGSVGElement>(`[data-mesurer-selection-edge="${edge}"]`);

      if (!element) continue;

      for (const [property, value] of Object.entries(edgeStyle(props.measurement!, edge))) {
        element.style.setProperty(property, value);
      }
    }

    if (labelElement) {
      Object.assign(labelElement.style, {
        left: `${left + rect.width / 2}px`,
        top: `${top + rect.height + MEASURE_LABEL_OFFSET}px`,
        display: rect.width > 0 && rect.height > 0 && labelIsVisible({ ...props.measurement!, rect }) ? "" : "none",
      });
    }
  };

  onSettled(() => {
    const target = liveSelectedTarget();
    const ownerWindow = target?.ownerDocument.defaultView;

    if (!target || !ownerWindow) return;

    // A selected page element can start inside Mesurer's isolated ShadowRoot,
    // while its source target still belongs to the document. Let Solid own the
    // move into <body> through <Portal>; imperatively reparenting this rendered
    // root breaks the reconciler when direct editing changes reactive state.
    // Targets that genuinely live in a ShadowRoot keep local overlay ownership.
    const rendererDocument = chromeElement?.ownerDocument;

    const documentBacked = target.ownerDocument === rendererDocument
      && target.getRootNode() === target.ownerDocument
      && Boolean(target.ownerDocument.body);

    if (documentBacked) setSelectionPortalTarget(target.ownerDocument.body);
    else setSelectionPortalTarget(null);

    const unregisterTarget = chromeElement && documentBacked
      ? registerSelectionChromeTarget(chromeElement, target)
      : null;

    // Native absolute anchors already follow window/document scrolling. A
    // portaled surface does not inherit nested overflow scrolling, so compensate
    // only that ancestor delta from scrollTop/scrollLeft. The helper performs no
    // geometry reads and does constant work per scroll event.
    const nestedScroll = documentBacked
      ? installNestedScrollCompensation(ownerWindow, target, () => [chromeElement, labelElement])
      : null;

    let scrollFrame = 0;

    const syncOnScroll = () => {
      // Once CSS Anchor Positioning owns the selected box, JavaScript does no
      // work. During the short pre-anchor fallback, keep the event itself
      // layout-free and coalesce geometry sampling to at most one frame.
      if (chromeElement?.dataset.mesurerNativeScrollAnchor === "box" || scrollFrame) return;
      scrollFrame = ownerWindow.requestAnimationFrame(() => {
        scrollFrame = 0;

        if (chromeElement?.dataset.mesurerNativeScrollAnchor === "box") return;
        syncSelectedGeometry();
      });
    };

    // Selection geometry can change without a scroll or window resize (for
    // example, a live Typography line-height edit). Observe only the selected
    // source element and resample its box when its own rendered size changes;
    // this avoids page-wide mutation/layout work while keeping portaled chrome
    // frame-locked to the target.
    const targetResizeObserver = new ownerWindow.ResizeObserver(syncSelectedGeometry);

    const rootWindow = (() => {
      let current = ownerWindow;

      while (current.frameElement) {
        const parent = current.frameElement.ownerDocument.defaultView;

        if (!parent || parent === current) break;
        current = parent;
      }

      return current;
    })();

    syncSelectedGeometry();
    nestedScroll?.sync();
    targetResizeObserver.observe(target);
    ownerWindow.addEventListener("scroll", syncOnScroll, { capture: true, passive: true });

    const previewDocument = responsivePreviewVisibleRect(target.ownerDocument) !== undefined;

    if (rootWindow !== ownerWindow && previewDocument) {
      rootWindow.addEventListener("mesurer:responsive-preview-geometry-change", syncOnScroll);
    }

    ownerWindow.addEventListener("resize", syncSelectedGeometry, true);

    if (rootWindow !== ownerWindow && previewDocument) rootWindow.addEventListener("resize", syncSelectedGeometry, true);

    return () => {
      targetResizeObserver.disconnect();
      unregisterTarget?.();
      nestedScroll?.release();

      if (scrollFrame) ownerWindow.cancelAnimationFrame(scrollFrame);
      ownerWindow.removeEventListener("scroll", syncOnScroll, true);

      if (rootWindow !== ownerWindow && previewDocument) {
        rootWindow.removeEventListener("mesurer:responsive-preview-geometry-change", syncOnScroll);
      }

      ownerWindow.removeEventListener("resize", syncSelectedGeometry, true);

      if (rootWindow !== ownerWindow && previewDocument) rootWindow.removeEventListener("resize", syncSelectedGeometry, true);
    };
  });

  const surfaces = (measurement: () => Measurement | InspectMeasurement) => <>
    <Show when={!isSelectionGroup()}>
      <div ref={(element) => { chromeElement = element; }} data-mesurer-measurement-chrome="true" data-mesurer-selected-outline={isSelectedMeasurement() ? "true" : undefined} class="msr:pointer-events-none msr:absolute" style={{
        left: `${measurement().rect.left + selectedPortalOffset().x}px`,
        top: `${measurement().rect.top + selectedPortalOffset().y}px`,
        width: `${measurement().rect.width}px`,
        height: `${measurement().rect.height}px`,
        "z-index": isSelectedMeasurement() ? SELECTED_CHROME_Z_INDEX : undefined,
        "background-color": props.fillColor,
        transition: transition(),
        "transition-property": isSelectedMeasurement() ? "none" : "left, top, width, height",
        "transition-duration": isSelectedMeasurement() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
        animation: "none",
        "animation-name": "none",
      }}>
        <Show when={liveSelectedTarget() && responsivePreviewVisibleRect(liveSelectedTarget()!.ownerDocument) !== undefined} fallback={<>
          <Show when={edges().top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
          <Show when={edges().right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
          <Show when={edges().bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
          <Show when={edges().left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
        </>}>
        {/* oxlint-disable anti-slop/no-shape-in-symbol-names -- Standard SVG paint attribute. */}
        <Show when={edges().top}><svg data-mesurer-selection-edge="top" class="msr:absolute" style={edgeStyle(measurement(), "top")}><rect width="1" height="1" fill={props.outlineColor} shape-rendering="crispEdges" /></svg></Show>
        <Show when={edges().right}><svg data-mesurer-selection-edge="right" class="msr:absolute" style={edgeStyle(measurement(), "right")}><rect width="1" height="1" fill={props.outlineColor} shape-rendering="crispEdges" /></svg></Show>
        <Show when={edges().bottom}><svg data-mesurer-selection-edge="bottom" class="msr:absolute" style={edgeStyle(measurement(), "bottom")}><rect width="1" height="1" fill={props.outlineColor} shape-rendering="crispEdges" /></svg></Show>
        <Show when={edges().left}><svg data-mesurer-selection-edge="left" class="msr:absolute" style={edgeStyle(measurement(), "left")}><rect width="1" height="1" fill={props.outlineColor} shape-rendering="crispEdges" /></svg></Show>
        {/* oxlint-enable anti-slop/no-shape-in-symbol-names */}
        </Show>
      </div>
    </Show>
    <Show when={props.showLabel !== false && labelIsVisible(measurement())}>
      <div ref={(element) => { labelElement = element; }} data-mesurer-measurement-label="true" class="msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:-translate-x-1/2 msr:bg-ink-900/90" style={{
        left: `${measurement().rect.left + selectedPortalOffset().x + measurement().rect.width / 2}px`,
        top: `${measurement().rect.top + selectedPortalOffset().y + measurement().rect.height + MEASURE_LABEL_OFFSET}px`,
        "z-index": isSelectedMeasurement() ? SELECTED_CHROME_Z_INDEX : undefined,
        // Document-backed virtual groups have no intrinsic containing-block width.
        // Preserve a compact one-line dimensions badge instead of wrapping
        // width, x, and height into separate lines.
        "white-space": "nowrap",
        transition: labelTransition(),
        "transition-property": isSelectedMeasurement() ? "none" : "left, top",
        "transition-duration": isSelectedMeasurement() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
        animation: "none",
        "animation-name": "none",
      }}>
        {formatValue(labelRect(measurement()).width)} x {formatValue(labelRect(measurement()).height)}
      </div>
    </Show>
  </>;

  const labelIsVisible = (measurement: Measurement | InspectMeasurement) => {
    const bounds = liveSelectedTarget()
      ? responsivePreviewVisibleRect(liveSelectedTarget()!.ownerDocument)
      : props.clipRect;

    if (!bounds) return true;
    const rect = measurement.rect;
    const center = rect.left + rect.width / 2;
    const top = rect.top + rect.height + MEASURE_LABEL_OFFSET;

    return center >= bounds.left && center <= bounds.left + bounds.width
      && top >= bounds.top && top + 18 <= bounds.top + bounds.height;
  };

  return (
    <Show when={props.measurement}>
      {(measurement) => <Show
        when={isSelectedMeasurement() && !isSelectionGroup() ? selectionPortalTarget() : null}
        fallback={<div class="msr:pointer-events-none" data-mesurer-measurement="true" data-mesurer-selected-measurement={"paddingRect" in measurement() ? "true" : undefined} data-mesurer-selection-group={isSelectionGroup() ? "true" : undefined}>
          {surfaces(measurement)}
        </div>}
      >
        {(mount) => <Portal mount={mount()}>
          <div
            class="msr:pointer-events-none"
            data-mesurer-measurement="true"
            data-mesurer-selected-measurement="true"
            data-mesurer-inspector-ui="true"
            data-theme={props.theme ?? "system"}
          >
            {surfaces(measurement)}
          </div>
        </Portal>}
      </Show>}
    </Show>
  );
}
