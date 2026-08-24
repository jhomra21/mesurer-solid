import { For, Show } from "solid-js";
import type { DistanceOverlay } from "../core/types";
import { DEFAULT_SELECTION_SPACING_STYLE, type SelectionSpacingStyle } from "../core/persistence";
import { formatValue } from "../core/utils";
import { MEASURE_LABEL_OFFSET } from "../core/constants";

export type DistanceOverlayItemProps = {
  distance: DistanceOverlay;
  onRemove?: (id: string) => void;
  showRects?: boolean;
  kind?: "held" | "preview" | "selection-spacing";
  selectionSpacingStyle?: SelectionSpacingStyle;
};

const Tag = (props: { axis: "x" | "y"; left: number; top: number; children: any }) => (
  <div data-mesurer-distance-label="true" class={`msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:bg-ink-900/90 ${props.axis === "x" ? "msr:-translate-x-1/2" : "msr:-translate-y-1/2"}`} style={{ left: `${props.left}px`, top: `${props.top}px` }}>{props.children}</div>
);

const selectionLineStyle = (style: SelectionSpacingStyle, axis: "horizontal" | "vertical") => {
  const period = style.dashLength + style.gap;
  const direction = axis === "horizontal" ? "to right" : "to bottom";
  const dotRadius = Math.max(0.5, style.width / 2);
  const backgroundImage = style.pattern === "solid"
    ? undefined
    : style.pattern === "dotted"
      ? `radial-gradient(circle, ${style.color} 0 ${dotRadius}px, transparent ${dotRadius + 0.5}px)`
      : `repeating-linear-gradient(${direction}, ${style.color} 0 ${style.dashLength}px, transparent ${style.dashLength}px ${period}px)`;
  const backgroundSize = style.pattern === "dotted"
    ? axis === "horizontal" ? `${period}px ${style.width}px` : `${style.width}px ${period}px`
    : undefined;
  return {
    "background-color": style.pattern === "solid" ? style.color : "transparent",
    "background-image": backgroundImage,
    "background-size": backgroundSize,
    opacity: style.opacity,
  };
};

const clampToViewport = (value: number, limit: number) => Math.max(0, Math.min(limit, value));

const visibleSegmentMidpoint = (start: number, end: number, limit: number) => {
  const segmentStart = Math.min(start, end);
  const segmentEnd = Math.max(start, end);
  const inset = Math.min(20, Math.max(0, limit / 2));
  if (segmentEnd < 0) return inset;
  if (segmentStart > limit) return limit - inset;
  const visibleStart = clampToViewport(segmentStart, limit);
  const visibleEnd = clampToViewport(segmentEnd, limit);
  return (visibleStart + visibleEnd) / 2;
};

const visibleLabelMidpoint = (start: number, end: number, limit?: number) =>
  limit && limit > 0 ? visibleSegmentMidpoint(start, end, limit) : (start + end) / 2;

const positionDistanceLabelAnchor = (value: number, limit: number) => {
  const inset = Math.min(20, Math.max(0, limit / 2));
  if (value < 0) return inset;
  if (value > limit) return limit - inset;
  return Math.max(inset, Math.min(limit - inset, value));
};

const coordinateIntersectsViewport = (value: number, limit: number, width: number) =>
  value + width / 2 > 0 && value - width / 2 < limit;

const segmentIntersectsViewport = (start: number, end: number, limit: number) =>
  Math.max(start, end) > 0 && Math.min(start, end) < limit;

