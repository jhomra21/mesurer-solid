import {
  defineMesurerPlugin,
  type MesurerElementFingerprint,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  getRectFromDom,
  isElementFingerprintCompatible,
  isElementFingerprintRebindable,
  isElementWithinDomTarget,
} from "@jhomra21/mesurer-solid-dom";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { GUIDE_SNAP_DISTANCE } from "../core/constants";

export const MESURER_ARRANGE_PLUGIN_ID = "mesurer.arrange";
export const MESURER_ARRANGE_SERVICE_ID = "arrange";
export const MESURER_ARRANGE_STATE_ID = "mesurer.arrange.intents";
export const MESURER_ARRANGE_ACTIVE_STATE_ID = "mesurer.arrange.active";
export const MESURER_ARRANGE_SETTINGS_STATE_ID = "mesurer.arrange.settings";

const RUNTIME_SERVICE_ID = "runtime:solid";
const BUILTIN_SELECT_COMMAND = "builtin.select";
const TOGGLE_COMMAND = "arrange.toggle";
const COMMIT_COMMAND = "arrange.commit";
const CLEAR_COMMAND = "arrange.clear";
const SELECTION_AVAILABLE_STATE_ID = "mesurer.arrange.selection-available";
const MAX_INTENTS = 100;
const DEFAULT_REVIEW_TOLERANCE = 1;
const CAPTURE_PADDING = 24;
const SNAP_RELEVANCE_DISTANCE = 160;
const MAX_SNAP_ELEMENTS = 500;
const SNAP_LINE_COLOR = "#ef4444";

export type ArrangeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ArrangeOffset = {
  x: number;
  y: number;
};

export type ArrangeTarget = {
  id: string;
  selector: string;
  fingerprint: MesurerElementFingerprint;
  before: ArrangeRect;
  desired: ArrangeRect;
  beforeOffset: ArrangeOffset;
  desiredOffset: ArrangeOffset;
};

export type ArrangeIntent = {
  id: string;
  createdAt: number;
  pageUrl: string;
  targets: ArrangeTarget[];
};

export type ArrangePresentation = "before" | "desired" | "live";

export type ArrangeReviewTarget = {
  targetId: string;
  selector: string;
  desired: ArrangeRect;
  current: ArrangeRect | null;
  delta: ArrangeRect | null;
  matched: boolean;
};

export type ArrangeReview = {
  schema: "mesurer.arrange-review/v1";
  arrangeId: string;
  targetStatus: "connected" | "partial" | "stale";
  tolerance: number;
  matched: boolean;
  targets: ArrangeReviewTarget[];
};

export type ArrangeCapturePlan = {
  schema: "mesurer.arrange-capture/v1";
  arrangeId: string;
  state: ArrangePresentation;
  chrome: "hide";
  captures: Array<
    | { id: "viewport"; kind: "viewport" }
    | { id: "focus"; kind: "clip"; rect: ArrangeRect }
  >;
};

export type MesurerArrangeSettings = {
  snapping: boolean;
  elementEdges: boolean;
  elementCenters: boolean;
  guides: boolean;
  preferXrayEdges: boolean;
  snapLines: boolean;
};

export type MesurerArrangeService = {
  active(): boolean;
  intents(): ArrangeIntent[];
  intent(id: string): ArrangeIntent | null;
  show(id: string, state: ArrangePresentation): void;
  showCurrent(): void;
  capturePlan(id: string, state: ArrangePresentation): ArrangeCapturePlan;
  review(id: string, tolerance?: number): ArrangeReview;
  clear(): Promise<void>;
};

type ArrangeTargetValue = {
  [key: string]: PluginValue;
  id: string;
  selector: string;
  fingerprintTag: string;
  fingerprintId: string | null;
  fingerprintTestId: string | null;
  fingerprintRole: string | null;
  fingerprintAriaLabel: string | null;
  fingerprintClasses: string[];
  fingerprintText: string | null;
  beforeLeft: number;
  beforeTop: number;
  beforeWidth: number;
  beforeHeight: number;
  desiredLeft: number;
  desiredTop: number;
  desiredWidth: number;
  desiredHeight: number;
  beforeOffsetX: number;
  beforeOffsetY: number;
  desiredOffsetX: number;
  desiredOffsetY: number;
};

type ArrangeIntentValue = {
  [key: string]: PluginValue;
  id: string;
  createdAt: number;
  pageUrl: string;
  targets: ArrangeTargetValue[];
};

type ArrangeStateValue = {
  [key: string]: PluginValue;
  intents: ArrangeIntentValue[];
};

type ArrangeSettingsValue = {
  [key: string]: PluginValue;
  snapping: boolean;
  elementEdges: boolean;
  elementCenters: boolean;
  guides: boolean;
  preferXrayEdges: boolean;
  snapLines: boolean;
};

type InlineTransform = {
  value: string;
  priority: string;
};

type InlineVisibility = {
  value: string;
  priority: string;
};

type AppliedPreview = {
  element: HTMLElement;
  transform: InlineTransform;
};

type DragTarget = {
  element: HTMLElement;
  target: ArrangeTargetValue;
};

type SnapCandidate = {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
  source: "element" | "guide";
  kind: "edge" | "center" | "guide";
};

type AxisSnap = SnapCandidate & {
  delta: number;
};

