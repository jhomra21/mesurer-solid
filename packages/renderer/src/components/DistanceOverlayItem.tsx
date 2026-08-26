import { For, Show, createMemo, type Accessor, type Setter } from "solid-js";
import type { DistanceOverlay } from "../core/types";
import { DEFAULT_SELECTION_SPACING_STYLE, type SelectionSpacingStyle } from "../core/persistence";
import { formatValue } from "../core/utils";
import { MEASURE_LABEL_OFFSET } from "../core/constants";
import { scheduleSpacingLabelLayout } from "./spacing-label-layout";

export type DistanceOverlayItemProps = {
  distance: DistanceOverlay;
  onRemove?: (id: string) => void;
  showRects?: boolean;
  kind?: "held" | "preview" | "selection-spacing";
  selectionSpacingStyle?: SelectionSpacingStyle;
  spacingInteraction?: SelectionSpacingInteraction;
};

type DistanceLabelProps = {
  axis: "x" | "y" | "d";
  left: number;
  top: number;
  vectorX?: number;
  vectorY?: number;
  distanceId?: string;
  labelKey?: string;
  labelIndex?: number;
  labelCount?: number;
  primary?: boolean;
  interactive?: boolean;
  spacingInteraction?: SelectionSpacingInteraction;
  children: any;
};

export type SelectionSpacingInteraction = {
  expandedKey: Accessor<string | null>;
  setExpandedKey: Setter<string | null>;
  pinnedKey: Accessor<string | null>;
  setPinnedKey: Setter<string | null>;
};

type LabelInteraction = {
  scope: HTMLElement;
  labelKey: string;
  distanceId: string;
  labelCount: number;
};

type PointerWatcher = {
  key: string;
  handler: (event: PointerEvent) => void;
};

const PINNED_GROUP_ATTRIBUTE = "data-mesurer-spacing-label-pinned";
const EXPANDED_GROUP_ATTRIBUTE = "data-mesurer-spacing-label-group";
const BASE_OPACITY_ATTRIBUTE = "data-mesurer-spacing-base-opacity";
const SELECTED_CHROME_SELECTOR = '[data-mesurer-selected-measurement="true"], [data-mesurer-selection-spacing-target="true"]';
const HOVER_TARGET_SELECTOR = '[data-mesurer-distance-hover-target="true"]';
const HOVER_ENVELOPE_PADDING = 8;
const collapseTimers = new WeakMap<HTMLElement, number>();
const pinnedDismissers = new WeakMap<HTMLElement, (event: PointerEvent) => void>();
const hoverWatchers = new WeakMap<HTMLElement, PointerWatcher>();
const hoverSuppressions = new WeakMap<HTMLElement, PointerWatcher>();

const spacingScope = (label: HTMLElement) =>
  label.closest<HTMLElement>('[data-mesurer-distance-kind="selection-spacing"]')?.parentElement ?? null;

const scheduleSpacingLabelLayoutAfterRender = (scope: HTMLElement) => {
  queueMicrotask(() => scheduleSpacingLabelLayout(scope));
};

const scheduleLabelLayoutAfterMount = (label: HTMLElement) => {
  const schedule = () => {
    const scope = spacingScope(label);
    if (scope) scheduleSpacingLabelLayout(scope);
  };
  queueMicrotask(schedule);
  label.ownerDocument.defaultView?.requestAnimationFrame(schedule);
};

const labelInteraction = (label: HTMLElement): LabelInteraction | null => {
  const scope = spacingScope(label);
  const labelKey = label.getAttribute("data-mesurer-distance-label-key");
  const distanceId = label.getAttribute("data-mesurer-distance-id");
  if (!scope || !labelKey || !distanceId) return null;
  return {
    scope,
    labelKey,
    distanceId,
    labelCount: Number(label.getAttribute("data-mesurer-distance-label-count") ?? "1"),
  };
};

const geometryKey = (element: HTMLElement) =>
  `${element.style.left}:${element.style.top}:${element.style.width}:${element.style.height}`;

