import { For, Show, onSettled } from "solid-js";
import { GUIDE_DRAG_HOLD_MS, GUIDE_HITBOX_SIZE, MEASURE_LABEL_OFFSET } from "../core/constants";
import { getEdgeVisibilityForRects } from "../core/edge-visibility";
import type { Guide, InspectMeasurement, Rect } from "../core/types";
import { formatValue } from "../core/utils";
import type { MeasurerModel } from "../model/create-measurer-model";
import { DistanceOverlayItem } from "./DistanceOverlayItem";
import { MeasurementBox } from "./MeasurementBox";

export type MeasurerOverlayProps = {
  model: MeasurerModel;
  displayedSelectedMeasurements: InspectMeasurement[];
  activeRect: Rect | null;
  optionPairOverlay: import("../core/types").DistanceOverlay | null;
  guideDistanceOverlay: import("../core/types").DistanceOverlay | null;
  optionContainerLines: ReturnType<typeof import("../core/option-measurements").getOptionContainerLines>;
  hoverGuide: Guide | null;
  interactive: boolean;
  onPointerDown: (event: any) => void;
  onPointerMove: (event: any) => void;
  onPointerUp: (event: any) => void;
  onPointerLeave: (event: any) => void;
  onGuidePointerDown: (guide: Guide, event: any) => void;
  onGuidePointerUp: (guide: Guide, event: any) => void;
};

const Tag = (props: { axis: "x" | "y"; left: number; top: number; children: any }) => (
  <div class={`msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:bg-ink-900/90 ${props.axis === "x" ? "msr:-translate-x-1/2" : "msr:-translate-y-1/2"}`} style={{ left: `${props.left}px`, top: `${props.top}px` }}>{props.children}</div>
);

