import { Show } from "solid-js";
import type { InspectMeasurement } from "../core/types";
import { formatValue } from "../core/utils";

export type MeasurementBoxProps = {
  measurement: InspectMeasurement | null;
  color: string;
  variant: "hover" | "selected";
};

export function MeasurementBox(props: MeasurementBoxProps) {
  return (
    <Show when={props.measurement}>
      {(measurement) => (
        <div
          class={`msr-measurement msr-measurement--${props.variant}`}
          style={{
            left: `${measurement().rect.left}px`,
            top: `${measurement().rect.top}px`,
            width: `${measurement().rect.width}px`,
            height: `${measurement().rect.height}px`,
            "--msr-color": props.color,
          }}
        >
          <div class="msr-measurement__label">
            <span>{measurement().label}</span>
            <strong>
              {formatValue(measurement().rect.width)} × {formatValue(measurement().rect.height)}
            </strong>
          </div>
        </div>
      )}
    </Show>
  );
}
