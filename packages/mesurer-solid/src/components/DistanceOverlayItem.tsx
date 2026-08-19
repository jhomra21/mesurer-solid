import { For, Show } from "solid-js";
import type { DistanceOverlay } from "../core/types";
import { formatValue } from "../core/utils";

export type DistanceOverlayItemProps = {
  distance: DistanceOverlay;
  onRemove?: (id: string) => void;
};

export function DistanceOverlayItem(props: DistanceOverlayItemProps) {
  return (
    <div class="msr-distance-group">
      <For each={props.distance.connectors}>
        {(line) => (
          <span class="msr-distance-line" style={{
            left: `${Math.min(line.x1, line.x2)}px`,
            top: `${Math.min(line.y1, line.y2)}px`,
            width: `${Math.max(1, Math.abs(line.x2 - line.x1))}px`,
            height: `${Math.max(1, Math.abs(line.y2 - line.y1))}px`,
          }} />
        )}
      </For>
      <Show when={props.distance.horizontal}>
        {(line) => (
          <>
            <span class="msr-distance-line msr-distance-line--h" style={{ left: `${Math.min(line().x1, line().x2)}px`, top: `${line().y}px`, width: `${Math.abs(line().x2 - line().x1)}px` }} />
            <button
              type="button"
              class="msr-distance-tag"
              style={{ left: `${(line().x1 + line().x2) / 2}px`, top: `${line().y + 3}px` }}
              onClick={() => props.onRemove?.(props.distance.id)}
            >{formatValue(line().value)}</button>
          </>
        )}
      </Show>
      <Show when={props.distance.vertical}>
        {(line) => (
          <>
            <span class="msr-distance-line msr-distance-line--v" style={{ left: `${line().x}px`, top: `${Math.min(line().y1, line().y2)}px`, height: `${Math.abs(line().y2 - line().y1)}px` }} />
            <button
              type="button"
              class="msr-distance-tag msr-distance-tag--v"
              style={{ left: `${line().x + 3}px`, top: `${(line().y1 + line().y2) / 2}px` }}
              onClick={() => props.onRemove?.(props.distance.id)}
            >{formatValue(line().value)}</button>
          </>
        )}
      </Show>
    </div>
  );
}