const selectedChromeGeometry = (element: HTMLElement) => {
  if (element.matches('[data-mesurer-selection-spacing-target="true"]')) return element;
  for (const child of element.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.style.left && child.style.top && child.style.width && child.style.height) return child;
  }
  return null;
};

const setSelectionChromeFocus = (scope: HTMLElement, activeRoot: HTMLElement | null) => {
  const activeGeometry = activeRoot
    ? new Set([...activeRoot.querySelectorAll<HTMLElement>(HOVER_TARGET_SELECTOR)].map(geometryKey))
    : null;

  for (const element of scope.querySelectorAll<HTMLElement>(SELECTED_CHROME_SELECTOR)) {
    if (!activeGeometry) {
      const baseOpacity = element.getAttribute(BASE_OPACITY_ATTRIBUTE);
      if (baseOpacity === null) continue;
      if (baseOpacity) element.style.opacity = baseOpacity;
      else element.style.removeProperty("opacity");
      element.removeAttribute(BASE_OPACITY_ATTRIBUTE);
      continue;
    }

    if (!element.hasAttribute(BASE_OPACITY_ATTRIBUTE)) {
      element.setAttribute(BASE_OPACITY_ATTRIBUTE, element.style.opacity);
    }
    const geometry = selectedChromeGeometry(element);
    element.style.opacity = geometry && activeGeometry.has(geometryKey(geometry)) ? "1" : "0.32";
  }
};

const detachHoverWatcher = (scope: HTMLElement) => {
  const watcher = hoverWatchers.get(scope);
  if (!watcher) return;
  scope.ownerDocument.removeEventListener("pointermove", watcher.handler, true);
  hoverWatchers.delete(scope);
};

const detachHoverSuppression = (scope: HTMLElement) => {
  const watcher = hoverSuppressions.get(scope);
  if (!watcher) return;
  scope.ownerDocument.removeEventListener("pointermove", watcher.handler, true);
  hoverSuppressions.delete(scope);
};

const collapseLabelGroups = (scope: HTMLElement, interaction?: SelectionSpacingInteraction) => {
  if (!scope.hasAttribute(EXPANDED_GROUP_ATTRIBUTE)) {
    interaction?.setExpandedKey(null);
    return;
  }
  scope.removeAttribute(EXPANDED_GROUP_ATTRIBUTE);
  interaction?.setExpandedKey(null);
  scheduleSpacingLabelLayoutAfterRender(scope);
};

const expandLabelGroup = (scope: HTMLElement, key: string, interaction?: SelectionSpacingInteraction) => {
  if (scope.getAttribute(EXPANDED_GROUP_ATTRIBUTE) === key) return;
  scope.setAttribute(EXPANDED_GROUP_ATTRIBUTE, key);
  interaction?.setExpandedKey(key);
  scheduleSpacingLabelLayoutAfterRender(scope);
};

const setSpacingFocus = (scope: HTMLElement, distanceId: string | null) => {
  const roots = scope.querySelectorAll<HTMLElement>('[data-mesurer-distance-kind="selection-spacing"]');
  if (distanceId && !scope.hasAttribute("data-mesurer-spacing-focus")) {
    for (const root of roots) {
      for (const line of root.querySelectorAll<HTMLElement>("[data-mesurer-distance-line], [data-mesurer-distance-connector]")) {
        line.setAttribute("data-mesurer-base-opacity", line.style.opacity || "1");
      }
    }
  }

  if (!distanceId) {
    for (const root of roots) {
      root.removeAttribute("data-mesurer-distance-active");
      for (const line of root.querySelectorAll<HTMLElement>("[data-mesurer-distance-line], [data-mesurer-distance-connector]")) {
        line.style.opacity = line.getAttribute("data-mesurer-base-opacity") ?? "";
        line.removeAttribute("data-mesurer-base-opacity");
      }
    }
    scope.removeAttribute("data-mesurer-spacing-focus");
    setSelectionChromeFocus(scope, null);
    return;
  }

  scope.setAttribute("data-mesurer-spacing-focus", distanceId);
  let activeRoot: HTMLElement | null = null;
  for (const root of roots) {
    const active = root.getAttribute("data-mesurer-distance-id") === distanceId;
    if (active) {
      root.setAttribute("data-mesurer-distance-active", "true");
      activeRoot = root;
    } else {
      root.removeAttribute("data-mesurer-distance-active");
    }
    for (const line of root.querySelectorAll<HTMLElement>("[data-mesurer-distance-line], [data-mesurer-distance-connector]")) {
      line.style.opacity = active ? "1" : "0.16";
    }
  }
  setSelectionChromeFocus(scope, activeRoot);
};

