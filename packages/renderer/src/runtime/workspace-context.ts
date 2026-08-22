import type { DistanceOverlay, Guide, Measurement, Rect } from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  getRectFromDom,
  isElementFingerprintCompatible,
  type DomElementFingerprint,
} from "@jhomra21/mesurer-solid-dom";
import { getLatestMeasurerModel, type MeasurerModel } from "../model/create-measurer-model";

export type MesurerContextRequest =
  | { scope?: "workspace" }
  | { scope: "selection" }
  | { annotation: string };

export type MesurerAnnotationTarget = {
  id: string;
  selector: string;
  fingerprint: DomElementFingerprint;
  lastRect: Rect;
};

export type MesurerAnnotationBaseline = {
  targets: Array<{ id: string; selector: string; rect: Rect }>;
  guides: Guide[];
  measurements: Array<{ id: string; rect: Rect; deltaX: number; deltaY: number; snapped?: boolean }>;
  distances: Array<{
    id: string;
    rectA: Rect;
    rectB: Rect;
    horizontal: DistanceOverlay["horizontal"];
    vertical: DistanceOverlay["vertical"];
  }>;
};

export type MesurerAnnotation = {
  id: string;
  note: string;
  createdAt: number;
  anchor:
    | { kind: "elements"; targets: MesurerAnnotationTarget[]; region: Rect | null }
    | { kind: "region"; rect: Rect };
  baseline: MesurerAnnotationBaseline;
};

export type MesurerResolvedAnnotation = MesurerAnnotation & {
  resolvedTargets: Array<{ target: MesurerAnnotationTarget; element: HTMLElement | null }>;
};

export type MesurerWorkspaceSnapshot = {
  enabled: boolean;
  rulersVisible: boolean;
  xrayVisible: boolean;
  selectedMeasurements: MeasurerModel["current"]["selectedMeasurements"];
  selectionOriginRect: Rect | null;
  measurements: Measurement<HTMLElement>[];
  activeMeasurement: Measurement<HTMLElement> | null;
  heldDistances: DistanceOverlay<HTMLElement>[];
  guides: Guide[];
  annotations: MesurerAnnotation[];
};

export type MesurerWorkspaceRuntime = {
  snapshot(): MesurerWorkspaceSnapshot;
  currentSelection(): { elements: HTMLElement[]; region: Rect | null };
  annotations(): MesurerAnnotation[];
  annotation(id: string): MesurerResolvedAnnotation | null;
  annotationRect(id: string): Rect | null;
  addSelectionAnnotation(note: string): MesurerAnnotation;
  addRegionAnnotation(note: string, rect: Rect): MesurerAnnotation;
  removeAnnotation(id: string): void;
  subscribe(listener: () => void): () => void;
  prepareCapture(): void;
  finishCapture(): void;
  dispose(): void;
};

const cloneRect = (value: Rect): Rect => ({ ...value });

const copyAnnotation = (annotation: MesurerAnnotation): MesurerAnnotation => ({
  ...annotation,
  anchor: annotation.anchor.kind === "elements"
    ? {
        kind: "elements",
        region: annotation.anchor.region ? cloneRect(annotation.anchor.region) : null,
        targets: annotation.anchor.targets.map((target) => ({
          ...target,
          fingerprint: { ...target.fingerprint, classes: [...target.fingerprint.classes] },
          lastRect: cloneRect(target.lastRect),
        })),
      }
    : { kind: "region", rect: cloneRect(annotation.anchor.rect) },
  baseline: {
    targets: annotation.baseline.targets.map((target) => ({ ...target, rect: cloneRect(target.rect) })),
    guides: annotation.baseline.guides.map((guide) => ({ ...guide })),
    measurements: annotation.baseline.measurements.map((measurement) => ({ ...measurement, rect: cloneRect(measurement.rect) })),
    distances: annotation.baseline.distances.map((distance) => ({
      ...distance,
      rectA: cloneRect(distance.rectA),
      rectB: cloneRect(distance.rectB),
      horizontal: distance.horizontal ? { ...distance.horizontal } : null,
      vertical: distance.vertical ? { ...distance.vertical } : null,
    })),
  },
});

const randomId = (ownerWindow: Window, prefix: string) => {
  const value = ownerWindow.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
};

