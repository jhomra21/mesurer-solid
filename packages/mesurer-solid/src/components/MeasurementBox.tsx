import { Show } from "solid-js";
import type { InspectMeasurement, Measurement, Rect } from "../core/types";
import type { EdgeVisibility } from "../core/edge-visibility";
import { formatValue } from "../core/utils";

export type MeasurementBoxProps = {
  measurement: Measurement | InspectMeasurement | null;
  outlineColor?: string;
  fillColor?: string;
  edgeVisibility?: EdgeVisibility;
  selected?: boolean;
  showBoxModel?: boolean;
};

const allEdges: EdgeVisibility = { top: true, right: true, bottom: true, left: true };
const rectStyle = (rect: Rect) => ({
  left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
});

export function MeasurementBox(props: MeasurementBoxProps) {
  const outline = () => props.outlineColor ?? "color-mix(in oklch, oklch(0.62 0.18 255) 80%, transparent)";
  const fill = () => props.fillColor ?? "color-mix(in oklch, oklch(0.62 0.18 255) 8%, transparent)";
  const edges = () => props.edgeVisibility ?? allEdges;
  const inspect = () => props.measurement && "paddingRect" in props.measurement ? props.measurement : null;

  return (
    <Show when={props.measurement}>
      {(measurement) => (
        <>
          <Show when={props.showBoxModel && inspect()}>
            {(value) => (
              <>
                <div class="msr-box-model msr-box-model--margin" style={rectStyle(value().marginRect)} />
                <div class="msr-box-model msr-box-model--padding" style={rectStyle(value().paddingRect)} />
              </>
            )}
          </Show>
          <div
            class={["msr-measurement", { "msr-measurement--selected": !!props.selected }]}
            style={{ ...rectStyle(measurement().rect), "background-color": fill() }}
          >
            <Show when={edges().top}><span class="msr-edge msr-edge--top" style={{ "background-color": outline() }} /></Show>
            <Show when={edges().right}><span class="msr-edge msr-edge--right" style={{ "background-color": outline() }} /></Show>
            <Show when={edges().bottom}><span class="msr-edge msr-edge--bottom" style={{ "background-color": outline() }} /></Show>
            <Show when={edges().left}><span class="msr-edge msr-edge--left" style={{ "background-color": outline() }} /></Show>
          </div>
          <div
            class="msr-measure-tag"
            style={{ left: `${measurement().rect.left + measurement().rect.width / 2}px`, top: `${measurement().rect.top + measurement().rect.height + 3}px` }}
          >
            {"label" in measurement() ? `${measurement().label} · ` : ""}
            {formatValue(measurement().rect.width)} × {formatValue(measurement().rect.height)}
          </div>
        </>
      )}
    </Show>
  );
}
