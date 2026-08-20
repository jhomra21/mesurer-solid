import { For, Show } from "solid-js";
import type { DistanceOverlay } from "../core/types";
import { formatValue } from "../core/utils";
import { MEASURE_LABEL_OFFSET } from "../core/constants";

export type DistanceOverlayItemProps = {
  distance: DistanceOverlay;
  onRemove?: (id: string) => void;
};

const Tag = (props: { axis: "x" | "y"; left: number; top: number; children: any }) => (
  <div class={`msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:bg-ink-900/90 ${props.axis === "x" ? "msr:-translate-x-1/2" : "msr:-translate-y-1/2"}`} style={{ left: `${props.left}px`, top: `${props.top}px` }}>{props.children}</div>
);

export function DistanceOverlayItem(props: DistanceOverlayItemProps) {
  return (
    <div class={props.onRemove ? "msr:pointer-events-auto" : "msr:pointer-events-none"} onClick={props.onRemove ? (event) => { event.stopPropagation(); props.onRemove?.(props.distance.id); } : undefined}>
      <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectA.left}px`, top: `${props.distance.rectA.top}px`, width: `${props.distance.rectA.width}px`, height: `${props.distance.rectA.height}px` }} />
      <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectB.left}px`, top: `${props.distance.rectB.top}px`, width: `${props.distance.rectB.width}px`, height: `${props.distance.rectB.height}px` }} />
      <For each={props.distance.connectors}>{(connector) => Math.abs(connector.x1 - connector.x2) < 1
        ? <div class="msr:absolute msr:border-l msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${connector.x1}px`, top: `${Math.min(connector.y1, connector.y2)}px`, height: `${Math.abs(connector.y2 - connector.y1)}px` }} />
        : <div class="msr:absolute msr:border-t msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${Math.min(connector.x1, connector.x2)}px`, top: `${connector.y1}px`, width: `${Math.abs(connector.x2 - connector.x1)}px` }} />}
      </For>
      <Show when={props.distance.horizontal}>{(line) => <Show when={line().value > 0}><>
        <div class="msr:absolute msr:h-px msr:bg-[#2563eb]" style={{ left: `${Math.min(line().x1, line().x2)}px`, width: `${Math.abs(line().x2 - line().x1)}px`, top: `${line().y}px` }} />
        <Tag axis="x" left={(line().x1 + line().x2) / 2} top={line().y + MEASURE_LABEL_OFFSET}>{formatValue(line().value)}</Tag>
      </></Show>}</Show>
      <Show when={props.distance.vertical}>{(line) => <Show when={line().value > 0}><>
        <div class="msr:absolute msr:w-px msr:bg-[#2563eb]" style={{ top: `${Math.min(line().y1, line().y2)}px`, height: `${Math.abs(line().y2 - line().y1)}px`, left: `${line().x}px` }} />
        <Tag axis="y" left={line().x + MEASURE_LABEL_OFFSET} top={(line().y1 + line().y2) / 2}>{formatValue(line().value)}</Tag>
      </></Show>}</Show>
    </div>
  );
}