const clearCollapseTimer = (scope: HTMLElement) => {
  const timer = collapseTimers.get(scope);
  if (timer === undefined) return;
  scope.ownerDocument.defaultView?.clearTimeout(timer);
  collapseTimers.delete(scope);
};

const detachPinnedDismiss = (scope: HTMLElement) => {
  const dismiss = pinnedDismissers.get(scope);
  if (!dismiss) return;
  scope.ownerDocument.removeEventListener("pointerdown", dismiss, true);
  pinnedDismissers.delete(scope);
};

const clearPinnedGroup = (scope: HTMLElement, interaction?: SelectionSpacingInteraction) => {
  clearCollapseTimer(scope);
  detachHoverWatcher(scope);
  detachPinnedDismiss(scope);
  scope.removeAttribute(PINNED_GROUP_ATTRIBUTE);
  interaction?.setPinnedKey(null);
  collapseLabelGroups(scope, interaction);
  setSpacingFocus(scope, null);
};

const attachPinnedDismiss = (scope: HTMLElement, interaction?: SelectionSpacingInteraction) => {
  if (pinnedDismissers.has(scope)) return;
  const dismiss = (event: PointerEvent) => {
    const target = event.target;
    const label = target instanceof Element
      ? target.closest<HTMLElement>("[data-mesurer-distance-label-key]")
      : null;
    if (label && spacingScope(label) === scope) return;
    clearPinnedGroup(scope, interaction);
  };
  pinnedDismissers.set(scope, dismiss);
  scope.ownerDocument.addEventListener("pointerdown", dismiss, true);
};

const scheduleCollapse = (scope: HTMLElement, interaction?: SelectionSpacingInteraction) => {
  if (scope.hasAttribute(PINNED_GROUP_ATTRIBUTE) || collapseTimers.has(scope)) return;
  const ownerWindow = scope.ownerDocument.defaultView;
  if (!ownerWindow) return;
  collapseTimers.set(scope, ownerWindow.setTimeout(() => {
    collapseTimers.delete(scope);
    if (scope.hasAttribute(PINNED_GROUP_ATTRIBUTE)) return;
    detachHoverWatcher(scope);
    collapseLabelGroups(scope, interaction);
    setSpacingFocus(scope, null);
  }, 250));
};

const pointerInsideVisibleGroup = (
  scope: HTMLElement,
  key: string,
  x: number,
  y: number,
  padding = HOVER_ENVELOPE_PADDING,
) => {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const label of scope.querySelectorAll<HTMLElement>('[data-mesurer-distance-label-key][data-mesurer-distance-label="true"]')) {
    if (label.getAttribute("data-mesurer-distance-label-key") !== key) continue;
    const rect = label.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
    found = true;
  }

  return found
    && x >= left - padding
    && x <= right + padding
    && y >= top - padding
    && y <= bottom + padding;
};

const watchHoverGroup = (scope: HTMLElement, key: string, interaction?: SelectionSpacingInteraction) => {
  if (scope.hasAttribute(PINNED_GROUP_ATTRIBUTE)) {
    detachHoverWatcher(scope);
    return;
  }
  const existing = hoverWatchers.get(scope);
  if (existing?.key === key) return;
  detachHoverWatcher(scope);

  const handler = (event: PointerEvent) => {
    if (!scope.isConnected || scope.hasAttribute(PINNED_GROUP_ATTRIBUTE)) {
      detachHoverWatcher(scope);
      return;
    }
    if (pointerInsideVisibleGroup(scope, key, event.clientX, event.clientY)) {
      clearCollapseTimer(scope);
      return;
    }
    scheduleCollapse(scope, interaction);
  };

  hoverWatchers.set(scope, { key, handler });
  scope.ownerDocument.addEventListener("pointermove", handler, true);
};

