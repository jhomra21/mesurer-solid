import type {
  DistanceOverlay,
  Guide,
  Measurement,
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerContextRequest,
  Rect,
} from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  getRectFromDom,
  isElementFingerprintCompatible,
  isElementFingerprintRebindable,
} from "@jhomra21/mesurer-solid-dom";
import type { MeasurerModel } from "../model/create-measurer-model";

export type {
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerContextRequest,
} from "@jhomra21/mesurer-solid-core";

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
  model: MeasurerModel;
  ownerDocument: Document;
  ownerWindow: Window;
  uiRoot?: ParentNode;
}): MesurerWorkspaceRuntime {
  const { model, ownerDocument, ownerWindow, uiRoot } = options;
  const realm = ownerWindow as Window & typeof globalThis;
  const annotations: MesurerAnnotation[] = [];
  const listeners = new Set<() => void>();
  const hidden = new Map<HTMLElement, string>();
  const liveTargets = new Map<string, HTMLElement>();
  const targetResolution = new Map<string, boolean>();
  let disposed = false;
  let mutationFrame = 0;
  let observer: MutationObserver | null = null;
  let watching = false;

  const targetKey = (annotationId: string, targetId: string) => `${annotationId}:${targetId}`;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const uniqueRebindCandidate = (target: MesurerAnnotationTarget) => {
    if (!isElementFingerprintRebindable(target.fingerprint)) return null;

    let selectorMatches: Element[] = [];
    try {
      selectorMatches = [...ownerDocument.querySelectorAll(target.selector)]
        .filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
    } catch {
      return null;
    }
    if (selectorMatches.length !== 1) return null;

    if (!target.fingerprint.id && !target.fingerprint.testId) {
      const fingerprintMatches = [...ownerDocument.getElementsByTagName(target.fingerprint.tag)]
        .filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
      if (fingerprintMatches.length !== 1 || fingerprintMatches[0] !== selectorMatches[0]) return null;
    }

    const candidate = selectorMatches[0];
    return candidate instanceof realm.HTMLElement ? candidate : null;
  };

  const resolveTarget = (annotationId: string, target: MesurerAnnotationTarget) => {
    const key = targetKey(annotationId, target.id);
    const live = liveTargets.get(key);
    if (live?.isConnected) return live;
    if (live) liveTargets.delete(key);

    const rebound = uniqueRebindCandidate(target);
    if (rebound) liveTargets.set(key, rebound);
    return rebound;
  };

  const refreshAnnotations = () => {
    let changed = false;
    for (const annotation of annotations) {
      if (annotation.anchor.kind !== "elements") continue;
      for (const target of annotation.anchor.targets) {
        const key = targetKey(annotation.id, target.id);
        const element = resolveTarget(annotation.id, target);
        const resolved = Boolean(element);
        if (targetResolution.get(key) !== resolved) {
          targetResolution.set(key, resolved);
          changed = true;
        }
        if (!element) continue;
        const value = getRectFromDom(element);
        if (
          value.left !== target.lastRect.left
          || value.top !== target.lastRect.top
          || value.width !== target.lastRect.width
          || value.height !== target.lastRect.height
        ) {
          target.lastRect = value;
          changed = true;
        }
      }
    }
    if (changed) notify();
  };

  const scheduleRefresh = () => {
    if (mutationFrame || disposed || annotations.length === 0) return;
    mutationFrame = ownerWindow.requestAnimationFrame(() => {
      mutationFrame = 0;
      refreshAnnotations();
    });
  };

  const startWatching = () => {
    if (watching || disposed || annotations.length === 0) return;
    watching = true;
    observer = new realm.MutationObserver(scheduleRefresh);
    const root = ownerDocument.body ?? ownerDocument.documentElement;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["id", "class", "data-testid", "role", "aria-label", "style"],
      });
    }
    ownerWindow.addEventListener("resize", scheduleRefresh);
    ownerWindow.addEventListener("scroll", scheduleRefresh, true);
  };

  const stopWatching = () => {
    if (!watching) return;
    watching = false;
    observer?.disconnect();
    observer = null;
    ownerWindow.removeEventListener("resize", scheduleRefresh);
    ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
    if (mutationFrame) ownerWindow.cancelAnimationFrame(mutationFrame);
    mutationFrame = 0;
  };

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

  const pushAnnotation = (annotation: MesurerAnnotation, elements: HTMLElement[] = []) => {
    annotations.push(annotation);
    if (annotation.anchor.kind === "elements") {
      annotation.anchor.targets.forEach((target, index) => {
        const element = elements[index];
        const key = targetKey(annotation.id, target.id);
        if (element) liveTargets.set(key, element);
        targetResolution.set(key, Boolean(element));
      });
    }
    startWatching();
    notify();
    return copyAnnotation(annotation);
  };

  const addRegionAnnotation = (note: string, value: Rect) => {
    const text = note.trim();
    if (!text) throw new Error("Annotation note cannot be empty.");
    return pushAnnotation({
      id: randomId(ownerWindow, "annotation"),
      note: text,
      createdAt: Date.now(),
      anchor: { kind: "region", rect: cloneRect(value) },
      baseline: baseline([]),
    });
  };

  const addSelectionAnnotation = (note: string) => {
    const value = note.trim();
    if (!value) throw new Error("Annotation note cannot be empty.");
    const elements = selectedElements(model);
    const region = model.current.selectionOriginRect ? cloneRect(model.current.selectionOriginRect) : null;
    if (!elements.length) {
      if (!region) throw new Error("Select a page element or drag a region before adding an annotation.");
      return addRegionAnnotation(value, region);
    }
    const targets = elements.map(makeTarget);
    return pushAnnotation({
      id: randomId(ownerWindow, "annotation"),
      note: value,
      createdAt: Date.now(),
      anchor: { kind: "elements", targets, region },
      baseline: baseline(targets),
    }, elements);
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
        resolvedTargets: copy.anchor.kind === "elements" && annotation.anchor.kind === "elements"
          ? copy.anchor.targets.map((target, index) => ({
              target,
              element: resolveTarget(annotation.id, annotation.anchor.targets[index]),
            }))
          : [],
      };
    },
    annotationRect(id) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return null;
      if (annotation.anchor.kind === "region") return cloneRect(annotation.anchor.rect);
      const rects = annotation.anchor.targets
        .map((target) => resolveTarget(annotation.id, target)?.getBoundingClientRect())
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
    addSelectionAnnotation,
    addRegionAnnotation,
    removeAnnotation(id) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) return;
      const [removed] = annotations.splice(index, 1);
      if (removed.anchor.kind === "elements") {
        for (const target of removed.anchor.targets) {
          const key = targetKey(removed.id, target.id);
          liveTargets.delete(key);
          targetResolution.delete(key);
        }
      }
      if (annotations.length === 0) stopWatching();
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
      stopWatching();
      modelUnsubscribe();
      for (const [element, display] of hidden) {
        if (display) element.style.display = display;
        else element.style.removeProperty("display");
      }
      hidden.clear();
      liveTargets.clear();
      targetResolution.clear();
      annotations.length = 0;
      listeners.clear();
    },
  };
}