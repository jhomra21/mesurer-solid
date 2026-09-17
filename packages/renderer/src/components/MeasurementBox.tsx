import { Show, createSignal, onSettled } from "solid-js";
import { Portal } from "@solidjs/web";
import type { InspectMeasurement, Measurement } from "../core/types";
import type { EdgeVisibility } from "../core/edge-visibility";
import { MEASURE_LABEL_OFFSET, MEASURE_TRANSITION_MS } from "../core/constants";
import { installNestedScrollCompensation } from "../runtime/nested-scroll-compensation";

export type MeasurementBoxProps = {
  measurement: Measurement | InspectMeasurement | null;
  outlineColor: string;
  fillColor: string;
  edgeVisibility?: EdgeVisibility;
  showLabel?: boolean;
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
  // The post-click active measurement intentionally mirrors upstream's second
  // selection paint. MesurerOverlay suppresses that measurement's duplicate
  // dimensions label, which gives this component a narrow signal that the
  // ordinary Measurement is the selected target's paint companion rather than
  // unrelated measurement chrome.
  const isSelectionCompanion = () => Boolean(
    props.measurement
    && !("paddingRect" in props.measurement)
    && props.showLabel === false
    && props.measurement.elementRef?.isConnected,
  );
  const isSourceLinkedSelection = () => isSelectedMeasurement() || isSelectionCompanion();
  const transition = () => isSourceLinkedSelection()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease, width ${MEASURE_TRANSITION_MS}ms ease, height ${MEASURE_TRANSITION_MS}ms ease`;
  const labelTransition = () => isSourceLinkedSelection()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease`;

  const liveSelectedTarget = () => {
    const measurement = props.measurement;
    if (!measurement || !isSourceLinkedSelection()) return null;
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

  const syncSelectedGeometry = () => {
    const target = liveSelectedTarget();
    if (!target || !chromeElement || !labelElement) return;
    const rect = target.getBoundingClientRect();
    const ownerWindow = target.ownerDocument.defaultView;
    const selectionRoot = chromeElement.parentElement;
    // Selected chrome and its transient upstream-parity paint companion share
    // one document-backed source. Their absolute fallback therefore uses
    // document coordinates rather than viewport coordinates. Keeping both on
    // this path prevents the companion from becoming the fixed "ghost" box
    // visible after the page scrolls.
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
    });
    Object.assign(labelElement.style, {
      left: `${left + rect.width / 2}px`,
      top: `${top + rect.height + MEASURE_LABEL_OFFSET}px`,
    });
  };

  onSettled(() => {
    const target = liveSelectedTarget();
    const ownerWindow = target?.ownerDocument.defaultView;
    if (!target || !ownerWindow) return;

    // A selected page element can start inside Mesurer's isolated ShadowRoot,
    // while its source target still belongs to the document. Let Solid own the
    // move into <body> through <Portal>; imperatively reparenting this rendered
    // root breaks the reconciler when reactive state changes. The transient
    // selection paint companion follows the same ownership rule so it cannot
    // remain in the fixed top-layer island while the true selection scrolls.
    const documentBacked = target.getRootNode() === target.ownerDocument && Boolean(target.ownerDocument.body);
    if (documentBacked) setSelectionPortalTarget(target.ownerDocument.body);

    // Native absolute anchors already follow window/document scrolling. A
    // portaled surface does not inherit nested overflow scrolling, so compensate
    // only that ancestor delta from scrollTop/scrollLeft. The helper performs no
    // geometry reads and does constant work per scroll event.
    const nestedScroll = documentBacked
      ? installNestedScrollCompensation(ownerWindow, target, () => [chromeElement, labelElement])
      : null;

    let scrollFrame = 0;
    const syncOnScroll = () => {
      // Once CSS Anchor Positioning owns the box, JavaScript does no work.
      // During the short pre-anchor fallback, keep the event itself layout-free
      // and coalesce geometry sampling to at most one frame.
      if (chromeElement?.dataset.mesurerNativeScrollAnchor === "box" || scrollFrame) return;
      scrollFrame = ownerWindow.requestAnimationFrame(() => {
        scrollFrame = 0;
        if (chromeElement?.dataset.mesurerNativeScrollAnchor === "box") return;
        syncSelectedGeometry();
      });
    };

    // Source geometry can change without a scroll or window resize (for example,
    // a live Typography line-height edit). Observe only the selected source
    // element and resample its box when its own rendered size changes.
    const targetResizeObserver = new ownerWindow.ResizeObserver(syncSelectedGeometry);

    syncSelectedGeometry();
    nestedScroll?.sync();
    targetResizeObserver.observe(target);
    ownerWindow.addEventListener("scroll", syncOnScroll, { capture: true, passive: true });
    ownerWindow.addEventListener("resize", syncSelectedGeometry, true);
    return () => {
      targetResizeObserver.disconnect();
      nestedScroll?.release();
      if (scrollFrame) ownerWindow.cancelAnimationFrame(scrollFrame);
      ownerWindow.removeEventListener("scroll", syncOnScroll, true);
      ownerWindow.removeEventListener("resize", syncSelectedGeometry, true);
    };
  });

  const surfaces = (measurement: () => Measurement | InspectMeasurement) => <>
    <Show when={!isSelectionGroup()}>
      <div ref={chromeElement} data-mesurer-measurement-chrome="true" class="msr:absolute" style={{
        left: `${measurement().rect.left + selectedPortalOffset().x}px`,
        top: `${measurement().rect.top + selectedPortalOffset().y}px`,
        width: `${measurement().rect.width}px`,
        height: `${measurement().rect.height}px`,
        "z-index": isSourceLinkedSelection() ? SELECTED_CHROME_Z_INDEX : undefined,
        "background-color": props.fillColor,
        transition: transition(),
        "transition-property": isSourceLinkedSelection() ? "none" : "left, top, width, height",
        "transition-duration": isSourceLinkedSelection() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
        animation: "none",
        "animation-name": "none",
      }}>
        <Show when={edges().top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
      </div>
    </Show>
    <Show when={props.showLabel !== false}>
      <div ref={labelElement} data-mesurer-measurement-label="true" class="msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:-translate-x-1/2 msr:bg-ink-900/90" style={{
        left: `${measurement().rect.left + selectedPortalOffset().x + measurement().rect.width / 2}px`,
        top: `${measurement().rect.top + selectedPortalOffset().y + measurement().rect.height + MEASURE_LABEL_OFFSET}px`,
        "z-index": isSourceLinkedSelection() ? SELECTED_CHROME_Z_INDEX : undefined,
        transition: labelTransition(),
        "transition-property": isSourceLinkedSelection() ? "none" : "left, top",
        "transition-duration": isSourceLinkedSelection() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
        animation: "none",
        "animation-name": "none",
      }}>
        {formatValue(measurement().rect.width)} x {formatValue(measurement().rect.height)}
      </div>
    </Show>
  </>;

  return (
    <Show when={props.measurement}>
      {(measurement) => <Show
        when={isSourceLinkedSelection() && !isSelectionGroup() ? selectionPortalTarget() : null}
        fallback={<div
          class="msr:pointer-events-none"
          data-mesurer-measurement="true"
          data-mesurer-selected-measurement={isSelectedMeasurement() ? "true" : undefined}
          data-mesurer-selection-companion={isSelectionCompanion() ? "true" : undefined}
          data-mesurer-selection-group={isSelectionGroup() ? "true" : undefined}
        >
          {surfaces(measurement)}
        </div>}
      >
        {(mount) => <Portal mount={mount()}>
          <div
            class="msr:pointer-events-none"
            data-mesurer-measurement="true"
            data-mesurer-selected-measurement={isSelectedMeasurement() ? "true" : undefined}
            data-mesurer-selection-companion={isSelectionCompanion() ? "true" : undefined}
            data-mesurer-inspector-ui="true"
          >
            {surfaces(measurement)}
          </div>
        </Portal>}
      </Show>}
    </Show>
  );
}