const selectedElements = (model: MeasurerModel) => {
  const seen = new Set<HTMLElement>();
  const elements: HTMLElement[] = [];
  for (const measurement of model.current.selectedMeasurements) {
    const element = measurement.elementRef;
    if (!element?.isConnected || seen.has(element)) continue;
    seen.add(element);
    elements.push(element);
  }
  const primary = model.current.selectedMeasurement?.elementRef;
  if (primary?.isConnected && !seen.has(primary)) elements.push(primary);
  return elements;
};

const stripMeasurement = (measurement: Measurement<HTMLElement>): MesurerAnnotationBaseline["measurements"][number] => {
  const value: MesurerAnnotationBaseline["measurements"][number] = {
    id: measurement.id,
    rect: cloneRect(measurement.rect),
    deltaX: measurement.deltaX,
    deltaY: measurement.deltaY,
  };
  if (measurement.snapped !== undefined) value.snapped = measurement.snapped;
  return value;
};

const stripDistance = (distance: DistanceOverlay<HTMLElement>) => ({
  id: distance.id,
  rectA: cloneRect(distance.rectA),
  rectB: cloneRect(distance.rectB),
  horizontal: distance.horizontal ? { ...distance.horizontal } : null,
  vertical: distance.vertical ? { ...distance.vertical } : null,
});