type DragState = {
  pointerId: number;
  originX: number;
  originY: number;
  targets: DragTarget[];
  groupBefore: ArrangeRect;
  snapCandidates: SnapCandidate[];
  dx: number;
  dy: number;
};

type PresentationState = {
  intentId: string | null;
  state: ArrangePresentation;
};

const moveIcon = {
  viewBox: "0 0 24 24",
  paths: [
    "M12 2.75 8.75 6h2.5v5.25H6V8.75L2.75 12 6 15.25v-2.5h5.25V18h-2.5L12 21.25 15.25 18h-2.5v-5.25H18v2.5L21.25 12 18 8.75v2.5h-5.25V6h2.5L12 2.75Z",
  ],
};

const addOffset = (value: ArrangeRect, offset: ArrangeOffset): ArrangeRect => ({
  left: value.left + offset.x,
  top: value.top + offset.y,
  width: value.width,
  height: value.height,
});

const deltaRect = (current: ArrangeRect, desired: ArrangeRect): ArrangeRect => ({
  left: current.left - desired.left,
  top: current.top - desired.top,
  width: current.width - desired.width,
  height: current.height - desired.height,
});

const unionRects = (values: ArrangeRect[]): ArrangeRect | null => {
  if (!values.length) return null;
  const left = Math.min(...values.map((value) => value.left));
  const top = Math.min(...values.map((value) => value.top));
  const right = Math.max(...values.map((value) => value.left + value.width));
  const bottom = Math.max(...values.map((value) => value.top + value.height));
  return { left, top, width: right - left, height: bottom - top };
};

const rangeGap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.max(aStart, bStart) - Math.min(aEnd, bEnd));

const axisAnchors = (
  value: ArrangeRect,
  axis: "x" | "y",
  kind: SnapCandidate["kind"],
) => {
  const start = axis === "x" ? value.left : value.top;
  const size = axis === "x" ? value.width : value.height;
  const end = start + size;
  if (kind === "edge") return [start, end];
  if (kind === "center") return [start + size / 2];
  return [start, start + size / 2, end];
};

const axisRange = (value: ArrangeRect, axis: "x" | "y") => axis === "x"
  ? { start: value.top, end: value.top + value.height }
  : { start: value.left, end: value.left + value.width };

const snapPriority = (candidate: SnapCandidate) => candidate.kind === "edge" ? 2
  : candidate.kind === "guide" ? 1 : 0;

const findAxisSnap = (
  axis: "x" | "y",
  moving: ArrangeRect,
  candidates: SnapCandidate[],
): AxisSnap | null => {
  const movingRange = axisRange(moving, axis);
  let best: AxisSnap | null = null;

  for (const candidate of candidates) {
    if (candidate.axis !== axis) continue;
    if (
      candidate.source === "element"
      && rangeGap(movingRange.start, movingRange.end, candidate.start, candidate.end) > SNAP_RELEVANCE_DISTANCE
    ) continue;

    for (const anchor of axisAnchors(moving, axis, candidate.kind)) {
      const delta = candidate.position - anchor;
      const distance = Math.abs(delta);
      if (distance > GUIDE_SNAP_DISTANCE) continue;
      const bestDistance = best ? Math.abs(best.delta) : Number.POSITIVE_INFINITY;
      if (
        distance < bestDistance
        || (distance === bestDistance && (!best || snapPriority(candidate) > snapPriority(best)))
      ) {
        best = { ...candidate, delta };
      }
    }
  }

  return best;
};

const pageUrl = (ownerWindow: Window) => {
  const { origin, pathname, search } = ownerWindow.location;
  return `${origin}${pathname}${search}`;
};

const randomId = (ownerWindow: Window, prefix: string) => {
  const value = ownerWindow.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
};

const fingerprintFromValue = (target: ArrangeTargetValue): MesurerElementFingerprint => ({
  tag: target.fingerprintTag,
  id: target.fingerprintId,
  testId: target.fingerprintTestId,
  role: target.fingerprintRole,
  ariaLabel: target.fingerprintAriaLabel,
  classes: [...target.fingerprintClasses],
  text: target.fingerprintText,
});

const publicTarget = (target: ArrangeTargetValue): ArrangeTarget => ({
  id: target.id,
  selector: target.selector,
  fingerprint: fingerprintFromValue(target),
  before: {
    left: target.beforeLeft,
    top: target.beforeTop,
    width: target.beforeWidth,
    height: target.beforeHeight,
  },
  desired: {
    left: target.desiredLeft,
    top: target.desiredTop,
    width: target.desiredWidth,
    height: target.desiredHeight,
  },
  beforeOffset: { x: target.beforeOffsetX, y: target.beforeOffsetY },
  desiredOffset: { x: target.desiredOffsetX, y: target.desiredOffsetY },
});

const publicIntent = (intent: ArrangeIntentValue): ArrangeIntent => ({
  id: intent.id,
  createdAt: intent.createdAt,
  pageUrl: intent.pageUrl,
  targets: intent.targets.map(publicTarget),
});

const restoreTransform = (preview: AppliedPreview) => {
  const { element, transform } = preview;
  if (transform.value || transform.priority) {
    element.style.setProperty("transform", transform.value, transform.priority);
  } else {
    element.style.removeProperty("transform");
  }
};

const isEditable = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
};