export function DistanceOverlayItem(props: DistanceOverlayItemProps) {
  const selectionSpacing = () => props.kind === "selection-spacing";
  const spacingStyle = () => props.selectionSpacingStyle ?? DEFAULT_SELECTION_SPACING_STYLE;
  const ownerWindow = () => props.distance.elementRefA?.ownerDocument.defaultView
    ?? props.distance.elementRefB?.ownerDocument.defaultView
    ?? globalThis.window;
  const labelLeft = (value: number) => {
    const width = ownerWindow()?.innerWidth;
    return width && width > 0 ? positionDistanceLabelAnchor(value, width) : value;
  };
  const labelTop = (value: number) => {
    const height = ownerWindow()?.innerHeight;
    return height && height > 0 ? positionDistanceLabelAnchor(value, height) : value;
  };
  const horizontalLineVisible = (x1: number, x2: number, y: number, width: number) => {
    const viewport = ownerWindow();
    if (!viewport) return true;
    return segmentIntersectsViewport(x1, x2, viewport.innerWidth)
      && coordinateIntersectsViewport(y, viewport.innerHeight, width);
  };
  const verticalLineVisible = (x: number, y1: number, y2: number, width: number) => {
    const viewport = ownerWindow();
    if (!viewport) return true;
    return coordinateIntersectsViewport(x, viewport.innerWidth, width)
      && segmentIntersectsViewport(y1, y2, viewport.innerHeight);
  };
  return (
    <div
      data-mesurer-distance="true"
      data-mesurer-distance-kind={props.kind}
      class={props.onRemove ? "msr:pointer-events-auto" : "msr:pointer-events-none"}
      onClick={props.onRemove ? (event) => { event.stopPropagation(); props.onRemove?.(props.distance.id); } : undefined}
    >
      <Show when={props.showRects !== false}>
        <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectA.left}px`, top: `${props.distance.rectA.top}px`, width: `${props.distance.rectA.width}px`, height: `${props.distance.rectA.height}px` }} />
        <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectB.left}px`, top: `${props.distance.rectB.top}px`, width: `${props.distance.rectB.width}px`, height: `${props.distance.rectB.height}px` }} />
      </Show>
      <For each={props.distance.connectors}>{(connector) => Math.abs(connector.x1 - connector.x2) < 1
        ? <div class="msr:absolute msr:border-l msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${connector.x1}px`, top: `${Math.min(connector.y1, connector.y2)}px`, height: `${Math.abs(connector.y2 - connector.y1)}px` }} />
        : <div class="msr:absolute msr:border-t msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${Math.min(connector.x1, connector.x2)}px`, top: `${connector.y1}px`, width: `${Math.abs(connector.x2 - connector.x1)}px` }} />}
      </For>
      <Show when={!selectionSpacing() || !props.distance.edgeDistances?.length}>
      <Show when={props.distance.horizontal}>{(line) => <Show when={line().value > 0}><>
        <div
          data-mesurer-distance-line="horizontal"
          data-mesurer-line-pattern={selectionSpacing() ? spacingStyle().pattern : undefined}
          data-mesurer-line-width={selectionSpacing() ? String(spacingStyle().width) : undefined}
          data-mesurer-line-color={selectionSpacing() ? spacingStyle().color : undefined}
          class={selectionSpacing() ? "msr:absolute" : "msr:absolute msr:h-px msr:bg-[#2563eb]"}
          style={selectionSpacing()
            ? { left: `${Math.min(line().x1, line().x2)}px`, width: `${Math.abs(line().x2 - line().x1)}px`, top: `${line().y - spacingStyle().width / 2}px`, height: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "horizontal") }
            : { left: `${Math.min(line().x1, line().x2)}px`, width: `${Math.abs(line().x2 - line().x1)}px`, top: `${line().y}px` }}
        />
        <Show when={horizontalLineVisible(line().x1, line().x2, line().y, selectionSpacing() ? spacingStyle().width : 1)}>
          <Tag axis="x" left={labelLeft(visibleLabelMidpoint(line().x1, line().x2, ownerWindow()?.innerWidth))} top={labelTop(line().y + MEASURE_LABEL_OFFSET)}>{formatValue(line().value)}</Tag>
        </Show>
      </></Show>}</Show>
      <Show when={props.distance.vertical}>{(line) => <Show when={line().value > 0}><>
        <div
          data-mesurer-distance-line="vertical"
          data-mesurer-line-pattern={selectionSpacing() ? spacingStyle().pattern : undefined}
          data-mesurer-line-width={selectionSpacing() ? String(spacingStyle().width) : undefined}
          data-mesurer-line-color={selectionSpacing() ? spacingStyle().color : undefined}
          class={selectionSpacing() ? "msr:absolute" : "msr:absolute msr:w-px msr:bg-[#2563eb]"}
          style={selectionSpacing()
            ? { top: `${Math.min(line().y1, line().y2)}px`, height: `${Math.abs(line().y2 - line().y1)}px`, left: `${line().x - spacingStyle().width / 2}px`, width: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "vertical") }
            : { top: `${Math.min(line().y1, line().y2)}px`, height: `${Math.abs(line().y2 - line().y1)}px`, left: `${line().x}px` }}
        />
        <Show when={verticalLineVisible(line().x, line().y1, line().y2, selectionSpacing() ? spacingStyle().width : 1)}>
          <Tag axis="y" left={labelLeft(line().x + MEASURE_LABEL_OFFSET)} top={labelTop(visibleLabelMidpoint(line().y1, line().y2, ownerWindow()?.innerHeight))}>{formatValue(line().value)}</Tag>
        </Show>
      </></Show>}</Show>
      </Show>
      <Show when={selectionSpacing() && props.distance.edgeDistances?.length}>
        <For each={props.distance.edgeDistances}>{(edge) => edge.axis === "x"
          ? <Show when={edge.value > 0}><>
            <div data-mesurer-distance-line={`horizontal-${edge.side}`} data-mesurer-line-pattern={spacingStyle().pattern} data-mesurer-line-width={String(spacingStyle().width)} data-mesurer-line-color={spacingStyle().color} class="msr:absolute" style={{ left: `${Math.min(edge.x1, edge.x2)}px`, width: `${Math.abs(edge.x2 - edge.x1)}px`, top: `${edge.y - spacingStyle().width / 2}px`, height: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "horizontal") }} />
            <Show when={horizontalLineVisible(edge.x1, edge.x2, edge.y, spacingStyle().width)}>
              <Tag axis="x" left={labelLeft(visibleLabelMidpoint(edge.x1, edge.x2, ownerWindow()?.innerWidth))} top={labelTop(edge.y + MEASURE_LABEL_OFFSET)}>{formatValue(edge.value)}</Tag>
            </Show>
          </></Show>
          : <Show when={edge.value > 0}><>
            <div data-mesurer-distance-line={`vertical-${edge.side}`} data-mesurer-line-pattern={spacingStyle().pattern} data-mesurer-line-width={String(spacingStyle().width)} data-mesurer-line-color={spacingStyle().color} class="msr:absolute" style={{ top: `${Math.min(edge.y1, edge.y2)}px`, height: `${Math.abs(edge.y2 - edge.y1)}px`, left: `${edge.x - spacingStyle().width / 2}px`, width: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "vertical") }} />
            <Show when={verticalLineVisible(edge.x, edge.y1, edge.y2, spacingStyle().width)}>
              <Tag axis="y" left={labelLeft(edge.x + MEASURE_LABEL_OFFSET)} top={labelTop(visibleLabelMidpoint(edge.y1, edge.y2, ownerWindow()?.innerHeight))}>{formatValue(edge.value)}</Tag>
            </Show>
          </></Show>}
        </For>
      </Show>
    </div>
  );
}
