import type {
  DistanceOverlay,
  Guide,
  Measurement,
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  Rect,
} from "@jhomra21/mesurer-solid-core";
import {
  cloneMesurerRect,
  createMesurerAnnotationBaseline,
  unionMesurerRects,
} from "@jhomra21/mesurer-solid-core";
import {
  getElementFingerprint,
  getElementSelector,
  getInspectMeasurement,
  getRectFromDom,
  isElementFingerprintCompatible,
  isElementFingerprintRebindable,
} from "@jhomra21/mesurer-solid-dom";
import { GUIDE_SNAP_DISTANCE } from "../core/constants";
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
  guideRelevanceTolerance: number;
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
  select(selectors: string[]): HTMLElement[];
  hoveredElement(): HTMLElement | null;
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

type InlineDisplayState = {
  value: string;
  priority: string;
};

const copyAnnotation = (annotation: MesurerAnnotation): MesurerAnnotation => ({
  ...annotation,
  anchor: annotation.anchor.kind === "elements"
    ? {
        kind: "elements",
        region: annotation.anchor.region ? cloneMesurerRect(annotation.anchor.region) : null,
        targets: annotation.anchor.targets.map((target) => ({
          ...target,
          fingerprint: { ...target.fingerprint, classes: [...target.fingerprint.classes] },
          lastRect: cloneMesurerRect(target.lastRect),
        })),
      }
    : { kind: "region", rect: cloneMesurerRect(annotation.anchor.rect) },
  baseline: {
    targets: annotation.baseline.targets.map((target) => ({
      ...target,
      rect: cloneMesurerRect(target.rect),
    })),
    guides: annotation.baseline.guides.map((guide) => ({ ...guide })),
    measurements: annotation.baseline.measurements.map((measurement) => ({
      ...measurement,
      rect: cloneMesurerRect(measurement.rect),
    })),
    distances: annotation.baseline.distances.map((distance) => ({
      ...distance,
      rectA: cloneMesurerRect(distance.rectA),
      rectB: cloneMesurerRect(distance.rectB),
      horizontal: distance.horizontal ? { ...distance.horizontal } : null,
      vertical: distance.vertical ? { ...distance.vertical } : null,
    })),
  },
});