const suppressHoverUntilExit = (scope: HTMLElement, key: string) => {
  detachHoverSuppression(scope);
  const handler = (event: PointerEvent) => {
    if (!scope.isConnected || !pointerInsideVisibleGroup(scope, key, event.clientX, event.clientY, 2)) {
      detachHoverSuppression(scope);
    }
  };
  hoverSuppressions.set(scope, { key, handler });
  scope.ownerDocument.addEventListener("pointermove", handler, true);
};

const hoverSuppressed = (scope: HTMLElement, key: string) => hoverSuppressions.get(scope)?.key === key;

const Tag = (props: DistanceLabelProps) => {
  const primary = createMemo(() => props.primary !== false);
  const interactive = createMemo(() => Boolean(props.interactive && props.labelKey && props.distanceId));
  const expanded = createMemo(() => Boolean(
    props.spacingInteraction
      && props.labelKey
      && props.labelCount
      && props.labelCount > 1
      && props.spacingInteraction.expandedKey() === props.labelKey,
  ));
  const visible = createMemo(() => primary() || expanded());

  const handleEnter = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
    const interaction = labelInteraction(event.currentTarget);
    if (!interaction) return;
    clearCollapseTimer(interaction.scope);
    const pinnedKey = props.spacingInteraction?.pinnedKey() ?? interaction.scope.getAttribute(PINNED_GROUP_ATTRIBUTE);
    const primaryLabel = event.currentTarget.getAttribute("data-mesurer-distance-label-state") === "primary";
    if (!pinnedKey && primaryLabel && interaction.labelCount > 1 && !hoverSuppressed(interaction.scope, interaction.labelKey)) {
      expandLabelGroup(interaction.scope, interaction.labelKey, props.spacingInteraction);
      watchHoverGroup(interaction.scope, interaction.labelKey, props.spacingInteraction);
    } else if (!pinnedKey && interaction.scope.getAttribute(EXPANDED_GROUP_ATTRIBUTE) === interaction.labelKey) {
      watchHoverGroup(interaction.scope, interaction.labelKey, props.spacingInteraction);
    }
    setSpacingFocus(interaction.scope, interaction.distanceId);
  };

  const handleLeave = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
    const interaction = labelInteraction(event.currentTarget);
    if (!interaction || interaction.scope.hasAttribute(PINNED_GROUP_ATTRIBUTE)) return;
    const next = event.relatedTarget;
    const nextLabel = next instanceof Element
      ? next.closest<HTMLElement>("[data-mesurer-distance-label-key]")
      : null;
    const nextInteraction = nextLabel ? labelInteraction(nextLabel) : null;
    if (nextInteraction?.scope === interaction.scope && nextInteraction.labelKey === interaction.labelKey) {
      clearCollapseTimer(interaction.scope);
      return;
    }
    scheduleCollapse(interaction.scope, props.spacingInteraction);
  };

  const handlePointer = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (labelInteraction(event.currentTarget)) event.stopPropagation();
  };

  const handleMouseDown = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
    const interaction = labelInteraction(event.currentTarget);
    if (!interaction) return;
    event.stopPropagation();
    if (interaction.labelCount <= 1) return;
    clearCollapseTimer(interaction.scope);
    const pinnedKey = props.spacingInteraction?.pinnedKey() ?? interaction.scope.getAttribute(PINNED_GROUP_ATTRIBUTE);
    const primaryLabel = event.currentTarget.getAttribute("data-mesurer-distance-label-state") === "primary";
    if (pinnedKey === interaction.labelKey && primaryLabel) {
      clearPinnedGroup(interaction.scope, props.spacingInteraction);
      suppressHoverUntilExit(interaction.scope, interaction.labelKey);
      return;
    }
    detachHoverWatcher(interaction.scope);
    detachHoverSuppression(interaction.scope);
    interaction.scope.setAttribute(PINNED_GROUP_ATTRIBUTE, interaction.labelKey);
    props.spacingInteraction?.setPinnedKey(interaction.labelKey);
    expandLabelGroup(interaction.scope, interaction.labelKey, props.spacingInteraction);
    attachPinnedDismiss(interaction.scope, props.spacingInteraction);
    setSpacingFocus(interaction.scope, interaction.distanceId);
  };

  const handleClick = (event: MouseEvent & { currentTarget: HTMLDivElement }) => {
    if (labelInteraction(event.currentTarget)) event.stopPropagation();
  };

  return (
    <div
      ref={(element) => {
        scheduleLabelLayoutAfterMount(element);
      }}
      data-mesurer-distance-label={visible() ? "true" : "hidden"}
      data-mesurer-distance-label-state={primary() ? "primary" : "duplicate"}
      data-mesurer-distance-label-key={props.labelKey}
      data-mesurer-distance-label-index={props.labelIndex ?? 0}
      data-mesurer-distance-label-count={props.labelCount ?? 1}
      data-mesurer-distance-label-axis={props.axis}
      data-mesurer-distance-label-vector-x={props.vectorX}
      data-mesurer-distance-label-vector-y={props.vectorY}
      data-mesurer-distance-id={props.distanceId}
      class={`msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:bg-ink-900/90 ${props.axis === "x" ? "msr:-translate-x-1/2" : props.axis === "y" ? "msr:-translate-y-1/2" : "msr:-translate-x-1/2 msr:-translate-y-1/2"}`}
      style={{
        left: `${props.left}px`,
        top: `${props.top}px`,
        opacity: visible() ? 1 : 0,
        "pointer-events": interactive() && visible() ? "auto" : "none",
        "margin-left": `calc(var(--mesurer-spacing-label-collision-x, 0px) + ${expanded() && props.axis === "y" ? (props.labelIndex ?? 0) * 22 : 0}px)`,
        "margin-top": `calc(var(--mesurer-spacing-label-collision-y, 0px) + ${expanded() && props.axis === "x" ? (props.labelIndex ?? 0) * 16 : 0}px)`,
        "z-index": expanded() ? String(10 + (props.labelIndex ?? 0)) : undefined,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseDown={handleMouseDown}
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerUp={handlePointer}
      onClick={handleClick}
    >
      {props.children}
    </div>
  );
};

const selectionLineStyle = (
  style: SelectionSpacingStyle,
  axis: "horizontal" | "vertical",
  pattern = style.pattern,
) => {
  const period = style.dashLength + style.gap;
  const direction = axis === "horizontal" ? "to right" : "to bottom";
  const dotRadius = Math.max(0.5, style.width / 2);
  const backgroundImage = pattern === "solid"
    ? undefined
    : pattern === "dotted"
      ? `radial-gradient(circle, ${style.color} 0 ${dotRadius}px, transparent ${dotRadius + 0.5}px)`
      : `repeating-linear-gradient(${direction}, ${style.color} 0 ${style.dashLength}px, transparent ${style.dashLength}px ${period}px)`;
  const backgroundSize = pattern === "dotted"
    ? axis === "horizontal" ? `${period}px ${style.width}px` : `${style.width}px ${period}px`
    : undefined;
  return {
    "background-color": pattern === "solid" ? style.color : "transparent",
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
  const diagonalLineVisible = (x1: number, y1: number, x2: number, y2: number) => {
    const viewport = ownerWindow();
    if (!viewport) return true;
    return Math.max(x1, x2) > 0
      && Math.min(x1, x2) < viewport.innerWidth
      && Math.max(y1, y2) > 0
      && Math.min(y1, y2) < viewport.innerHeight;
  };

  return (
    <div
      data-mesurer-distance="true"
      data-mesurer-distance-kind={props.kind}
      data-mesurer-distance-id={props.distance.id}
      class={props.onRemove ? "msr:pointer-events-auto" : "msr:pointer-events-none"}
      onClick={props.onRemove ? (event) => { event.stopPropagation(); props.onRemove?.(props.distance.id); } : undefined}
    >
      <Show when={props.showRects !== false}>
        <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectA.left}px`, top: `${props.distance.rectA.top}px`, width: `${props.distance.rectA.width}px`, height: `${props.distance.rectA.height}px` }} />
        <div class="msr:absolute msr:rounded msr:border msr:border-[#2563eb]/70" style={{ left: `${props.distance.rectB.left}px`, top: `${props.distance.rectB.top}px`, width: `${props.distance.rectB.width}px`, height: `${props.distance.rectB.height}px` }} />
      </Show>
      <Show when={selectionSpacing()}>
        <div
          data-mesurer-distance-hover-target="true"
          class="msr:pointer-events-none msr:absolute"
          style={{ left: `${props.distance.rectA.left}px`, top: `${props.distance.rectA.top}px`, width: `${props.distance.rectA.width}px`, height: `${props.distance.rectA.height}px`, opacity: 0 }}
        />
        <div
          data-mesurer-distance-hover-target="true"
          class="msr:pointer-events-none msr:absolute"
          style={{ left: `${props.distance.rectB.left}px`, top: `${props.distance.rectB.top}px`, width: `${props.distance.rectB.width}px`, height: `${props.distance.rectB.height}px`, opacity: 0 }}
        />
      </Show>
      <Show when={props.distance.showConnectors !== false}>
        <For each={props.distance.connectors}>{(connector) => Math.abs(connector.x1 - connector.x2) < 1
          ? <div data-mesurer-distance-connector="true" class="msr:absolute msr:border-l msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${connector.x1}px`, top: `${Math.min(connector.y1, connector.y2)}px`, height: `${Math.abs(connector.y2 - connector.y1)}px` }} />
          : <div data-mesurer-distance-connector="true" class="msr:absolute msr:border-t msr:border-dashed msr:border-[#2563eb]/70" style={{ left: `${Math.min(connector.x1, connector.x2)}px`, top: `${connector.y1}px`, width: `${Math.abs(connector.x2 - connector.x1)}px` }} />}
        </For>
      </Show>
      <Show when={!selectionSpacing() || !props.distance.edgeDistances?.length}>
        <Show when={props.distance.horizontal}>{(line) => <Show when={line().value > 0 && line().showLine !== false}><>
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
            <Tag
              axis="x"
              left={labelLeft(visibleLabelMidpoint(line().x1, line().x2, ownerWindow()?.innerWidth))}
              top={labelTop(line().y + MEASURE_LABEL_OFFSET)}
              distanceId={selectionSpacing() ? props.distance.id : undefined}
              labelKey={line().labelKey}
              labelIndex={line().labelIndex}
              labelCount={line().labelCount}
              primary={line().showLabel !== false}
              interactive={selectionSpacing()}
              spacingInteraction={selectionSpacing() ? props.spacingInteraction : undefined}
            >{formatValue(line().value)}</Tag>
          </Show>
        </></Show>}</Show>
        <Show when={props.distance.vertical}>{(line) => <Show when={line().value > 0 && line().showLine !== false}><>
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
            <Tag
              axis="y"
              left={labelLeft(line().x + MEASURE_LABEL_OFFSET)}
              top={labelTop(visibleLabelMidpoint(line().y1, line().y2, ownerWindow()?.innerHeight))}
              distanceId={selectionSpacing() ? props.distance.id : undefined}
              labelKey={line().labelKey}
              labelIndex={line().labelIndex}
              labelCount={line().labelCount}
              primary={line().showLabel !== false}
              interactive={selectionSpacing()}
              spacingInteraction={selectionSpacing() ? props.spacingInteraction : undefined}
            >{formatValue(line().value)}</Tag>
          </Show>
        </></Show>}</Show>
      </Show>
      <Show when={selectionSpacing() && spacingStyle().diagonals && props.distance.diagonal}>{(line) => {
        const length = () => Math.hypot(line().x2 - line().x1, line().y2 - line().y1);
        const vectorX = () => length() > 0 ? (line().x2 - line().x1) / length() : 1;
        const vectorY = () => length() > 0 ? (line().y2 - line().y1) / length() : 0;
        const angle = () => Math.atan2(line().y2 - line().y1, line().x2 - line().x1);
        const midpointX = () => (line().x1 + line().x2) / 2;
        const midpointY = () => (line().y1 + line().y2) / 2;
        return <Show when={line().value > 0 && line().showLine !== false && diagonalLineVisible(line().x1, line().y1, line().x2, line().y2)}><>
          <div
            data-mesurer-distance-line="diagonal"
            data-mesurer-line-pattern="dotted"
            data-mesurer-line-width={String(spacingStyle().width)}
            data-mesurer-line-color={spacingStyle().color}
            class="msr:absolute"
            style={{
              left: `${line().x1}px`,
              top: `${line().y1 - spacingStyle().width / 2}px`,
              width: `${length()}px`,
              height: `${spacingStyle().width}px`,
              transform: `rotate(${angle()}rad)`,
              "transform-origin": "0 50%",
              ...selectionLineStyle(spacingStyle(), "horizontal", "dotted"),
            }}
          />
          <Tag
            axis="d"
            vectorX={vectorX()}
            vectorY={vectorY()}
            left={labelLeft(midpointX() - vectorY() * MEASURE_LABEL_OFFSET)}
            top={labelTop(midpointY() + vectorX() * MEASURE_LABEL_OFFSET)}
            distanceId={props.distance.id}
            labelKey={line().labelKey}
            labelIndex={line().labelIndex}
            labelCount={line().labelCount}
            primary={line().showLabel !== false}
            interactive
            spacingInteraction={props.spacingInteraction}
          >{formatValue(line().value)}</Tag>
        </></Show>;
      }}</Show>
      <Show when={selectionSpacing() && props.distance.edgeDistances?.length}>
        <For each={props.distance.edgeDistances}>{(edge) => edge.axis === "x"
          ? <Show when={edge.value > 0 && edge.showLine !== false}><>
            <div data-mesurer-distance-line={`horizontal-${edge.side}`} data-mesurer-line-pattern={spacingStyle().pattern} data-mesurer-line-width={String(spacingStyle().width)} data-mesurer-line-color={spacingStyle().color} class="msr:absolute" style={{ left: `${Math.min(edge.x1, edge.x2)}px`, width: `${Math.abs(edge.x2 - edge.x1)}px`, top: `${edge.y - spacingStyle().width / 2}px`, height: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "horizontal") }} />
            <Show when={horizontalLineVisible(edge.x1, edge.x2, edge.y, spacingStyle().width)}>
              <Tag
                axis="x"
                left={labelLeft(visibleLabelMidpoint(edge.x1, edge.x2, ownerWindow()?.innerWidth))}
                top={labelTop(edge.y + MEASURE_LABEL_OFFSET)}
                distanceId={props.distance.id}
                labelKey={edge.labelKey}
                labelIndex={edge.labelIndex}
                labelCount={edge.labelCount}
                primary={edge.showLabel !== false}
                interactive
                spacingInteraction={props.spacingInteraction}
              >{formatValue(edge.value)}</Tag>
            </Show>
          </></Show>
          : <Show when={edge.value > 0 && edge.showLine !== false}><>
            <div data-mesurer-distance-line={`vertical-${edge.side}`} data-mesurer-line-pattern={spacingStyle().pattern} data-mesurer-line-width={String(spacingStyle().width)} data-mesurer-line-color={spacingStyle().color} class="msr:absolute" style={{ top: `${Math.min(edge.y1, edge.y2)}px`, height: `${Math.abs(edge.y2 - edge.y1)}px`, left: `${edge.x - spacingStyle().width / 2}px`, width: `${spacingStyle().width}px`, ...selectionLineStyle(spacingStyle(), "vertical") }} />
            <Show when={verticalLineVisible(edge.x, edge.y1, edge.y2, spacingStyle().width)}>
              <Tag
                axis="y"
                left={labelLeft(edge.x + MEASURE_LABEL_OFFSET)}
                top={labelTop(visibleLabelMidpoint(edge.y1, edge.y2, ownerWindow()?.innerHeight))}
                distanceId={props.distance.id}
                labelKey={edge.labelKey}
                labelIndex={edge.labelIndex}
                labelCount={edge.labelCount}
                primary={edge.showLabel !== false}
                interactive
                spacingInteraction={props.spacingInteraction}
              >{formatValue(edge.value)}</Tag>
            </Show>
          </></Show>}
        </For>
      </Show>
    </div>
  );
}