export function createMesurerWorkspaceRuntime(options: {
  ownerDocument: Document;
  ownerWindow: Window;
  uiRoot?: ParentNode;
}): MesurerWorkspaceRuntime {
  const { ownerDocument, ownerWindow, uiRoot } = options;
  const model = getLatestMeasurerModel();
  if (!model) throw new Error("Mesurer renderer model is unavailable for context plugin setup.");
  const annotations: MesurerAnnotation[] = [];
  const listeners = new Set<() => void>();
  const hidden = new Map<HTMLElement, string>();
  let disposed = false;
  let mutationFrame = 0;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const resolveTarget = (target: MesurerAnnotationTarget) => {
    let candidates: Element[] = [];
    try {
      candidates = [...ownerDocument.querySelectorAll(target.selector)];
    } catch {
      candidates = [];
    }
    const compatible = candidates.filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
    if (compatible.length !== 1) return null;
    const element = compatible[0];
    const HTMLElementCtor = (ownerWindow as Window & typeof globalThis).HTMLElement;
    return element instanceof HTMLElementCtor ? element as HTMLElement : null;
  };

  const refreshAnnotations = () => {
    let changed = false;
    for (const annotation of annotations) {
      if (annotation.anchor.kind !== "elements") continue;
      for (const target of annotation.anchor.targets) {
        const element = resolveTarget(target);
        if (!element) continue;
        const value = getRectFromDom(element);
        if (value.left !== target.lastRect.left || value.top !== target.lastRect.top || value.width !== target.lastRect.width || value.height !== target.lastRect.height) {
          target.lastRect = value;
          changed = true;
        }
      }
    }
    if (changed) notify();
  };

  const scheduleRefresh = () => {
    if (mutationFrame || disposed) return;
    mutationFrame = ownerWindow.requestAnimationFrame(() => {
      mutationFrame = 0;
      refreshAnnotations();
    });
  };

  const MutationObserverCtor = (ownerWindow as Window & typeof globalThis).MutationObserver;
  const observer = new MutationObserverCtor(scheduleRefresh);
  if (ownerDocument.documentElement) {
    observer.observe(ownerDocument.documentElement, { childList: true, subtree: true, attributes: true });
  }
  ownerWindow.addEventListener("resize", scheduleRefresh);
  ownerWindow.addEventListener("scroll", scheduleRefresh, true);
  const modelUnsubscribe = model.subscribe(notify);

  const baseline = (targets: MesurerAnnotationTarget[]): MesurerAnnotationBaseline => {
    const measurements = [
      ...model.current.measurements,
      ...(model.current.activeMeasurement && !model.current.measurements.some((item) => item.id === model.current.activeMeasurement?.id)
        ? [model.current.activeMeasurement]
        : []),
    ];
    return {
      targets: targets.map((target) => ({ id: target.id, selector: target.selector, rect: cloneRect(target.lastRect) })),
      guides: model.current.guides.map((guide) => ({ ...guide })),
      measurements: measurements.map(stripMeasurement),
      distances: model.current.heldDistances.map(stripDistance),
    };
  };

  const makeTarget = (element: HTMLElement, index: number): MesurerAnnotationTarget => ({
    id: `target-${index + 1}`,
    selector: getElementSelector(element),
    fingerprint: getElementFingerprint(element),
    lastRect: getRectFromDom(element),
  });

  const pushAnnotation = (annotation: MesurerAnnotation) => {
    annotations.push(annotation);
    notify();
    return copyAnnotation(annotation);
  };

  return {
    snapshot() {
      return {
        enabled: model.current.enabled,
        rulersVisible: model.current.rulersVisible,
        xrayVisible: model.current.xrayVisible,
        selectedMeasurements: [...model.current.selectedMeasurements],
        selectionOriginRect: model.current.selectionOriginRect ? cloneRect(model.current.selectionOriginRect) : null,
        measurements: [...model.current.measurements],
        activeMeasurement: model.current.activeMeasurement,
        heldDistances: [...model.current.heldDistances],
        guides: model.current.guides.map((guide) => ({ ...guide })),
        annotations: annotations.map(copyAnnotation),
      };
    },
    currentSelection() {
      return {
        elements: selectedElements(model),
        region: model.current.selectionOriginRect ? cloneRect(model.current.selectionOriginRect) : null,
      };
    },
    annotations() {
      refreshAnnotations();
      return annotations.map(copyAnnotation);
    },
    annotation(id) {
      refreshAnnotations();
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return null;
      const copy = copyAnnotation(annotation);
      return {
        ...copy,
        resolvedTargets: copy.anchor.kind === "elements"
          ? copy.anchor.targets.map((target) => ({ target, element: resolveTarget(target) }))
          : [],
      };
    },
    annotationRect(id) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return null;
      if (annotation.anchor.kind === "region") return cloneRect(annotation.anchor.rect);
      const rects = annotation.anchor.targets
        .map((target) => resolveTarget(target)?.getBoundingClientRect())
        .filter((value): value is DOMRect => value !== undefined);
      if (!rects.length) {
        const fallback = annotation.anchor.targets[0]?.lastRect;
        return fallback ? cloneRect(fallback) : null;
      }
      const left = Math.min(...rects.map((value) => value.left));
      const top = Math.min(...rects.map((value) => value.top));
      const right = Math.max(...rects.map((value) => value.right));
      const bottom = Math.max(...rects.map((value) => value.bottom));
      return { left, top, width: right - left, height: bottom - top };
    },
    addSelectionAnnotation(note) {
      const value = note.trim();
      if (!value) throw new Error("Annotation note cannot be empty.");
      const elements = selectedElements(model);
      if (!elements.length) throw new Error("Select at least one page element before adding an annotation.");
      const targets = elements.map(makeTarget);
      return pushAnnotation({
        id: randomId(ownerWindow, "annotation"),
        note: value,
        createdAt: Date.now(),
        anchor: {
          kind: "elements",
          targets,
          region: model.current.selectionOriginRect ? cloneRect(model.current.selectionOriginRect) : null,
        },
        baseline: baseline(targets),
      });
    },
    addRegionAnnotation(note, value) {
      const text = note.trim();
      if (!text) throw new Error("Annotation note cannot be empty.");
      return pushAnnotation({
        id: randomId(ownerWindow, "annotation"),
        note: text,
        createdAt: Date.now(),
        anchor: { kind: "region", rect: cloneRect(value) },
        baseline: baseline([]),
      });
    },
    removeAnnotation(id) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) return;
      annotations.splice(index, 1);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prepareCapture() {
      if (!uiRoot) return;
      const selector = [
        "[data-mesurer-layer='chrome']",
        "[data-mesurer-toolbar='true']",
        "[data-mesurer-extension-toolbar='true']",
        "[data-mesurer-inspector-ui='true']:not([data-mesurer-layer='evidence'])",
        ".mesurer-color-picker",
      ].join(",");
      for (const element of uiRoot.querySelectorAll<HTMLElement>(selector)) {
        if (hidden.has(element)) continue;
        hidden.set(element, element.style.display);
        element.style.setProperty("display", "none", "important");
      }
    },
    finishCapture() {
      for (const [element, display] of hidden) {
        if (display) element.style.display = display;
        else element.style.removeProperty("display");
      }
      hidden.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mutationFrame) ownerWindow.cancelAnimationFrame(mutationFrame);
      modelUnsubscribe();
      observer.disconnect();
      ownerWindow.removeEventListener("resize", scheduleRefresh);
      ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
      for (const [element, display] of hidden) {
        if (display) element.style.display = display;
        else element.style.removeProperty("display");
      }
      hidden.clear();
      annotations.length = 0;
      listeners.clear();
    },
  };
}