const randomId = (ownerWindow: Window, prefix: string) => {
  const value = ownerWindow.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

export function createMesurerWorkspaceRuntime(options: {
  model: MeasurerModel;
  ownerDocument: Document;
  ownerWindow: Window;
  uiRoot?: ParentNode;
  pageTarget?: HTMLElement | ShadowRoot;
}): MesurerWorkspaceRuntime {
  const { model, ownerDocument, ownerWindow, uiRoot } = options;
  // SAFETY: ownerWindow is the browsing-context global for ownerDocument, so it carries that realm's DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;
  const pageTarget = options.pageTarget ?? ownerDocument.body ?? ownerDocument.documentElement;
  const targetTreeRoot = pageTarget instanceof realm.ShadowRoot
    ? pageTarget
    : pageTarget.getRootNode();
  const queryRoot: ParentNode = targetTreeRoot instanceof realm.ShadowRoot
    ? targetTreeRoot
    : ownerDocument;
  const observationRoot: Node = pageTarget;
  const annotations: MesurerAnnotation[] = [];
  const listeners = new Set<() => void>();
  const hidden = new Map<HTMLElement, InlineDisplayState>();
  const liveTargets = new Map<string, HTMLElement>();
  const targetResolution = new Map<string, boolean>();
  let disposed = false;
  let mutationFrame = 0;
  let observer: MutationObserver | null = null;
  let watching = false;

  const targetKey = (annotationId: string, targetId: string) => `${annotationId}:${targetId}`;
  const isInPageTarget = (element: HTMLElement) =>
    pageTarget === element || pageTarget.contains(element);

  const queryCandidates = (selector: string): HTMLElement[] => {
    const matches: HTMLElement[] = [];
    if (pageTarget instanceof realm.HTMLElement && pageTarget.matches(selector)) {
      matches.push(pageTarget);
    }
    for (const candidate of queryRoot.querySelectorAll(selector)) {
      if (candidate instanceof realm.HTMLElement && isInPageTarget(candidate)) {
        matches.push(candidate);
      }
    }
    return matches;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const uniqueRebindCandidate = (target: MesurerAnnotationTarget) => {
    if (!isElementFingerprintRebindable(target.fingerprint)) return null;

    let selectorMatches: HTMLElement[] = [];
    try {
      selectorMatches = queryCandidates(target.selector)
        .filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
    } catch {
      return null;
    }
    if (selectorMatches.length !== 1) return null;

    if (!target.fingerprint.id && !target.fingerprint.testId) {
      let fingerprintMatches: HTMLElement[] = [];
      try {
        fingerprintMatches = queryCandidates(target.fingerprint.tag)
          .filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
      } catch {
        return null;
      }
      if (fingerprintMatches.length !== 1 || fingerprintMatches[0] !== selectorMatches[0]) {
        return null;
      }
    }

    return selectorMatches[0] ?? null;
  };

  const resolveTarget = (annotationId: string, target: MesurerAnnotationTarget) => {
    const key = targetKey(annotationId, target.id);
    const live = liveTargets.get(key);
    if (live?.isConnected && isInPageTarget(live)) return live;
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
    observer.observe(observationRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id", "class", "data-testid", "role", "aria-label", "style"],
    });
    ownerWindow.addEventListener("resize", scheduleRefresh);
    ownerWindow.addEventListener("scroll", scheduleRefresh, true);
    pageTarget.addEventListener("scroll", scheduleRefresh, true);
  };

  const stopWatching = () => {
    if (!watching) return;
    watching = false;
    observer?.disconnect();
    observer = null;
    ownerWindow.removeEventListener("resize", scheduleRefresh);
    ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
    pageTarget.removeEventListener("scroll", scheduleRefresh, true);
    if (mutationFrame) ownerWindow.cancelAnimationFrame(mutationFrame);
    mutationFrame = 0;
  };

  const modelUnsubscribe = model.subscribe(notify);

  const currentEvidenceWorkspace = () => ({
    guides: model.current.guides,
    measurements: model.current.measurements,
    activeMeasurement: model.current.activeMeasurement,
    distances: model.current.heldDistances,
  });

  const baseline = (options: {
    targets: MesurerAnnotationTarget[];
    elements?: HTMLElement[];
    region?: Rect | null;
  }): MesurerAnnotationBaseline => createMesurerAnnotationBaseline({
    ...options,
    workspace: currentEvidenceWorkspace(),
    guideTolerance: GUIDE_SNAP_DISTANCE,
  });

  const makeTarget = (element: HTMLElement, index: number): MesurerAnnotationTarget => ({
    id: `target-${index + 1}`,
    selector: getElementSelector(element),
    fingerprint: getElementFingerprint(element),
    lastRect: getRectFromDom(element),
  });

  const select = (selectors: string[]) => {
    const normalized = [...new Set(selectors.map((selector) => selector.trim()).filter(Boolean))];
    if (!normalized.length) throw new Error("Mesurer select() requires at least one selector.");

    const elements = normalized.map((selector) => {
      let matches: HTMLElement[];
      try {
        matches = queryCandidates(selector);
      } catch {
        throw new Error(`Invalid Mesurer selection selector: ${selector}`);
      }
      if (matches.length === 0) {
        throw new Error(`Mesurer selection target not found: ${selector}`);
      }
      if (matches.length > 1) {
        throw new Error(`Mesurer selection target is ambiguous (${matches.length} matches): ${selector}`);
      }
      return matches[0];
    });

    model.checkpoint();
    model.setEnabled(true);
    model.setToolMode("select");
    const measurements = elements.map((element) => getInspectMeasurement<HTMLElement>(element, ownerWindow));
    model.setSelectedMeasurements(measurements, measurements.at(-1) ?? null);
    model.setTransient({ selectionOriginRect: null });
    return elements;
  };

  const pushAnnotation = (annotation: MesurerAnnotation, elements: HTMLElement[] = []) => {
    annotations.push(annotation);
    if (annotation.anchor.kind === "elements") {
      annotation.anchor.targets.forEach((target, index) => {
        const element = elements[index];
        const key = targetKey(annotation.id, target.id);
        if (element && isInPageTarget(element)) liveTargets.set(key, element);
        targetResolution.set(key, Boolean(element && isInPageTarget(element)));
      });
    }
    startWatching();
    notify();
    return copyAnnotation(annotation);
  };

  const addRegionAnnotation = (note: string, value: Rect) => {
    const text = note.trim();
    if (!text) throw new Error("Annotation note cannot be empty.");
    const region = cloneMesurerRect(value);
    return pushAnnotation({
      id: randomId(ownerWindow, "annotation"),
      note: text,
      createdAt: Date.now(),
      anchor: { kind: "region", rect: region },
      baseline: baseline({ targets: [], region }),
    });
  };

  const addSelectionAnnotation = (note: string) => {
    const value = note.trim();
    if (!value) throw new Error("Annotation note cannot be empty.");
    const elements = selectedElements(model).filter(isInPageTarget);
    const region = model.current.selectionOriginRect
      ? cloneMesurerRect(model.current.selectionOriginRect)
      : null;
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
      baseline: baseline({ targets, elements }),
    }, elements);
  };

  const restoreCapturePresentation = () => {
    for (const [element, display] of hidden) {
      if (display.value || display.priority) {
        element.style.setProperty("display", display.value, display.priority);
      } else {
        element.style.removeProperty("display");
      }
    }
    hidden.clear();
  };

  return {
    snapshot() {
      return {
        enabled: model.current.enabled,
        rulersVisible: model.current.rulersVisible,
        xrayVisible: model.current.xrayVisible,
        guideRelevanceTolerance: GUIDE_SNAP_DISTANCE,
        selectedMeasurements: [...model.current.selectedMeasurements],
        selectionOriginRect: model.current.selectionOriginRect
          ? cloneMesurerRect(model.current.selectionOriginRect)
          : null,
        measurements: [...model.current.measurements],
        activeMeasurement: model.current.activeMeasurement,
        heldDistances: [...model.current.heldDistances],
        guides: model.current.guides.map((guide) => ({ ...guide })),
        annotations: annotations.map(copyAnnotation),
      };
    },
    currentSelection() {
      return {
        elements: selectedElements(model).filter(isInPageTarget),
        region: model.current.selectionOriginRect
          ? cloneMesurerRect(model.current.selectionOriginRect)
          : null,
      };
    },
    select,
    hoveredElement() {
      return model.current.hoverElement?.isConnected && isInPageTarget(model.current.hoverElement)
        ? model.current.hoverElement
        : null;
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
      let resolvedTargets: MesurerResolvedAnnotation["resolvedTargets"] = [];
      if (copy.anchor.kind === "elements" && annotation.anchor.kind === "elements") {
        const sourceTargets = annotation.anchor.targets;
        resolvedTargets = copy.anchor.targets.map((target, index) => ({
          target,
          element: resolveTarget(annotation.id, sourceTargets[index]),
        }));
      }
      return { ...copy, resolvedTargets };
    },
    annotationRect(id) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return null;
      if (annotation.anchor.kind === "region") return cloneMesurerRect(annotation.anchor.rect);
      const rects = annotation.anchor.targets
        .map((target) => resolveTarget(annotation.id, target)?.getBoundingClientRect())
        .filter((value): value is DOMRect => value !== undefined);
      if (!rects.length) {
        const fallback = unionMesurerRects(annotation.anchor.targets.map((target) => target.lastRect));
        return fallback ? cloneMesurerRect(fallback) : null;
      }
      return unionMesurerRects(rects.map((value) => ({
        left: value.left,
        top: value.top,
        width: value.width,
        height: value.height,
      })));
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
        hidden.set(element, {
          value: element.style.getPropertyValue("display"),
          priority: element.style.getPropertyPriority("display"),
        });
        element.style.setProperty("display", "none", "important");
      }
    },
    finishCapture() {
      restoreCapturePresentation();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopWatching();
      modelUnsubscribe();
      restoreCapturePresentation();
      liveTargets.clear();
      targetResolution.clear();
      annotations.length = 0;
      listeners.clear();
    },
  };
}