export function MeasurerOverlay(props: MeasurerOverlayProps) {
  let overlayElement: HTMLDivElement | undefined;
  let passiveGuideDrag: {
    id: string;
    orientation: Guide["orientation"];
    pointerId: number;
    previousUserSelect: string | null;
  } | null = null;
  let guideHoldTimer = 0;
  let guideHoldId: string | null = null;

  const selectionVisible = () => props.model.state.toolMode === "select";
  const guidesMode = () => props.model.state.toolMode === "guides";
  const overlayVisible = () => props.model.state.enabled;
  const overlayInteractive = () => props.interactive && overlayVisible() && props.model.state.toolMode !== "none" && props.model.state.toolMode !== "text-inspector";
  const guidePointerEvents = () => props.interactive && (props.model.state.toolMode !== "none" || props.model.state.rulersVisible);
  const outline = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 80%, transparent)`;
  const fill = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 8%, transparent)`;
  const displayedMeasurements = () => props.model.state.settings.multiMeasureEnabled && props.model.state.measurements.length > 0
    ? props.model.state.measurements
    : props.model.state.activeMeasurement ? [props.model.state.activeMeasurement] : [];
  const measurementEdges = () => getEdgeVisibilityForRects(displayedMeasurements().map((item) => item.rect));
  const selectedEdges = () => getEdgeVisibilityForRects(props.displayedSelectedMeasurements.map((item) => item.rect));
  const hoverEdges = () => {
    const hoverRect = props.model.state.hoverRect;
    if (!hoverRect) return null;
    return getEdgeVisibilityForRects([
      hoverRect,
      ...props.displayedSelectedMeasurements.map((item) => item.rect),
    ])[0] ?? null;
  };
  const guideColor = (kind: "active" | "hover" | "default" | "preview") => {
    const amount = kind === "active" ? 100 : kind === "hover" ? 90 : kind === "preview" ? 50 : 70;
    return `color-mix(in oklch, ${props.model.state.settings.guideColor} ${amount}%, transparent)`;
  };
  const renderedGuides = (): Guide[] => {
    if (props.model.state.guides.length > 0) return props.model.state.guides;
    if (!props.model.state.settingsOpen || props.model.state.settingsTab !== "guides") return props.model.state.guides;
    const ownerWindow = overlayElement?.ownerDocument.defaultView;
    if (!ownerWindow) return props.model.state.guides;
    return [
      { id: "__mesurer-preview-vertical", orientation: "vertical", position: ownerWindow.innerWidth / 2 },
      { id: "__mesurer-preview-horizontal", orientation: "horizontal", position: ownerWindow.innerHeight / 2 },
    ];
  };

  const clearGuideHold = () => {
    if (guideHoldTimer) overlayElement?.ownerDocument.defaultView?.clearTimeout(guideHoldTimer);
    guideHoldTimer = 0;
    guideHoldId = null;
  };

  const interactiveGuideDown = (guide: Guide, event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (!props.model.current.enabled || props.model.current.settingsOpen || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    props.model.checkpoint();
    if (event.shiftKey) {
      props.model.setSelectedGuideIds(
        props.model.current.selectedGuideIds.includes(guide.id)
          ? props.model.current.selectedGuideIds.filter((id) => id !== guide.id)
          : [...props.model.current.selectedGuideIds, guide.id],
      );
      return;
    }
    props.model.setSelectedGuideIds([guide.id]);
    clearGuideHold();
    const ownerWindow = event.currentTarget.ownerDocument.defaultView;
    if (ownerWindow) {
      guideHoldId = guide.id;
      guideHoldTimer = ownerWindow.setTimeout(() => {
        guideHoldTimer = 0;
        if (guideHoldId === guide.id) props.model.setTransient({ draggingGuideId: guide.id });
      }, GUIDE_DRAG_HOLD_MS);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const interactiveGuideUp = (guide: Guide, event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    event.stopPropagation();
    clearGuideHold();
    if (props.model.current.draggingGuideId === guide.id) props.model.setTransient({ draggingGuideId: null });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  onSettled(() => {
    const ownerWindow = overlayElement?.ownerDocument.defaultView;
    const ownerDocument = overlayElement?.ownerDocument;
    if (!ownerWindow || !ownerDocument) return;

    const handlePassiveGuideDown = (event: PointerEvent) => {
      if (!props.model.current.enabled || props.model.current.settingsOpen || props.model.current.toolMode !== "none") return;
      const toolbarTarget = event.composedPath().some((target) =>
        target instanceof ownerWindow.Element && target.hasAttribute("data-mesurer-toolbar"),
      );
      if (toolbarTarget) return;

      const point = { x: event.clientX, y: event.clientY };
      const guide = props.model.current.guides.find((candidate) => {
        const distance = candidate.orientation === "vertical"
          ? Math.abs(candidate.position - point.x)
          : Math.abs(candidate.position - point.y);
        return distance <= GUIDE_HITBOX_SIZE / 2;
      });
      if (!guide) return;

      props.model.checkpoint();
      if (event.shiftKey) {
        props.model.setSelectedGuideIds(
          props.model.current.selectedGuideIds.includes(guide.id)
            ? props.model.current.selectedGuideIds.filter((id) => id !== guide.id)
            : [...props.model.current.selectedGuideIds, guide.id],
        );
        passiveGuideDrag = null;
        return;
      }

      props.model.setSelectedGuideIds([guide.id]);
      if (event.button === 0) {
        passiveGuideDrag = {
          id: guide.id,
          orientation: guide.orientation,
          pointerId: event.pointerId,
          previousUserSelect: null,
        };
      }
    };

    const handlePassiveGuideMove = (event: PointerEvent) => {
      const drag = passiveGuideDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const guide = props.model.current.guides.find((candidate) => candidate.id === drag.id);
      if (!guide) return;
      event.preventDefault();
      if (drag.previousUserSelect === null) {
        drag.previousUserSelect = ownerDocument.documentElement.style.userSelect;
        ownerDocument.documentElement.style.userSelect = "none";
        ownerWindow.getSelection()?.removeAllRanges();
      }
      props.model.updateGuide(drag.id, {
        position: drag.orientation === "vertical" ? event.clientX : event.clientY,
      });
    };

    const handlePassiveGuideEnd = (event: PointerEvent) => {
      const drag = passiveGuideDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.previousUserSelect !== null) ownerDocument.documentElement.style.userSelect = drag.previousUserSelect;
      passiveGuideDrag = null;
    };

    ownerWindow.addEventListener("pointerdown", handlePassiveGuideDown, true);
    ownerWindow.addEventListener("pointermove", handlePassiveGuideMove, true);
    ownerWindow.addEventListener("pointerup", handlePassiveGuideEnd, true);
    ownerWindow.addEventListener("pointercancel", handlePassiveGuideEnd, true);
    return () => {
      ownerWindow.removeEventListener("pointerdown", handlePassiveGuideDown, true);
      ownerWindow.removeEventListener("pointermove", handlePassiveGuideMove, true);
      ownerWindow.removeEventListener("pointerup", handlePassiveGuideEnd, true);
      ownerWindow.removeEventListener("pointercancel", handlePassiveGuideEnd, true);
      clearGuideHold();
      if (passiveGuideDrag?.previousUserSelect !== null && passiveGuideDrag) {
        ownerDocument.documentElement.style.userSelect = passiveGuideDrag.previousUserSelect;
      }
      passiveGuideDrag = null;
    };
  });

  return (
    <div
      ref={(element) => { overlayElement = element; }}
      class={`msr:absolute msr:inset-0 msr:select-none ${overlayVisible() ? `msr:pointer-events-auto ${guidesMode() ? props.hoverGuide || props.model.state.draggingGuideId ? "msr:cursor-default" : "msr:cursor-crosshair" : "msr:cursor-default"} msr:opacity-100` : "msr:pointer-events-none msr:opacity-0"}`}
      style={{ "pointer-events": overlayInteractive() ? "auto" : "none" }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerLeave={props.onPointerLeave}
    >
      <Show when={selectionVisible()}>
        <For each={displayedMeasurements()}>{(measurement, index) => <MeasurementBox measurement={measurement} edgeVisibility={measurementEdges()[index()]} outlineColor={outline()} fillColor={fill()} />}</For>

        <Show when={props.activeRect && props.model.state.isDragging}><>
          <div class="msr:pointer-events-none msr:absolute" style={{ left: `${props.activeRect!.left}px`, top: `${props.activeRect!.top}px`, width: `${props.activeRect!.width}px`, height: `${props.activeRect!.height}px`, "background-color": fill() }}>
            <div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} />
            <div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} />
          </div>
          <Tag axis="x" left={props.activeRect!.left + props.activeRect!.width / 2} top={props.activeRect!.top + props.activeRect!.height + MEASURE_LABEL_OFFSET}>{formatValue(props.activeRect!.width)} x {formatValue(props.activeRect!.height)}</Tag>
        </></Show>

        <Show when={props.model.state.hoverRect && props.model.state.settings.hoverHighlightEnabled && props.model.state.selectedMeasurements.length <= 1}>
          <div class="msr:pointer-events-none msr:absolute" style={{ left: `${props.model.state.hoverRect!.left}px`, top: `${props.model.state.hoverRect!.top}px`, width: `${props.model.state.hoverRect!.width}px`, height: `${props.model.state.hoverRect!.height}px`, "background-color": fill() }}>
            <Show when={hoverEdges()?.top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} /></Show>
            <Show when={hoverEdges()?.right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} /></Show>
            <Show when={hoverEdges()?.bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": outline() }} /></Show>
            <Show when={hoverEdges()?.left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": outline() }} /></Show>
          </div>
        </Show>
      </Show>

      <Show when={props.interactive && guidesMode() && props.model.state.guidePreview && !props.model.state.draggingGuideId}>
        <div class="msr:pointer-events-none msr:absolute" style={props.model.state.guidePreview!.orientation === "vertical"
          ? { left: `${props.model.state.guidePreview!.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: "100%" }
          : { top: `${props.model.state.guidePreview!.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: "100%" }}>
          <div class="msr:absolute" style={props.model.state.guidePreview!.orientation === "vertical"
            ? { left: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, top: "0", width: "2px", height: "100%", "background-color": guideColor("preview") }
            : { top: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, left: "0", height: "2px", width: "100%", "background-color": guideColor("preview") }} />
        </div>
      </Show>

      <Show when={selectionVisible()}>
        <For each={props.displayedSelectedMeasurements}>{(measurement, index) => <MeasurementBox measurement={measurement} edgeVisibility={selectedEdges()[index()]} outlineColor={outline()} fillColor={fill()} />}</For>
      </Show>

      <For each={props.model.state.heldDistances}>{(distance) => <DistanceOverlayItem distance={distance} onRemove={props.model.removeHeldDistance} />}</For>
      <Show when={selectionVisible() && props.model.state.altPressed && props.optionPairOverlay}><DistanceOverlayItem distance={props.optionPairOverlay!} /></Show>
      <Show when={props.interactive && guidesMode() && props.model.state.altPressed && props.guideDistanceOverlay}><DistanceOverlayItem distance={props.guideDistanceOverlay!} /></Show>

      <Show when={selectionVisible() && props.model.state.altPressed && props.optionContainerLines}>{(lines) => <>
        <Show when={lines().top.value > 0}><><div class="msr:absolute msr:w-px msr:bg-[#2563eb]" style={{ top: `${lines().top.y1}px`, height: `${lines().top.y2 - lines().top.y1}px`, left: `${lines().top.x}px` }} /><Tag axis="y" left={lines().top.x + MEASURE_LABEL_OFFSET} top={(lines().top.y1 + lines().top.y2) / 2}>{formatValue(lines().top.value)}</Tag></></Show>
        <Show when={lines().bottom.value > 0}><><div class="msr:absolute msr:w-px msr:bg-[#2563eb]" style={{ top: `${lines().bottom.y1}px`, height: `${lines().bottom.y2 - lines().bottom.y1}px`, left: `${lines().bottom.x}px` }} /><Tag axis="y" left={lines().bottom.x + MEASURE_LABEL_OFFSET} top={(lines().bottom.y1 + lines().bottom.y2) / 2}>{formatValue(lines().bottom.value)}</Tag></></Show>
        <Show when={lines().left.value > 0}><><div class="msr:absolute msr:h-px msr:bg-[#2563eb]" style={{ left: `${lines().left.x1}px`, width: `${lines().left.x2 - lines().left.x1}px`, top: `${lines().left.y}px` }} /><Tag axis="x" left={(lines().left.x1 + lines().left.x2) / 2} top={lines().left.y + MEASURE_LABEL_OFFSET}>{formatValue(lines().left.value)}</Tag></></Show>
        <Show when={lines().right.value > 0}><><div class="msr:absolute msr:h-px msr:bg-[#2563eb]" style={{ left: `${lines().right.x1}px`, width: `${lines().right.x2 - lines().right.x1}px`, top: `${lines().right.y}px` }} /><Tag axis="x" left={(lines().right.x1 + lines().right.x2) / 2} top={lines().right.y + MEASURE_LABEL_OFFSET}>{formatValue(lines().right.value)}</Tag></></Show>
      </>}</Show>

      <For each={renderedGuides()}>{(guide) => {
        const previewGuide = guide.id.startsWith("__mesurer-preview-");
        const selected = () => !previewGuide && props.model.state.selectedGuideIds.includes(guide.id);
        const hovered = () => !previewGuide && props.hoverGuide?.id === guide.id;
        const strokeColor = () => selected() ? guideColor("active") : hovered() ? guideColor("hover") : guideColor("default");
        const strokeWidth = () => Math.max(props.model.state.settings.guideStyle.width, selected() || hovered() ? 2 : props.model.state.settings.guideStyle.width);
        const backgroundImage = () => props.model.state.settings.guideStyle.pattern === "solid" ? undefined
          : props.model.state.settings.guideStyle.pattern === "dotted"
            ? `radial-gradient(circle, ${strokeColor()} 0 ${strokeWidth() / 2}px, transparent ${strokeWidth() / 2 + 0.5}px)`
            : `repeating-linear-gradient(${guide.orientation === "vertical" ? "to bottom" : "to right"}, ${strokeColor()} 0 ${props.model.state.settings.guideStyle.dashLength}px, transparent ${props.model.state.settings.guideStyle.dashLength}px ${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px)`;
        const backgroundSize = () => props.model.state.settings.guideStyle.pattern === "dotted"
          ? guide.orientation === "vertical" ? `${strokeWidth()}px ${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px` : `${props.model.state.settings.guideStyle.dashLength + props.model.state.settings.guideStyle.gap}px ${strokeWidth()}px`
          : undefined;
        return <div class="msr:absolute" data-mesurer-guide="true" style={guide.orientation === "vertical"
          ? { left: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: "100%", "pointer-events": !previewGuide && guidePointerEvents() ? "auto" : "none" }
          : { top: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: "100%", "pointer-events": !previewGuide && guidePointerEvents() ? "auto" : "none" }}
          onPointerDown={(event) => { if (!previewGuide && props.model.current.toolMode !== "none") interactiveGuideDown(guide, event); }}
          onPointerUp={(event) => { if (!previewGuide && props.model.current.toolMode !== "none") interactiveGuideUp(guide, event); }}
          onPointerCancel={(event) => { if (!previewGuide && props.model.current.toolMode !== "none") interactiveGuideUp(guide, event); }}>
          <div class="msr:absolute" style={guide.orientation === "vertical"
            ? { left: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, top: "0", width: `${strokeWidth()}px`, height: "100%", "background-color": props.model.state.settings.guideStyle.pattern === "solid" ? strokeColor() : "transparent", "background-image": backgroundImage(), "background-size": backgroundSize(), opacity: props.model.state.settings.guideStyle.opacity }
            : { top: `${GUIDE_HITBOX_SIZE / 2 - 1}px`, left: "0", height: `${strokeWidth()}px`, width: "100%", "background-color": props.model.state.settings.guideStyle.pattern === "solid" ? strokeColor() : "transparent", "background-image": backgroundImage(), "background-size": backgroundSize(), opacity: props.model.state.settings.guideStyle.opacity }} />
        </div>;
      }}</For>
    </div>
  );
}
