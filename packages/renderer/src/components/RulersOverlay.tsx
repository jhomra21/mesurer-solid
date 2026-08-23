import { For, Show, createSignal, onSettled } from "solid-js";
import { trySetPointerCapture } from "../core/events";
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

const RULER_SIZE = 18;
const RULER_LENGTH = 4000;
const TICK_STEP = 5;
const RULER_EDGE_REVEAL_DISTANCE = 32;
const RULER_FADE_MS = 100;
const ticks = Array.from({ length: RULER_LENGTH / TICK_STEP + 1 }, (_, index) => index * TICK_STEP);

export function RulersOverlay(props: RulersOverlayProps) {
  const [dragPosition, setDragPosition] = createSignal<number | null>(null);
  const [dragOrientation, setDragOrientation] = createSignal<Guide["orientation"] | null>(null);
  const [nearEdge, setNearEdge] = createSignal(false);
  let drag: { orientation: Guide["orientation"]; pointerId: number; id: string } | null = null;
  const showRulers = () => props.forceVisible || !props.settings.edgeReveal || nearEdge();
  const selectedVerticalGuides = () => props.guides.filter((guide) => guide.orientation === "vertical" && props.selectedGuideIds.includes(guide.id));
  const selectedHorizontalGuides = () => props.guides.filter((guide) => guide.orientation === "horizontal" && props.selectedGuideIds.includes(guide.id));

  onSettled(() => {
    const handlePointerMove = (event: Event) => {
      if (!props.settings.edgeReveal) return;
      const pointer = event as MouseEvent;
      const nearHorizontalEdge = pointer.clientX <= RULER_EDGE_REVEAL_DISTANCE || pointer.clientX >= props.ownerWindow.innerWidth - RULER_EDGE_REVEAL_DISTANCE;
      const nearVerticalEdge = pointer.clientY <= RULER_EDGE_REVEAL_DISTANCE || pointer.clientY >= props.ownerWindow.innerHeight - RULER_EDGE_REVEAL_DISTANCE;
      setNearEdge(nearHorizontalEdge || nearVerticalEdge);
    };
    props.ownerWindow.document.addEventListener("pointermove", handlePointerMove, true);
    props.ownerWindow.document.addEventListener("mousemove", handlePointerMove, true);
    return () => {
      props.ownerWindow.document.removeEventListener("pointermove", handlePointerMove, true);
      props.ownerWindow.document.removeEventListener("mousemove", handlePointerMove, true);
    };
  });

  const beginGuideDrag = (orientation: Guide["orientation"], event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!props.interactive || event.button !== 0) return;
    event.stopPropagation();
    const position = orientation === "horizontal" ? event.clientY : event.clientX;
    setDragPosition(position);
    setDragOrientation(orientation);
    drag = { orientation, pointerId: event.pointerId, id: props.onStartGuide(orientation, position) };
    trySetPointerCapture(event.currentTarget, event.pointerId);
  };
  const moveGuide = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const position = drag.orientation === "horizontal" ? event.clientY : event.clientX;
    setDragPosition(position);
    props.onMoveGuide(drag.id, position);
  };
  const finishGuideDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const current = drag;
    const position = current.orientation === "horizontal" ? event.clientY : event.clientX;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag = null;
    setDragPosition(null);
    setDragOrientation(null);
    props.onMoveGuide(current.id, position);
    props.onFinishGuide(current.id);
  };
  const cancelGuideDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const id = drag.id;
    drag = null;
    setDragPosition(null);
    setDragOrientation(null);
    props.onCancelGuide(id);
  };

  return (
    <div aria-hidden="true" data-mesurer-rulers="true" class="msr:pointer-events-none msr:absolute msr:inset-0 msr:select-none msr:text-[9px] msr:text-[#64748b]" style={{ opacity: showRulers() ? props.settings.opacity : 0, transition: `opacity ${RULER_FADE_MS}ms ease` }}>
      <div class="msr:absolute msr:left-[18px] msr:right-0 msr:top-0 msr:overflow-hidden msr:bg-white" style={{ "box-shadow": "0 1px 3px rgba(0, 0, 0, 0.12)", height: `${RULER_SIZE}px`, cursor: "ns-resize", "pointer-events": showRulers() && props.interactive ? "auto" : "none" }} onPointerDown={(event) => beginGuideDrag("horizontal", event)} onPointerMove={moveGuide} onPointerUp={finishGuideDrag} onPointerCancel={cancelGuideDrag}>
        <svg class="msr:block msr:h-6" width={RULER_LENGTH} height={RULER_SIZE} viewBox={`0 0 ${RULER_LENGTH} ${RULER_SIZE}`}>
          <defs><linearGradient id="ruler-label-fade-x" x1="0%" x2="100%"><stop offset="0" stop-color="white" stop-opacity="0" /><stop offset="0.2" stop-color="white" /><stop offset="0.8" stop-color="white" /><stop offset="1" stop-color="white" stop-opacity="0" /></linearGradient></defs>
          <For each={ticks}>{(x) => { const major = x % 100 === 0; const medium = x % 50 === 0; return <g><line x1={x} y1={RULER_SIZE} x2={x} y2={major ? 8 : medium ? 13 : 17} stroke="currentColor" stroke-width="1" /><Show when={major}><text x={x} y="8" text-anchor="middle" fill="currentColor">{x}</text></Show></g>; }}</For>
          <For each={selectedVerticalGuides()}>{(guide) => <g><rect x={guide.position - RULER_SIZE - 8} y="-1" width="48" height="12" fill="url(#ruler-label-fade-x)" /><text x={guide.position - RULER_SIZE + 16} y="8" text-anchor="middle" fill="#ef4444" font-weight="600">{Math.round(guide.position - RULER_SIZE)}</text></g>}</For>
          <Show when={dragOrientation() === "vertical" && dragPosition() !== null}><g><rect x={dragPosition()! - RULER_SIZE - 8} y="-1" width="48" height="12" fill="url(#ruler-label-fade-x)" /><text x={dragPosition()! - RULER_SIZE + 16} y="8" text-anchor="middle" fill="#ef4444" font-weight="600">{Math.round(dragPosition()! - RULER_SIZE)}</text></g></Show>
        </svg>
      </div>

      <div class="msr:absolute msr:bottom-0 msr:left-0 msr:top-[18px] msr:w-[18px] msr:overflow-hidden msr:bg-white" style={{ "box-shadow": "1px 0 3px rgba(0, 0, 0, 0.12)", width: `${RULER_SIZE}px`, cursor: "ew-resize", "pointer-events": showRulers() && props.interactive ? "auto" : "none" }} onPointerDown={(event) => beginGuideDrag("vertical", event)} onPointerMove={moveGuide} onPointerUp={finishGuideDrag} onPointerCancel={cancelGuideDrag}>
        <svg class="msr:block msr:w-6" width={RULER_SIZE} height={RULER_LENGTH} viewBox={`0 0 ${RULER_SIZE} ${RULER_LENGTH}`}>
          <defs><linearGradient id="ruler-label-fade-y" y1="0%" y2="100%"><stop offset="0" stop-color="white" stop-opacity="0" /><stop offset="0.2" stop-color="white" /><stop offset="0.8" stop-color="white" /><stop offset="1" stop-color="white" stop-opacity="0" /></linearGradient></defs>
          <For each={ticks}>{(y) => { const major = y % 100 === 0; const medium = y % 50 === 0; return <g><line x1={RULER_SIZE} y1={y} x2={major ? 8 : medium ? 13 : 17} y2={y} stroke="currentColor" stroke-width="1" /><Show when={major}><text x="8" y={y + 10} fill="currentColor" transform={`rotate(-90 8 ${y + 10})`}>{y}</text></Show></g>; }}</For>
          <For each={selectedHorizontalGuides()}>{(guide) => <g><rect x="-3" y={guide.position - RULER_SIZE - 38} width="24" height="48" fill="url(#ruler-label-fade-y)" /><text x="9" y={guide.position - RULER_SIZE - 16} text-anchor="middle" fill="#ef4444" font-weight="600" transform={`rotate(-90 9 ${guide.position - RULER_SIZE - 16})`}>{Math.round(guide.position - RULER_SIZE)}</text></g>}</For>
          <Show when={dragOrientation() === "horizontal" && dragPosition() !== null}><g><rect x="-3" y={dragPosition()! - RULER_SIZE - 38} width="24" height="48" fill="url(#ruler-label-fade-y)" /><text x="9" y={dragPosition()! - RULER_SIZE - 16} text-anchor="middle" fill="#ef4444" font-weight="600" transform={`rotate(-90 9 ${dragPosition()! - RULER_SIZE - 16})`}>{Math.round(dragPosition()! - RULER_SIZE)}</text></g></Show>
        </svg>
      </div>
      <div class="msr:absolute msr:left-0 msr:top-0 msr:size-[18px] msr:bg-white" />
    </div>
  );
}
