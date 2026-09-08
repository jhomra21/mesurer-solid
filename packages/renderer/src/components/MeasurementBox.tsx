import { Show, onSettled } from "solid-js";
import type { InspectMeasurement, Measurement } from "../core/types";
import type { EdgeVisibility } from "../core/edge-visibility";
import { MEASURE_LABEL_OFFSET, MEASURE_TRANSITION_MS } from "../core/constants";

export type MeasurementBoxProps = {
  measurement: Measurement | InspectMeasurement | null;
  outlineColor: string;
  fillColor: string;
  edgeVisibility?: EdgeVisibility;
};

const allEdges: EdgeVisibility = { top: true, right: true, bottom: true, left: true };
const formatValue = (value: number) => Math.round(value);

export function MeasurementBox(props: MeasurementBoxProps) {
  let chromeElement: HTMLDivElement | undefined;
  let labelElement: HTMLDivElement | undefined;
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

  const syncSelectedGeometry = () => {
    const target = liveSelectedTarget();
    if (!target || !chromeElement || !labelElement) return;
    const rect = target.getBoundingClientRect();
    Object.assign(chromeElement.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    Object.assign(labelElement.style, {
      left: `${rect.left + rect.width / 2}px`,
      top: `${rect.top + rect.height + MEASURE_LABEL_OFFSET}px`,
    });
  };

  onSettled(() => {
    const ownerWindow = liveSelectedTarget()?.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const syncGeometry = () => syncSelectedGeometry();
    syncGeometry();
    ownerWindow.addEventListener("scroll", syncGeometry, true);
    ownerWindow.addEventListener("resize", syncGeometry, true);
    return () => {
      ownerWindow.removeEventListener("scroll", syncGeometry, true);
      ownerWindow.removeEventListener("resize", syncGeometry, true);
    };
  });

  return (
    <Show when={props.measurement}>
      {(measurement) => <div class="msr:pointer-events-none" data-mesurer-measurement="true" data-mesurer-selected-measurement={"paddingRect" in measurement() ? "true" : undefined} data-mesurer-selection-group={isSelectionGroup() ? "true" : undefined}>
        <Show when={!isSelectionGroup()}>
          <div ref={chromeElement} class="msr:absolute" style={{
            left: `${measurement().rect.left}px`, top: `${measurement().rect.top}px`, width: `${measurement().rect.width}px`, height: `${measurement().rect.height}px`,
            "background-color": props.fillColor,
            transition: transition(),
            animation: "none",
          }}>
            <Show when={edges().top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
            <Show when={edges().right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
            <Show when={edges().bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
            <Show when={edges().left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
          </div>
        </Show>
        <div ref={labelElement} class="msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:-translate-x-1/2 msr:bg-ink-900/90" style={{
          left: `${measurement().rect.left + measurement().rect.width / 2}px`,
          top: `${measurement().rect.top + measurement().rect.height + MEASURE_LABEL_OFFSET}px`,
          transition: labelTransition(),
          animation: "none",
        }}>
          {formatValue(measurement().rect.width)} x {formatValue(measurement().rect.height)}
        </div>
      </div>}
    </Show>
  );
}
