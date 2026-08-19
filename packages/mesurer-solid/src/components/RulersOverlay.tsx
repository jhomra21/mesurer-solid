import { For, Show, createSignal, onSettled } from "solid-js";
import type { Guide } from "../core/types";
import type { RulerSettings } from "../core/persistence";

export type RulersOverlayProps = {
  ownerWindow: Window;
  settings: RulerSettings;
  interactive: boolean;
  forceVisible?: boolean;
  guides: Guide[];
  selectedGuideIds: string[];
  onStartGuide: (orientation: Guide["orientation"], position: number) => string;
  onMoveGuide: (id: string, position: number) => void;
  onFinishGuide: (id: string) => void;
  onCancelGuide: (id: string) => void;
};

const RULER_SIZE = 22;
const ticks = (length: number) => Array.from({ length: Math.ceil(length / 10) + 1 }, (_, i) => i * 10);

export function RulersOverlay(props: RulersOverlayProps) {
  const [nearEdge, setNearEdge] = createSignal(false);
  const visible = () => props.forceVisible || !props.settings.edgeReveal || nearEdge();

  onSettled(() => {
    const move = (event: PointerEvent) => setNearEdge(event.clientX <= 38 || event.clientY <= 38);
    props.ownerWindow.addEventListener("pointermove", move, true);
    return () => props.ownerWindow.removeEventListener("pointermove", move, true);
  });

  const begin = (orientation: Guide["orientation"], event: PointerEvent) => {
    if (!props.interactive || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const coordinate = orientation === "vertical" ? event.clientX : event.clientY;
    const id = props.onStartGuide(orientation, coordinate);
    const move = (next: PointerEvent) => {
      props.onMoveGuide(id, orientation === "vertical" ? next.clientX : next.clientY);
    };
    const end = (next: PointerEvent) => {
      props.ownerWindow.removeEventListener("pointermove", move, true);
      props.ownerWindow.removeEventListener("pointerup", end, true);
      props.ownerWindow.removeEventListener("pointercancel", cancel, true);
      if ((orientation === "vertical" ? next.clientX : next.clientY) < 0) props.onCancelGuide(id);
      else props.onFinishGuide(id);
    };
    const cancel = () => {
      props.ownerWindow.removeEventListener("pointermove", move, true);
      props.ownerWindow.removeEventListener("pointerup", end, true);
      props.ownerWindow.removeEventListener("pointercancel", cancel, true);
      props.onCancelGuide(id);
    };
    props.ownerWindow.addEventListener("pointermove", move, true);
    props.ownerWindow.addEventListener("pointerup", end, true);
    props.ownerWindow.addEventListener("pointercancel", cancel, true);
  };

  return (
    <Show when={visible()}>
      <div class="msr-rulers" style={{ opacity: `${props.settings.opacity}` }}>
        <div class="msr-ruler-corner" />
        <div class="msr-ruler msr-ruler--top" onPointerDown={(event) => begin("vertical", event)}>
          <For each={ticks(props.ownerWindow.innerWidth)}>
            {(value) => (
              <span class={["msr-ruler-tick", { "msr-ruler-tick--major": value % 50 === 0 }]} style={{ left: `${value}px` }}>
                <Show when={value % 100 === 0}><em>{value}</em></Show>
              </span>
            )}
          </For>
        </div>
        <div class="msr-ruler msr-ruler--left" onPointerDown={(event) => begin("horizontal", event)}>
          <For each={ticks(props.ownerWindow.innerHeight)}>
            {(value) => (
              <span class={["msr-ruler-tick", { "msr-ruler-tick--major": value % 50 === 0 }]} style={{ top: `${value}px` }}>
                <Show when={value % 100 === 0}><em>{value}</em></Show>
              </span>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
