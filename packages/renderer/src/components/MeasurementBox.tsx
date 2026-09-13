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

  const syncSelectedGeometry = () => {
    const target = liveSelectedTarget();
    if (!target || !chromeElement || !labelElement) return;
    const rect = target.getBoundingClientRect();
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
    // root breaks the reconciler when direct editing changes reactive state.
    // Targets that genuinely live in a ShadowRoot keep local overlay ownership.
    const documentBacked = target.getRootNode() === target.ownerDocument && Boolean(target.ownerDocument.body);
    if (documentBacked) setSelectionPortalTarget(target.ownerDocument.body);

    // Native absolute anchors already follow window/document scrolling. A
    // portaled surface does not inherit nested overflow scrolling, so compensate
    // only that ancestor delta from scrollTop/scrollLeft. The helper performs no
    // geometry reads and does constant work per scroll event.
    const nestedScroll = documentBacked
      ? installNestedScrollCompensation(ownerWindow, target, () => [chromeElement, labelElement])
      : null;

    const syncOnScroll = () => {
      // Once CSS Anchor Positioning owns the selected box, reading the target
      // rect and writing the same geometry on every trackpad event only forces
      // layout underneath the native scroll path. Keep the JavaScript path as
      // a fallback until the native binding is actually present.
      if (chromeElement?.dataset.mesurerNativeScrollAnchor === "box") return;
      syncSelectedGeometry();
    };
    syncSelectedGeometry();
    nestedScroll?.sync();
    ownerWindow.addEventListener("scroll", syncOnScroll, true);
    ownerWindow.addEventListener("resize", syncSelectedGeometry, true);
    return () => {
      nestedScroll?.release();
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
        "z-index": isSelectedMeasurement() ? SELECTED_CHROME_Z_INDEX : undefined,
        "background-color": props.fillColor,
        transition: transition(),
        "transition-property": isSelectedMeasurement() ? "none" : "left, top, width, height",
        "transition-duration": isSelectedMeasurement() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
        animation: "none",
        "animation-name": "none",
      }}>
        <Show when={edges().top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
      </div>
    </Show>
    <div ref={labelElement} data-mesurer-measurement-label="true" class="msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:-translate-x-1/2 msr:bg-ink-900/90" style={{
      left: `${measurement().rect.left + selectedPortalOffset().x + measurement().rect.width / 2}px`,
      top: `${measurement().rect.top + selectedPortalOffset().y + measurement().rect.height + MEASURE_LABEL_OFFSET}px`,
      "z-index": isSelectedMeasurement() ? SELECTED_CHROME_Z_INDEX : undefined,
      transition: labelTransition(),
      "transition-property": isSelectedMeasurement() ? "none" : "left, top",
      "transition-duration": isSelectedMeasurement() ? "0s" : `${MEASURE_TRANSITION_MS}ms`,
      animation: "none",
      "animation-name": "none",
    }}>
      {formatValue(measurement().rect.width)} x {formatValue(measurement().rect.height)}
    </div>
  </>;

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
          >
            {surfaces(measurement)}
          </div>
        </Portal>}
      </Show>}
    </Show>
  );
}
