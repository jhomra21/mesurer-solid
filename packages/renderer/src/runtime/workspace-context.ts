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
  isElementWithinDomTarget,
} from "@jhomra21/mesurer-solid-dom";
import { GUIDE_SNAP_DISTANCE } from "../core/constants";
import type { MesurerModel } from "../model/create-mesurer-model";
import { getMesurerPageKey, subscribeMesurerPageKey } from "./page-location";

export type {
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerContextRequest,
} from "@jhomra21/mesurer-solid-core";

export type MesurerResolvedAnnotation = MesurerAnnotation & {
  resolvedTargets: Array<{ target: MesurerAnnotationTarget; element: Element | null }>;
};

export type MesurerWorkspaceSnapshot = {
  enabled: boolean;
  rulersVisible: boolean;
  xrayVisible: boolean;
  guideRelevanceTolerance: number;
  selectedMeasurements: MesurerModel["current"]["selectedMeasurements"];
  selectionOriginRect: Rect | null;
  measurements: Measurement<Element>[];
  activeMeasurement: Measurement<Element> | null;
  heldDistances: DistanceOverlay<Element>[];
  guides: Guide[];
  annotations: MesurerAnnotation[];
};

export type MesurerWorkspaceRuntime = {
  snapshot(): MesurerWorkspaceSnapshot;
  currentSelection(): { elements: Element[]; region: Rect | null };
  clearSelection(): void;
  selectGestureActive(): boolean;
  select(selectors: string[]): Element[];
  hoveredElement(): Element | null;
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

type StoredWorkspaceAnnotations = {
  version: 1;
  annotations: MesurerAnnotation[];
};

const WORKSPACE_ANNOTATION_STORAGE_VERSION = 1;

const readStoredAnnotations = (
  ownerWindow: Window,
  persistenceKey: string | undefined,
): MesurerAnnotation[] => {
  if (!persistenceKey) return [];

  try {
    const raw = ownerWindow.sessionStorage.getItem(persistenceKey);

    if (!raw) return [];
    // SAFETY: this namespaced sessionStorage entry is written only by persistAnnotations below.
    // Malformed or incompatible values are rejected by the version/array gates or the boundary catch.
    const stored = JSON.parse(raw) as StoredWorkspaceAnnotations;

    if (stored.version !== WORKSPACE_ANNOTATION_STORAGE_VERSION || !Array.isArray(stored.annotations)) return [];

    return stored.annotations.map(copyAnnotation);
  } catch {
    return [];
  }
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

const selectedElements = (model: MesurerModel) => {
  const seen = new Set<Element>();
  const elements: Element[] = [];

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
  model: MesurerModel;
  ownerDocument: Document;
  ownerWindow: Window;
  uiRoot?: ParentNode;
  pageTarget?: HTMLElement | ShadowRoot;
  /** Optional route-neutral session key prefix used to preserve annotations across reloads and page changes. */
  persistenceKey?: string;
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
  let pageKey = getMesurerPageKey(ownerWindow);

  const currentPersistenceKey = () =>
    options.persistenceKey ? `${options.persistenceKey}:${pageKey}` : undefined;

  const legacyPersistenceKey = () =>
    options.persistenceKey ? `${options.persistenceKey}${ownerWindow.location.pathname}` : undefined;

  type PageAnnotationStore = {
    annotations: MesurerAnnotation[];
    migrated: boolean;
  };

  const readPageAnnotations = (): PageAnnotationStore => {
    const currentKey = currentPersistenceKey();

    if (!currentKey) return { annotations: [], migrated: false };

    try {
      if (ownerWindow.sessionStorage.getItem(currentKey) !== null) {
        return { annotations: readStoredAnnotations(ownerWindow, currentKey), migrated: false };
      }
    } catch {
      return { annotations: [], migrated: false };
    }

    const legacyKey = legacyPersistenceKey();

    if (!legacyKey) return { annotations: [], migrated: false };
    const legacy = readStoredAnnotations(ownerWindow, legacyKey);

    return { annotations: legacy, migrated: legacy.length > 0 };
  };

  const initialAnnotations = readPageAnnotations();
  const annotations = initialAnnotations.annotations;
  let shouldMigrateLegacyAnnotations = initialAnnotations.migrated;
  const listeners = new Set<() => void>();
  const hidden = new Map<HTMLElement, InlineDisplayState>();
  const liveTargets = new Map<string, Element>();
  const targetResolution = new Map<string, boolean>();
  let disposed = false;
  let mutationFrame = 0;
  let observer: MutationObserver | null = null;
  let watching = false;

  const targetKey = (annotationId: string, targetId: string) => `${annotationId}:${targetId}`;
  const isInPageTarget = (element: Element) => isElementWithinDomTarget(element, pageTarget);

  const queryCandidates = (selector: string): Element[] => {
    const matches: Element[] = [];

    if (pageTarget instanceof realm.HTMLElement && pageTarget.matches(selector)) {
      matches.push(pageTarget);
    }

    for (const candidate of queryRoot.querySelectorAll(selector)) {
      if (candidate instanceof realm.Element && isInPageTarget(candidate)) {
        matches.push(candidate);
      }
    }

    return matches;
  };

  const persistAnnotations = () => {
    const key = currentPersistenceKey();

    if (!key) return;

    try {
      if (annotations.length === 0) {
        ownerWindow.sessionStorage.removeItem(key);

        return;
      }

      ownerWindow.sessionStorage.setItem(key, JSON.stringify({
        version: WORKSPACE_ANNOTATION_STORAGE_VERSION,
        annotations: annotations.map(copyAnnotation),
      } satisfies StoredWorkspaceAnnotations));
    } catch {
      // Persistence is best-effort. Live annotation state remains authoritative.
    }
  };

  if (shouldMigrateLegacyAnnotations) {
    persistAnnotations();
    shouldMigrateLegacyAnnotations = false;
  }

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const uniqueRebindCandidate = (target: MesurerAnnotationTarget) => {
    if (!isElementFingerprintRebindable(target.fingerprint)) return null;

    let rawSelectorMatches: Element[] = [];

    try {
      rawSelectorMatches = queryCandidates(target.selector);
    } catch {
      return null;
    }

    const selectorMatches = rawSelectorMatches
      .filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));

    if (rawSelectorMatches.length === 1 && selectorMatches.length === 1) {
      return selectorMatches[0] ?? null;
    }

    // Framework-owned class names, labels, or text may legitimately change across
    // a reload even when the structural selector still resolves to the same page
    // target. Accept that fallback only when the selector is unique, the tag is
    // unchanged, and the rendered box is still effectively the saved box.
    if (rawSelectorMatches.length !== 1 || target.fingerprint.id || target.fingerprint.testId) {
      return null;
    }

    const candidate = rawSelectorMatches[0];

    if (!candidate || candidate.localName !== target.fingerprint.tag) return null;

    const currentRect = getRectFromDom(candidate);
    const savedRect = target.lastRect;
    const positionTolerance = Math.max(4, Math.max(savedRect.width, savedRect.height) * 0.05);
    const sizeTolerance = Math.max(2, Math.max(savedRect.width, savedRect.height) * 0.03);

    const sameGeometry =
      Math.abs(currentRect.left - savedRect.left) <= positionTolerance
      && Math.abs(currentRect.top - savedRect.top) <= positionTolerance
      && Math.abs(currentRect.width - savedRect.width) <= sizeTolerance
      && Math.abs(currentRect.height - savedRect.height) <= sizeTolerance;

    return sameGeometry ? candidate : null;
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

    if (changed) {
      persistAnnotations();
      notify();
    }
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

  if (annotations.length > 0) {
    refreshAnnotations();
    startWatching();
  }

  const unsubscribePageKey = subscribeMesurerPageKey(ownerWindow, (nextPageKey) => {
    if (nextPageKey === pageKey || disposed) return;
    persistAnnotations();
    stopWatching();
    liveTargets.clear();
    targetResolution.clear();
    pageKey = nextPageKey;
    annotations.length = 0;
    const stored = readPageAnnotations();
    annotations.push(...stored.annotations);

    if (stored.migrated) persistAnnotations();

    if (annotations.length > 0) {
      refreshAnnotations();
      startWatching();
    }

    notify();
  });

  const modelUnsubscribe = model.subscribe(notify);

  const currentEvidenceWorkspace = () => ({
    guides: model.current.guides,
    measurements: model.current.measurements,
    activeMeasurement: model.current.activeMeasurement,
    distances: model.current.heldDistances,
  });

  const baseline = (options: {
    targets: MesurerAnnotationTarget[];
    elements?: Element[];
    region?: Rect | null;
  }): MesurerAnnotationBaseline => createMesurerAnnotationBaseline({
    ...options,
    workspace: currentEvidenceWorkspace(),
    guideTolerance: GUIDE_SNAP_DISTANCE,
  });

  const makeTarget = (element: Element, index: number): MesurerAnnotationTarget => ({
    id: `target-${index + 1}`,
    selector: getElementSelector(element),
    fingerprint: getElementFingerprint(element),
    lastRect: getRectFromDom(element),
  });

  const select = (selectors: string[]) => {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const selector of selectors) {
      const value = selector.trim();

      if (!value || seen.has(value)) continue;
      seen.add(value);
      normalized.push(value);
    }

    if (!normalized.length) throw new Error("Mesurer select() requires at least one selector.");

    const elements = normalized.map((selector) => {
      let matches: Element[];

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
    const measurements = elements.map((element) => getInspectMeasurement<Element>(element, ownerWindow));
    model.setSelectedMeasurements(measurements, measurements.at(-1) ?? null);
    model.setTransient({ selectionOriginRect: null });

    return elements;
  };

  const pushAnnotation = (annotation: MesurerAnnotation, elements: Element[] = []) => {
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
    persistAnnotations();
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
    clearSelection() {
      model.checkpoint();
      model.setSelectedMeasurements([], null);
      model.setSelectedGuideIds([]);
      model.setHoverTarget(null, null);
      model.setTransient({
        start: null,
        end: null,
        isDragging: false,
        selectionOriginRect: null,
      });
    },
    selectGestureActive() {
      return model.current.toolMode === "select" && model.current.start !== null;
    },
    select,
    hoveredElement() {
      return model.current.hoverElement?.isConnected && isInPageTarget(model.current.hoverElement)
        ? model.current.hoverElement
        : null;
    },
    annotations() {
      return annotations.map(copyAnnotation);
    },
    annotation(id) {
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
      persistAnnotations();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    prepareCapture() {
      const selector = [
        "[data-mesurer-layer='chrome']",
        "[data-mesurer-toolbar='true']",
        "[data-mesurer-extension-toolbar='true']",
        "[data-mesurer-inspector-ui='true']:not([data-mesurer-layer='evidence'])",
        ".mesurer-color-picker",
      ].join(",");

      // Isolated public mounts can safely Portal selected measurement chrome
      // into the document layer so Solid keeps ownership while CSS Anchor
      // Positioning follows page scroll. Capture cleanup therefore has two UI
      // roots: the isolated renderer tree and document-level portaled chrome.
      // Hide both without moving either tree; finishCapture restores the exact
      // previous inline display state.
      const captureRoots = new Set<ParentNode>();

      if (uiRoot) captureRoots.add(uiRoot);
      captureRoots.add(ownerDocument);

      for (const captureRoot of captureRoots) {
        for (const element of captureRoot.querySelectorAll<HTMLElement>(selector)) {
          if (hidden.has(element)) continue;
          hidden.set(element, {
            value: element.style.getPropertyValue("display"),
            priority: element.style.getPropertyPriority("display"),
          });
          element.style.setProperty("display", "none", "important");
        }
      }
    },
    finishCapture() {
      restoreCapturePresentation();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopWatching();
      unsubscribePageKey();
      modelUnsubscribe();
      restoreCapturePresentation();
      liveTargets.clear();
      targetResolution.clear();
      annotations.length = 0;
      listeners.clear();
    },
  };
}