export const arrangePlugin = (): MesurerPlugin => defineMesurerPlugin({
  id: MESURER_ARRANGE_PLUGIN_ID,
  version: "0.1.0",
  requires: [RUNTIME_SERVICE_ID, "tool:select"],
  provides: ["tool:arrange", "intent:arrange", "agent:arrange", "settings:arrange"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>(RUNTIME_SERVICE_ID);
    if (!runtime) throw new Error("Arrange plugin requires the Solid renderer runtime.");

    const { ownerDocument, ownerWindow } = runtime;
    const workspace = runtime.createWorkspaceRuntime();
    const inspectorMount = runtime.createInspectorMount();
    const pageTarget = runtime.pageTarget ?? ownerDocument.body ?? ownerDocument.documentElement;
    const overlayTarget: ParentNode = runtime.portalTarget;
    // SAFETY: ownerWindow is the browsing-context global for ownerDocument and owns these DOM constructors.
    const realm = ownerWindow as Window & typeof globalThis;

    ctx.state.register<ArrangeStateValue>({
      id: MESURER_ARRANGE_STATE_ID,
      initial: { intents: [] },
      history: true,
      persist: true,
    });
    ctx.state.register<boolean>({
      id: MESURER_ARRANGE_ACTIVE_STATE_ID,
      initial: false,
    });
    ctx.state.register<ArrangeSettingsValue>({
      id: MESURER_ARRANGE_SETTINGS_STATE_ID,
      initial: {
        snapping: true,
        elementEdges: true,
        elementCenters: true,
        guides: true,
        preferXrayEdges: true,
        snapLines: true,
      },
      persist: true,
    });

    const root = inspectorMount.element;
    root.dataset.mesurerArrange = "true";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "84";
    root.style.pointerEvents = "none";

    const verticalSnapLine = ownerDocument.createElement("div");
    verticalSnapLine.dataset.mesurerArrangeSnapLine = "vertical";
    verticalSnapLine.setAttribute("aria-hidden", "true");
    verticalSnapLine.style.position = "fixed";
    verticalSnapLine.style.display = "none";
    verticalSnapLine.style.width = "1px";
    verticalSnapLine.style.backgroundColor = SNAP_LINE_COLOR;
    verticalSnapLine.style.pointerEvents = "none";

    const horizontalSnapLine = ownerDocument.createElement("div");
    horizontalSnapLine.dataset.mesurerArrangeSnapLine = "horizontal";
    horizontalSnapLine.setAttribute("aria-hidden", "true");
    horizontalSnapLine.style.position = "fixed";
    horizontalSnapLine.style.display = "none";
    horizontalSnapLine.style.height = "1px";
    horizontalSnapLine.style.backgroundColor = SNAP_LINE_COLOR;
    horizontalSnapLine.style.pointerEvents = "none";

    const box = ownerDocument.createElement("div");
    box.dataset.mesurerArrangeBox = "true";
    box.setAttribute("role", "application");
    box.setAttribute("aria-label", "Arrange selected elements");
    box.style.position = "fixed";
    box.style.display = "none";
    box.style.boxSizing = "border-box";
    box.style.border = "1px solid #0d99ff";
    box.style.cursor = "grab";
    box.style.pointerEvents = "auto";
    box.style.touchAction = "none";
    box.style.userSelect = "none";
    root.append(verticalSnapLine, horizontalSnapLine, box);

    const previews = new Map<HTMLElement, AppliedPreview>();
    const hiddenMeasurements = new Map<HTMLElement, InlineVisibility>();
    let presentation: PresentationState = { intentId: null, state: "desired" };
    let drag: DragState | null = null;
    let pendingIntent: ArrangeIntentValue | null = null;
    let disposed = false;
    let refreshFrame = 0;
    let observer: MutationObserver | null = null;

    const state = () => ctx.state.get<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID) ?? { intents: [] };
    const active = () => ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    const settings = (): MesurerArrangeSettings => {
      const stored = ctx.state.get<ArrangeSettingsValue>(MESURER_ARRANGE_SETTINGS_STATE_ID);
      return {
        snapping: stored?.snapping ?? true,
        elementEdges: stored?.elementEdges ?? true,
        elementCenters: stored?.elementCenters ?? true,
        guides: stored?.guides ?? true,
        preferXrayEdges: stored?.preferXrayEdges ?? true,
        snapLines: stored?.snapLines ?? true,
      };
    };
    const updateSettings = (patch: Partial<MesurerArrangeSettings>) => {
      ctx.state.update<ArrangeSettingsValue>(MESURER_ARRANGE_SETTINGS_STATE_ID, (current) => ({
        ...current,
        ...patch,
      }));
    };
    const currentPage = () => pageUrl(ownerWindow);
    const currentIntents = () => state().intents.filter((intent) => intent.pageUrl === currentPage());

    const isMesurerUi = (element: HTMLElement) => Boolean(
      element.closest("[data-mesurer-island='true'], [data-mesurer-inspector-ui='true'], [data-mesurer-root='true']"),
    );
    const isPageElement = (element: HTMLElement) =>
      isElementWithinDomTarget(element, pageTarget) && !isMesurerUi(element);

    const queryCandidates = (selector: string): HTMLElement[] => {
      const matches: HTMLElement[] = [];
      if (pageTarget instanceof realm.HTMLElement && pageTarget.matches(selector) && !isMesurerUi(pageTarget)) {
        matches.push(pageTarget);
      }
      for (const candidate of pageTarget.querySelectorAll(selector)) {
        if (candidate instanceof realm.HTMLElement && isPageElement(candidate)) matches.push(candidate);
      }
      return matches;
    };

    const resolveTarget = (target: ArrangeTargetValue) => {
      const fingerprint = fingerprintFromValue(target);
      if (!isElementFingerprintRebindable(fingerprint)) return null;
      let selectorMatches: HTMLElement[] = [];
      try {
        selectorMatches = queryCandidates(target.selector)
          .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
      } catch {
        return null;
      }
      if (selectorMatches.length !== 1) return null;

      if (!fingerprint.id && !fingerprint.testId) {
        let fingerprintMatches: HTMLElement[] = [];
        try {
          fingerprintMatches = queryCandidates(fingerprint.tag)
            .filter((candidate) => isElementFingerprintCompatible(candidate, fingerprint));
        } catch {
          return null;
        }
        if (fingerprintMatches.length !== 1 || fingerprintMatches[0] !== selectorMatches[0]) return null;
      }
      return selectorMatches[0] ?? null;
    };

    const clearPreviewStyles = () => {
      for (const preview of previews.values()) restoreTransform(preview);
      previews.clear();
    };

    const hideSnapLines = () => {
      verticalSnapLine.style.display = "none";
      horizontalSnapLine.style.display = "none";
    };

    const renderSnapLines = (xSnap: AxisSnap | null, ySnap: AxisSnap | null, moved: ArrangeRect) => {
      hideSnapLines();
      if (!settings().snapLines) return;
      if (xSnap) {
        const top = Math.min(moved.top, xSnap.start);
        const bottom = Math.max(moved.top + moved.height, xSnap.end);
        verticalSnapLine.style.display = "block";
        verticalSnapLine.style.left = `${xSnap.position}px`;
        verticalSnapLine.style.top = `${top}px`;
        verticalSnapLine.style.height = `${Math.max(1, bottom - top)}px`;
      }
      if (ySnap) {
        const left = Math.min(moved.left, ySnap.start);
        const right = Math.max(moved.left + moved.width, ySnap.end);
        horizontalSnapLine.style.display = "block";
        horizontalSnapLine.style.left = `${left}px`;
        horizontalSnapLine.style.top = `${ySnap.position}px`;
        horizontalSnapLine.style.width = `${Math.max(1, right - left)}px`;
      }
    };

    const hideMeasurementOverlays = () => {
      if (hiddenMeasurements.size > 0) return;
      for (const candidate of overlayTarget.querySelectorAll("[data-mesurer-measurement='true']")) {
        if (!(candidate instanceof realm.HTMLElement)) continue;
        hiddenMeasurements.set(candidate, {
          value: candidate.style.getPropertyValue("visibility"),
          priority: candidate.style.getPropertyPriority("visibility"),
        });
        candidate.style.setProperty("visibility", "hidden", "important");
      }
    };

    const restoreMeasurementOverlays = () => {
      for (const [element, visibility] of hiddenMeasurements) {
        if (visibility.value || visibility.priority) {
          element.style.setProperty("visibility", visibility.value, visibility.priority);
        } else {
          element.style.removeProperty("visibility");
        }
      }
      hiddenMeasurements.clear();
    };

    const effectiveOffsets = (intents = currentIntents()) => {
      const offsets = new Map<HTMLElement, ArrangeOffset>();
      for (const intent of intents) {
        for (const target of intent.targets) {
          const element = resolveTarget(target);
          if (!element) continue;
          offsets.set(element, { x: target.desiredOffsetX, y: target.desiredOffsetY });
        }
      }
      return offsets;
    };

    const presentationOffsets = () => {
      if (presentation.state === "live") return new Map<HTMLElement, ArrangeOffset>();
      if (!presentation.intentId) return effectiveOffsets();
      const intent = state().intents.find((candidate) => candidate.id === presentation.intentId);
      if (!intent) return effectiveOffsets();
      const offsets = new Map<HTMLElement, ArrangeOffset>();
      for (const target of intent.targets) {
        const element = resolveTarget(target);
        if (!element) continue;
        offsets.set(element, presentation.state === "before"
          ? { x: target.beforeOffsetX, y: target.beforeOffsetY }
          : { x: target.desiredOffsetX, y: target.desiredOffsetY });
      }
      return offsets;
    };

    const applyOffsets = (offsets: Map<HTMLElement, ArrangeOffset>) => {
      clearPreviewStyles();
      for (const [element, offset] of offsets) {
        if (!element.isConnected || !isPageElement(element)) continue;
        if (offset.x === 0 && offset.y === 0) continue;
        const transform = {
          value: element.style.getPropertyValue("transform"),
          priority: element.style.getPropertyPriority("transform"),
        };
        const computed = ownerWindow.getComputedStyle(element).transform;
        const base = computed && computed !== "none" ? ` ${computed}` : "";
        element.style.setProperty(
          "transform",
          `translate3d(${offset.x}px, ${offset.y}px, 0)${base}`,
          "important",
        );
        previews.set(element, { element, transform });
      }
    };

    const applyPresentation = () => applyOffsets(presentationOffsets());

    const withPreviewsSuspended = <T>(operation: () => T): T => {
      clearPreviewStyles();
      try {
        return operation();
      } finally {
        if (!disposed && !drag) applyPresentation();
      }
    };

    const selectedElements = () => workspace.currentSelection().elements
      .filter((element) => element.isConnected && isPageElement(element));

    ctx.state.register<boolean>({
      id: SELECTION_AVAILABLE_STATE_ID,
      initial: selectedElements().length > 0,
    });
    const selectionAvailable = () =>
      ctx.state.get<boolean>(SELECTION_AVAILABLE_STATE_ID) ?? false;
    const syncSelectionAvailable = () => {
      const next = selectedElements().length > 0;
      if (next === selectionAvailable()) return;
      ctx.state.update<boolean>(SELECTION_AVAILABLE_STATE_ID, () => next);
    };

    const selectionRect = () => unionRects(selectedElements().map((element) => getRectFromDom(element)));

    const collectSnapCandidates = (elements: HTMLElement[]) => {
      const snapSettings = settings();
      if (!snapSettings.snapping) return [];

      const candidates: SnapCandidate[] = [];
      const selected = new Set(elements);
      const snapshot = workspace.snapshot();
      const xrayEdgesOnly = snapshot.xrayVisible
        && snapSettings.preferXrayEdges
        && snapSettings.elementEdges;
      let acceptedElements = 0;

      const addElement = (element: HTMLElement) => {
        if (acceptedElements >= MAX_SNAP_ELEMENTS) return;
        if (selected.has(element) || elements.some((selectedElement) => selectedElement.contains(element))) return;
        if (!isPageElement(element)) return;
        const style = ownerWindow.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return;
        const outlinedByXray = style.outlineStyle === "solid"
          && (Number.parseFloat(style.outlineWidth) || 0) > 0;
        if (xrayEdgesOnly && !outlinedByXray) return;
        const value = getRectFromDom(element);
        if (value.width <= 0 || value.height <= 0) return;
        const margin = SNAP_RELEVANCE_DISTANCE;
        if (
          value.left + value.width < -margin
          || value.top + value.height < -margin
          || value.left > ownerWindow.innerWidth + margin
          || value.top > ownerWindow.innerHeight + margin
        ) return;
        acceptedElements += 1;
        const right = value.left + value.width;
        const bottom = value.top + value.height;

        if (snapSettings.elementEdges) {
          for (const position of [value.left, right]) {
            candidates.push({
              axis: "x",
              position,
              start: value.top,
              end: bottom,
              source: "element",
              kind: "edge",
            });
          }
          for (const position of [value.top, bottom]) {
            candidates.push({
              axis: "y",
              position,
              start: value.left,
              end: right,
              source: "element",
              kind: "edge",
            });
          }
        }

        if (snapSettings.elementCenters && !xrayEdgesOnly) {
          candidates.push({
            axis: "x",
            position: value.left + value.width / 2,
            start: value.top,
            end: bottom,
            source: "element",
            kind: "center",
          });
          candidates.push({
            axis: "y",
            position: value.top + value.height / 2,
            start: value.left,
            end: right,
            source: "element",
            kind: "center",
          });
        }
      };

      if (snapSettings.elementEdges || snapSettings.elementCenters) {
        if (pageTarget instanceof realm.HTMLElement) addElement(pageTarget);
        for (const candidate of pageTarget.querySelectorAll("*")) {
          if (acceptedElements >= MAX_SNAP_ELEMENTS) break;
          if (candidate instanceof realm.HTMLElement) addElement(candidate);
        }
      }

      if (snapSettings.guides) {
        for (const guide of snapshot.guides) {
          if (guide.orientation === "vertical") {
            candidates.push({
              axis: "x",
              position: guide.position,
              start: 0,
              end: ownerWindow.innerHeight,
              source: "guide",
              kind: "guide",
            });
          } else {
            candidates.push({
              axis: "y",
              position: guide.position,
              start: 0,
              end: ownerWindow.innerWidth,
              source: "guide",
              kind: "guide",
            });
          }
        }
      }

      return candidates;
    };

    const renderBox = (override?: ArrangeRect | null) => {
      if (!active()) {
        box.style.display = "none";
        return;
      }
      const value = override === undefined ? selectionRect() : override;
      if (!value) {
        box.style.display = "none";
        return;
      }
      box.style.display = "block";
      box.style.left = `${value.left}px`;
      box.style.top = `${value.top}px`;
      box.style.width = `${value.width}px`;
      box.style.height = `${value.height}px`;
    };

    const showCurrentDesired = () => {
      presentation = { intentId: null, state: "desired" };
      applyPresentation();
      hideSnapLines();
      if (active()) hideMeasurementOverlays();
      else restoreMeasurementOverlays();
    };

    const returnToLive = () => {
      presentation = { intentId: null, state: "live" };
      clearPreviewStyles();
      hideSnapLines();
      restoreMeasurementOverlays();
    };

    const refresh = () => {
      if (disposed || drag) return;
      applyPresentation();
      hideSnapLines();
      if (active()) hideMeasurementOverlays();
      else restoreMeasurementOverlays();
      renderBox();
    };

    const scheduleRefresh = () => {
      if (refreshFrame || disposed) return;
      refreshFrame = ownerWindow.requestAnimationFrame(() => {
        refreshFrame = 0;
        refresh();
      });
    };

    const ensureSelectActive = async () => {
      const button = overlayTarget.querySelector<HTMLButtonElement>("[data-mesurer-builtin='select'] button");
      if (button?.getAttribute("aria-pressed") === "true") return;
      await ctx.command.execute(BUILTIN_SELECT_COMMAND, undefined, { source: "arrange" });
    };

    const beginDrag = (event: PointerEvent) => {
      if (!active() || event.button !== 0) return;
      const elements = selectedElements();
      if (!elements.length) return;
      event.preventDefault();
      event.stopPropagation();

      presentation = { intentId: null, state: "desired" };
      applyPresentation();
      const previousOffsets = effectiveOffsets(currentIntents());
      clearPreviewStyles();
      const targets = elements.map((element, index): DragTarget => {
        const natural = getRectFromDom(element);
        const beforeOffset = previousOffsets.get(element) ?? { x: 0, y: 0 };
        const before = addOffset(natural, beforeOffset);
        const fingerprint = getElementFingerprint(element);
        return {
          element,
          target: {
            id: `target-${index + 1}`,
            selector: getElementSelector(element),
            fingerprintTag: fingerprint.tag,
            fingerprintId: fingerprint.id,
            fingerprintTestId: fingerprint.testId,
            fingerprintRole: fingerprint.role,
            fingerprintAriaLabel: fingerprint.ariaLabel,
            fingerprintClasses: [...fingerprint.classes],
            fingerprintText: fingerprint.text,
            beforeLeft: before.left,
            beforeTop: before.top,
            beforeWidth: before.width,
            beforeHeight: before.height,
            desiredLeft: before.left,
            desiredTop: before.top,
            desiredWidth: before.width,
            desiredHeight: before.height,
            beforeOffsetX: beforeOffset.x,
            beforeOffsetY: beforeOffset.y,
            desiredOffsetX: beforeOffset.x,
            desiredOffsetY: beforeOffset.y,
          },
        };
      });
      const groupBefore = unionRects(targets.map(({ target }) => ({
        left: target.beforeLeft,
        top: target.beforeTop,
        width: target.beforeWidth,
        height: target.beforeHeight,
      })));
      if (!groupBefore) {
        applyPresentation();
        return;
      }

      applyPresentation();
      hideMeasurementOverlays();
      hideSnapLines();
      drag = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        targets,
        groupBefore,
        snapCandidates: collectSnapCandidates(elements),
        dx: 0,
        dy: 0,
      };
      renderBox(groupBefore);
      box.style.cursor = "grabbing";
      box.setPointerCapture?.(event.pointerId);
    };

    const updateDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      let dx = event.clientX - drag.originX;
      let dy = event.clientY - drag.originY;
      let movementAxis: "x" | "y" | null = null;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          dy = 0;
          movementAxis = "x";
        } else {
          dx = 0;
          movementAxis = "y";
        }
      }

      const rawMoved = addOffset(drag.groupBefore, { x: dx, y: dy });
      const xSnap = movementAxis === "y" ? null : findAxisSnap("x", rawMoved, drag.snapCandidates);
      const ySnap = movementAxis === "x" ? null : findAxisSnap("y", rawMoved, drag.snapCandidates);
      dx += xSnap?.delta ?? 0;
      dy += ySnap?.delta ?? 0;
      drag.dx = dx;
      drag.dy = dy;

      const offsets = effectiveOffsets(currentIntents());
      for (const item of drag.targets) {
        offsets.set(item.element, {
          x: item.target.beforeOffsetX + dx,
          y: item.target.beforeOffsetY + dy,
        });
      }
      applyOffsets(offsets);
      const moved = addOffset(drag.groupBefore, { x: dx, y: dy });
      renderBox(moved);
      renderSnapLines(xSnap, ySnap, moved);
    };

    const cancelDrag = () => {
      if (!drag) return;
      const pointerId = drag.pointerId;
      drag = null;
      if (box.hasPointerCapture?.(pointerId)) box.releasePointerCapture(pointerId);
      box.style.cursor = "grab";
      showCurrentDesired();
      renderBox();
    };

    const finishDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const completed = drag;
      drag = null;
      if (box.hasPointerCapture?.(event.pointerId)) box.releasePointerCapture(event.pointerId);
      box.style.cursor = "grab";
      hideSnapLines();

      if (completed.dx === 0 && completed.dy === 0) {
        showCurrentDesired();
        renderBox();
        return;
      }

      pendingIntent = {
        id: randomId(ownerWindow, "arrange"),
        createdAt: Date.now(),
        pageUrl: currentPage(),
        targets: completed.targets.map(({ target }) => ({
          ...target,
          desiredLeft: target.beforeLeft + completed.dx,
          desiredTop: target.beforeTop + completed.dy,
          desiredOffsetX: target.beforeOffsetX + completed.dx,
          desiredOffsetY: target.beforeOffsetY + completed.dy,
        })),
      };
      void ctx.command.execute(COMMIT_COMMAND).catch(() => {
        pendingIntent = null;
        showCurrentDesired();
        renderBox();
      });
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      cancelDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!active() && !drag)) return;
      if (isEditable(event.target)) return;
      if (overlayTarget.querySelector("[data-mesurer-tool-menu]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (drag) {
        cancelDrag();
      } else {
        ctx.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => false);
        returnToLive();
        renderBox();
      }
    };

    box.addEventListener("pointerdown", beginDrag);
    box.addEventListener("pointermove", updateDrag);
    box.addEventListener("pointerup", finishDrag);
    box.addEventListener("pointercancel", onPointerCancel);
    ownerWindow.addEventListener("keydown", onKeyDown, true);
    ownerWindow.addEventListener("resize", scheduleRefresh);
    ownerWindow.addEventListener("scroll", scheduleRefresh, true);
    pageTarget.addEventListener("scroll", scheduleRefresh, true);

    observer = new realm.MutationObserver(() => {
      syncSelectionAvailable();
      scheduleRefresh();
    });
    observer.observe(pageTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "data-testid", "role", "aria-label"],
    });

    const workspaceUnsubscribe = workspace.subscribe(() => {
      syncSelectionAvailable();
      scheduleRefresh();
    });
    const stateSubscription = ctx.state.subscribe(scheduleRefresh);

    const findIntent = (id: string) => state().intents.find((intent) => intent.id === id) ?? null;

    const focusRect = (intent: ArrangeIntentValue, stateValue: ArrangePresentation) => {
      let value: ArrangeRect | null = null;
      if (stateValue === "before") {
        value = unionRects(intent.targets.map((target) => ({
          left: target.beforeLeft,
          top: target.beforeTop,
          width: target.beforeWidth,
          height: target.beforeHeight,
        })));
      } else if (stateValue === "desired") {
        value = unionRects(intent.targets.map((target) => ({
          left: target.desiredLeft,
          top: target.desiredTop,
          width: target.desiredWidth,
          height: target.desiredHeight,
        })));
      } else {
        value = withPreviewsSuspended(() => unionRects(intent.targets
          .map((target) => resolveTarget(target))
          .filter((element): element is HTMLElement => element !== null)
          .map((element) => getRectFromDom(element))));
      }
      if (!value) throw new Error(`Arrange intent has no resolvable capture region: ${intent.id}`);
      const left = Math.max(0, value.left - CAPTURE_PADDING);
      const top = Math.max(0, value.top - CAPTURE_PADDING);
      const right = Math.min(ownerWindow.innerWidth, value.left + value.width + CAPTURE_PADDING);
      const bottom = Math.min(ownerWindow.innerHeight, value.top + value.height + CAPTURE_PADDING);
      return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };

    const review = (id: string, tolerance = DEFAULT_REVIEW_TOLERANCE): ArrangeReview => {
      const intent = findIntent(id);
      if (!intent) throw new Error(`Arrange intent not found: ${id}`);
      const targets = withPreviewsSuspended(() => intent.targets.map((target): ArrangeReviewTarget => {
        const element = resolveTarget(target);
        const desired = {
          left: target.desiredLeft,
          top: target.desiredTop,
          width: target.desiredWidth,
          height: target.desiredHeight,
        };
        if (!element) {
          return {
            targetId: target.id,
            selector: target.selector,
            desired,
            current: null,
            delta: null,
            matched: false,
          };
        }
        const current = getRectFromDom(element);
        const delta = deltaRect(current, desired);
        const matched = Math.abs(delta.left) <= tolerance
          && Math.abs(delta.top) <= tolerance
          && Math.abs(delta.width) <= tolerance
          && Math.abs(delta.height) <= tolerance;
        return { targetId: target.id, selector: target.selector, desired, current, delta, matched };
      }));
      const resolved = targets.filter((target) => target.current !== null).length;
      const targetStatus = resolved === 0 ? "stale" as const
        : resolved === targets.length ? "connected" as const : "partial" as const;
      return {
        schema: "mesurer.arrange-review/v1",
        arrangeId: intent.id,
        targetStatus,
        tolerance,
        matched: targets.length > 0 && targets.every((target) => target.matched),
        targets,
      };
    };

    const service: MesurerArrangeService = {
      active,
      intents: () => state().intents.map(publicIntent),
      intent(id) {
        const intent = findIntent(id);
        return intent ? publicIntent(intent) : null;
      },
      show(id, stateValue) {
        const intent = findIntent(id);
        if (!intent) throw new Error(`Arrange intent not found: ${id}`);
        presentation = { intentId: id, state: stateValue };
        refresh();
      },
      showCurrent() {
        presentation = { intentId: null, state: "desired" };
        refresh();
      },
      capturePlan(id, stateValue) {
        const intent = findIntent(id);
        if (!intent) throw new Error(`Arrange intent not found: ${id}`);
        return {
          schema: "mesurer.arrange-capture/v1",
          arrangeId: id,
          state: stateValue,
          chrome: "hide",
          captures: [
            { id: "viewport", kind: "viewport" },
            { id: "focus", kind: "clip", rect: focusRect(intent, stateValue) },
          ],
        };
      },
      review,
      clear: () => ctx.command.execute(CLEAR_COMMAND),
    };

    ctx.tool.register({
      id: "arrange",
      label: "Arrange",
      shortcut: "Shift+A",
      order: 65,
      command: TOGGLE_COMMAND,
      icon: moveIcon,
      active,
      menu: {
        label: "Arrange options",
        items: [
          {
            id: "snapping",
            label: "Snapping",
            checked: () => settings().snapping,
            run: () => updateSettings({ snapping: !settings().snapping }),
          },
          {
            id: "element-edges",
            label: "Element edges",
            checked: () => settings().elementEdges,
            disabled: () => !settings().snapping,
            run: () => updateSettings({ elementEdges: !settings().elementEdges }),
          },
          {
            id: "element-centers",
            label: "Element centers",
            checked: () => settings().elementCenters,
            disabled: () => !settings().snapping,
            run: () => updateSettings({ elementCenters: !settings().elementCenters }),
          },
          {
            id: "guides",
            label: "Guides",
            checked: () => settings().guides,
            disabled: () => !settings().snapping,
            run: () => updateSettings({ guides: !settings().guides }),
          },
          {
            id: "prefer-xray-edges",
            label: "Prefer X-ray edges",
            checked: () => settings().preferXrayEdges,
            disabled: () => !settings().snapping || !settings().elementEdges,
            run: () => updateSettings({ preferXrayEdges: !settings().preferXrayEdges }),
          },
          {
            id: "alignment-rulers",
            label: "Alignment rulers",
            checked: () => settings().snapLines,
            disabled: () => !settings().snapping,
            run: () => updateSettings({ snapLines: !settings().snapLines }),
          },
        ],
      },
    });
    ctx.settings.register({
      id: "arrange",
      label: "Arrange",
      order: 35,
      controls: [
        {
          type: "toggle",
          id: "snapping",
          label: "Snapping",
          description: "Magnetically align dragged selections to nearby layout anchors.",
          value: () => settings().snapping,
          set: (snapping) => updateSettings({ snapping }),
        },
        {
          type: "toggle",
          id: "element-edges",
          label: "Element edges",
          description: "Snap left/right and top/bottom edges to nearby elements.",
          value: () => settings().elementEdges,
          set: (elementEdges) => updateSettings({ elementEdges }),
          disabled: () => !settings().snapping,
        },
        {
          type: "toggle",
          id: "element-centers",
          label: "Element centers",
          description: "Snap center-to-center when X-ray edge preference is not active.",
          value: () => settings().elementCenters,
          set: (elementCenters) => updateSettings({ elementCenters }),
          disabled: () => !settings().snapping,
        },
        {
          type: "toggle",
          id: "guides",
          label: "Guides",
          description: "Snap to existing Mesurer guides.",
          value: () => settings().guides,
          set: (guides) => updateSettings({ guides }),
          disabled: () => !settings().snapping,
        },
        {
          type: "toggle",
          id: "prefer-xray-edges",
          label: "Prefer X-ray edges",
          description: "When X-ray is on, use its visible blue box edges as element snap targets.",
          value: () => settings().preferXrayEdges,
          set: (preferXrayEdges) => updateSettings({ preferXrayEdges }),
          disabled: () => !settings().snapping || !settings().elementEdges,
        },
        {
          type: "toggle",
          id: "alignment-rulers",
          label: "Alignment rulers",
          description: "Show the red alignment ruler while a snap is active.",
          value: () => settings().snapLines,
          set: (snapLines) => updateSettings({ snapLines }),
          disabled: () => !settings().snapping,
        },
      ],
    });
    ctx.command.register(TOGGLE_COMMAND, async () => {
      const next = !active();
      if (next) await ensureSelectActive();
      ctx.state.update<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID, () => next);
      if (!next) {
        if (drag) cancelDrag();
        returnToLive();
        renderBox();
        return;
      }
      showCurrentDesired();
      renderBox();
    });
    ctx.command.register(COMMIT_COMMAND, () => {
      const intent = pendingIntent;
      pendingIntent = null;
      if (!intent) return;
      ctx.state.update<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID, (current) => ({
        intents: [...current.intents, intent].slice(-MAX_INTENTS),
      }));
      showCurrentDesired();
      renderBox();
    });
    ctx.command.register(CLEAR_COMMAND, () => {
      ctx.state.update<ArrangeStateValue>(MESURER_ARRANGE_STATE_ID, () => ({ intents: [] }));
      presentation = { intentId: null, state: "desired" };
      clearPreviewStyles();
      hideSnapLines();
      if (active()) hideMeasurementOverlays();
      else restoreMeasurementOverlays();
      renderBox();
    });
    ctx.service.provide(MESURER_ARRANGE_SERVICE_ID, service);

    applyPresentation();
    renderBox();

    ctx.lifecycle.onDispose(() => {
      disposed = true;
      if (refreshFrame) ownerWindow.cancelAnimationFrame(refreshFrame);
      observer?.disconnect();
      observer = null;
      box.removeEventListener("pointerdown", beginDrag);
      box.removeEventListener("pointermove", updateDrag);
      box.removeEventListener("pointerup", finishDrag);
      box.removeEventListener("pointercancel", onPointerCancel);
      ownerWindow.removeEventListener("keydown", onKeyDown, true);
      ownerWindow.removeEventListener("resize", scheduleRefresh);
      ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
      pageTarget.removeEventListener("scroll", scheduleRefresh, true);
      workspaceUnsubscribe();
      stateSubscription.dispose();
      clearPreviewStyles();
      hideSnapLines();
      restoreMeasurementOverlays();
      workspace.dispose();
      inspectorMount.dispose();
    });
  },
});