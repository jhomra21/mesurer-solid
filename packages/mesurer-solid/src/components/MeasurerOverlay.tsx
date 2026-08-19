import { For, Show } from "solid-js";
import { GUIDE_HITBOX_SIZE } from "../core/constants";
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

export function MeasurerOverlay(props: MeasurerOverlayProps) {
  const selectionVisible = () => props.model.state.toolMode === "select";
  const guidesMode = () => props.model.state.toolMode === "guides";
  const outline = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 80%, transparent)`;
  const fill = () => `color-mix(in oklch, ${props.model.state.settings.highlightColor} 8%, transparent)`;
  const guideColor = (kind: "active" | "hover" | "default" | "preview") => {
    const amount = kind === "active" ? 100 : kind === "hover" ? 90 : kind === "preview" ? 50 : 70;
    return `color-mix(in oklch, ${props.model.state.settings.guideColor} ${amount}%, transparent)`;
  };
  const selectedEdges = () => getEdgeVisibilityForRects(props.displayedSelectedMeasurements.map((item) => item.rect));
  const overlayInteractive = () => props.interactive && props.model.state.enabled &&
    (props.model.state.toolMode === "select" || props.model.state.toolMode === "guides");

  const guideLineStyle = (guide: Guide, color: string, width: number) => {
    const style = props.model.state.settings.guideStyle;
    const pattern = style.pattern;
    const vertical = guide.orientation === "vertical";
    const backgroundImage = pattern === "solid" ? undefined
      : pattern === "dotted"
        ? `radial-gradient(circle, ${color} 0 ${width / 2}px, transparent ${width / 2 + 0.5}px)`
        : `repeating-linear-gradient(${vertical ? "to bottom" : "to right"}, ${color} 0 ${style.dashLength}px, transparent ${style.dashLength}px ${style.dashLength + style.gap}px)`;
    return {
      ...(vertical
        ? { left: `${GUIDE_HITBOX_SIZE / 2 - width / 2}px`, top: "0", width: `${width}px`, height: "100%" }
        : { top: `${GUIDE_HITBOX_SIZE / 2 - width / 2}px`, left: "0", height: `${width}px`, width: "100%" }),
      "background-color": pattern === "solid" ? color : "transparent",
      "background-image": backgroundImage,
      "background-size": pattern === "dotted"
        ? (vertical ? `${width}px ${style.dashLength + style.gap}px` : `${style.dashLength + style.gap}px ${width}px`)
        : undefined,
      opacity: `${style.opacity}`,
    };
  };

  return (
    <div
      class={["msr-overlay", { "msr-overlay--crosshair": guidesMode() && !props.hoverGuide && !props.model.state.draggingGuideId }]}
      style={{ "pointer-events": overlayInteractive() ? "auto" : "none" }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerLeave={props.onPointerLeave}
    >
      <Show when={selectionVisible()}>
        <Show when={props.model.state.hoverRect && props.model.state.settings.hoverHighlightEnabled && props.displayedSelectedMeasurements.length <= 1}>
          <div class="msr-hover-rect" style={{
            left: `${props.model.state.hoverRect!.left}px`, top: `${props.model.state.hoverRect!.top}px`,
            width: `${props.model.state.hoverRect!.width}px`, height: `${props.model.state.hoverRect!.height}px`,
            "background-color": fill(), "outline-color": outline(),
          }} />
        </Show>

        <For each={props.displayedSelectedMeasurements}>
          {(measurement, index) => (
            <MeasurementBox
              measurement={measurement}
              selected
              showBoxModel={props.displayedSelectedMeasurements.length === 1}
              outlineColor={outline()}
              fillColor={fill()}
              edgeVisibility={selectedEdges()[index()]}
            />
          )}
        </For>

        <Show when={props.activeRect && props.model.state.isDragging}>
          <div class="msr-drag-rect" style={{
            left: `${props.activeRect!.left}px`, top: `${props.activeRect!.top}px`,
            width: `${props.activeRect!.width}px`, height: `${props.activeRect!.height}px`,
            "background-color": fill(), "border-color": outline(),
          }} />
          <div class="msr-measure-tag" style={{
            left: `${props.activeRect!.left + props.activeRect!.width / 2}px`,
            top: `${props.activeRect!.top + props.activeRect!.height + 3}px`,
          }}>{formatValue(props.activeRect!.width)} × {formatValue(props.activeRect!.height)}</div>
        </Show>
      </Show>

      <For each={props.model.state.heldDistances}>
        {(distance) => <DistanceOverlayItem distance={distance} onRemove={props.model.removeHeldDistance} />}
      </For>
      <Show when={selectionVisible() && props.model.state.altPressed && props.optionPairOverlay}>
        <DistanceOverlayItem distance={props.optionPairOverlay!} />
      </Show>
      <Show when={guidesMode() && props.model.state.altPressed && props.guideDistanceOverlay}>
        <DistanceOverlayItem distance={props.guideDistanceOverlay!} />
      </Show>

      <Show when={selectionVisible() && props.model.state.altPressed && props.optionContainerLines}>
        {(lines) => (
          <>
            <For each={[lines().top, lines().bottom]}>
              {(line) => <Show when={line.value > 0}>
                <span class="msr-option-line msr-option-line--v" style={{ left: `${line.x}px`, top: `${Math.min(line.y1, line.y2)}px`, height: `${Math.abs(line.y2 - line.y1)}px` }} />
                <span class="msr-option-tag" style={{ left: `${line.x + 3}px`, top: `${(line.y1 + line.y2) / 2}px` }}>{formatValue(line.value)}</span>
              </Show>}
            </For>
            <For each={[lines().left, lines().right]}>
              {(line) => <Show when={line.value > 0}>
                <span class="msr-option-line msr-option-line--h" style={{ left: `${Math.min(line.x1, line.x2)}px`, top: `${line.y}px`, width: `${Math.abs(line.x2 - line.x1)}px` }} />
                <span class="msr-option-tag" style={{ left: `${(line.x1 + line.x2) / 2}px`, top: `${line.y + 3}px` }}>{formatValue(line.value)}</span>
              </Show>}
            </For>
          </>
        )}
      </Show>

      <Show when={guidesMode() && props.model.state.guidePreview && !props.model.state.draggingGuideId}>
        <div class="msr-guide-preview" style={props.model.state.guidePreview!.orientation === "vertical"
          ? { left: `${props.model.state.guidePreview!.position}px`, top: "0", height: "100%", "border-left-color": guideColor("preview") }
          : { top: `${props.model.state.guidePreview!.position}px`, left: "0", width: "100%", "border-top-color": guideColor("preview") }} />
      </Show>

      <For each={props.model.state.guides}>
        {(guide) => {
          const selected = () => props.model.state.selectedGuideIds.includes(guide.id);
          const hovered = () => props.hoverGuide?.id === guide.id;
          const color = () => selected() ? guideColor("active") : hovered() ? guideColor("hover") : guideColor("default");
          const width = () => Math.max(props.model.state.settings.guideStyle.width, selected() || hovered() ? 2 : 1);
          return (
            <div
              class="msr-guide-hitbox"
              data-mesurer-guide="true"
              style={guide.orientation === "vertical"
                ? { left: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, top: "0", width: `${GUIDE_HITBOX_SIZE}px`, height: "100%", "pointer-events": props.interactive ? "auto" : "none" }
                : { top: `${guide.position - GUIDE_HITBOX_SIZE / 2}px`, left: "0", height: `${GUIDE_HITBOX_SIZE}px`, width: "100%", "pointer-events": props.interactive ? "auto" : "none" }}
              onPointerDown={(event) => props.onGuidePointerDown(guide, event)}
              onPointerUp={(event) => props.onGuidePointerUp(guide, event)}
              onPointerCancel={(event) => props.onGuidePointerUp(guide, event)}
            >
              <span class="msr-guide-line" style={guideLineStyle(guide, color(), width())} />
            </div>
          );
        }}
      </For>
    </div>
  );
}
