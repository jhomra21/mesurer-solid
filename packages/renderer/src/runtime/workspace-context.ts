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
  /** Bind the model created by the immediately preceding renderer mount. */
  bindCurrentModel(): void;
  snapshot(): MesurerWorkspaceSnapshot | null;
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

type RuntimeStore = { annotations: MesurerAnnotation[]; listeners: Set<() => void> };
const STORE = Symbol.for("mesurer.workspace-context.v1");
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

const getStore = (ownerWindow: Window): RuntimeStore => {
  const record = ownerWindow as unknown as Record<PropertyKey, unknown>;
  const existing = record[STORE] as RuntimeStore | undefined;
  if (existing) return existing;
  const created: RuntimeStore = { annotations: [], listeners: new Set() };
  record[STORE] = created;
  return created;
};

const selectedElements = (model: MeasurerModel | null) => {
  if (!model) return [];
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

const stripMeasurement = (measurement: Measurement<HTMLElement>) => ({
  id: measurement.id,
  rect: cloneRect(measurement.rect),
  deltaX: measurement.deltaX,
  deltaY: measurement.deltaY,
  ...(measurement.snapped === undefined ? {} : { snapped: measurement.snapped }),
});
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
  const store = getStore(ownerWindow);
  let disposed = false;
  let mutationFrame = 0;
  let boundModel: MeasurerModel | null = null;
  let modelUnsubscribe: (() => void) | null = null;
  const hidden = new Map<HTMLElement, string>();

  const model = () => boundModel;
  const notify = () => { for (const listener of store.listeners) listener(); };
  const bindCurrentModel = () => {
    if (disposed) return;
    const current = getLatestMeasurerModel();
    if (!current) throw new Error("Mesurer renderer model was not created during mount.");
    modelUnsubscribe?.();
    boundModel = current;
    modelUnsubscribe = current.subscribe(() => notify());
    notify();
  };

  const resolveTarget = (target: MesurerAnnotationTarget) => {
    let candidates: Element[] = [];
    try { candidates = [...ownerDocument.querySelectorAll(target.selector)]; } catch { candidates = []; }
    const compatible = candidates.filter((candidate) => isElementFingerprintCompatible(candidate, target.fingerprint));
    if (compatible.length !== 1) return null;
    const element = compatible[0];
    const HTMLElementCtor = (ownerWindow as Window & typeof globalThis).HTMLElement;
    return element instanceof HTMLElementCtor ? element : null;
  };
  const refreshAnnotations = () => {
    let changed = false;
    for (const annotation of store.annotations) {
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
    mutationFrame = ownerWindow.requestAnimationFrame(() => { mutationFrame = 0; refreshAnnotations(); });
  };
  const MutationObserverCtor = (ownerWindow as Window & typeof globalThis).MutationObserver;
  const observer = new MutationObserverCtor(scheduleRefresh);
  if (ownerDocument.documentElement) observer.observe(ownerDocument.documentElement, { childList: true, subtree: true, attributes: true });
  ownerWindow.addEventListener("resize", scheduleRefresh);
  ownerWindow.addEventListener("scroll", scheduleRefresh, true);

  const baseline = (targets: MesurerAnnotationTarget[]): MesurerAnnotationBaseline => {
    const current = model();
    const measurements = current
      ? [
          ...current.current.measurements,
          ...(current.current.activeMeasurement && !current.current.measurements.some((item) => item.id === current.current.activeMeasurement?.id)
            ? [current.current.activeMeasurement]
            : []),
        ]
      : [];
    return {
      targets: targets.map((target) => ({ id: target.id, selector: target.selector, rect: cloneRect(target.lastRect) })),
      guides: current?.current.guides.map((guide) => ({ ...guide })) ?? [],
      measurements: measurements.map(stripMeasurement),
      distances: current?.current.heldDistances.map(stripDistance) ?? [],
    };
  };
  const makeTarget = (element: HTMLElement, index: number): MesurerAnnotationTarget => ({
    id: `target-${index + 1}`,
    selector: getElementSelector(element),
    fingerprint: getElementFingerprint(element),
    lastRect: getRectFromDom(element),
  });
  const pushAnnotation = (annotation: MesurerAnnotation) => {
    store.annotations = [...store.annotations, annotation];
    notify();
    return copyAnnotation(annotation);
  };

  return {
    bindCurrentModel,
    snapshot() {
      const current = model();
      if (!current) return null;
      return {
        enabled: current.current.enabled,
        rulersVisible: current.current.rulersVisible,
        xrayVisible: current.current.xrayVisible,
        selectedMeasurements: [...current.current.selectedMeasurements],
        selectionOriginRect: current.current.selectionOriginRect ? cloneRect(current.current.selectionOriginRect) : null,
        measurements: [...current.current.measurements],
        activeMeasurement: current.current.activeMeasurement,
        heldDistances: [...current.current.heldDistances],
        guides: current.current.guides.map((guide) => ({ ...guide })),
        annotations: store.annotations.map(copyAnnotation),
      };
    },
    currentSelection() {
      const current = model();
      return { elements: selectedElements(current), region: current?.current.selectionOriginRect ? cloneRect(current.current.selectionOriginRect) : null };
    },
    annotations() { refreshAnnotations(); return store.annotations.map(copyAnnotation); },
    annotation(id) {
      refreshAnnotations();
      const annotation = store.annotations.find((item) => item.id === id);
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
      const annotation = store.annotations.find((item) => item.id === id);
      if (!annotation) return null;
      if (annotation.anchor.kind === "region") return cloneRect(annotation.anchor.rect);
      const rects = annotation.anchor.targets.map((target) => resolveTarget(target)?.getBoundingClientRect()).filter(Boolean) as DOMRect[];
      if (!rects.length) return annotation.anchor.targets[0]?.lastRect ? cloneRect(annotation.anchor.targets[0].lastRect) : null;
      const left = Math.min(...rects.map((value) => value.left));
      const top = Math.min(...rects.map((value) => value.top));
      const right = Math.max(...rects.map((value) => value.right));
      const bottom = Math.max(...rects.map((value) => value.bottom));
      return { left, top, width: right - left, height: bottom - top };
    },
    addSelectionAnnotation(note) {
      const value = note.trim();
      if (!value) throw new Error("Annotation note cannot be empty.");
      const current = model();
      const elements = selectedElements(current);
      if (!elements.length) throw new Error("Select at least one page element before adding an annotation.");
      const targets = elements.map(makeTarget);
      return pushAnnotation({
        id: randomId(ownerWindow, "annotation"), note: value, createdAt: Date.now(),
        anchor: { kind: "elements", targets, region: current?.current.selectionOriginRect ? cloneRect(current.current.selectionOriginRect) : null },
        baseline: baseline(targets),
      });
    },
    addRegionAnnotation(note, value) {
      const text = note.trim();
      if (!text) throw new Error("Annotation note cannot be empty.");
      return pushAnnotation({
        id: randomId(ownerWindow, "annotation"), note: text, createdAt: Date.now(),
        anchor: { kind: "region", rect: cloneRect(value) }, baseline: baseline([]),
      });
    },
    removeAnnotation(id) {
      const next = store.annotations.filter((annotation) => annotation.id !== id);
      if (next.length === store.annotations.length) return;
      store.annotations = next; notify();
    },
    subscribe(listener) { store.listeners.add(listener); return () => store.listeners.delete(listener); },
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
      for (const [element, display] of hidden) { if (display) element.style.display = display; else element.style.removeProperty("display"); }
      hidden.clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mutationFrame) ownerWindow.cancelAnimationFrame(mutationFrame);
      modelUnsubscribe?.();
      boundModel = null;
      observer.disconnect();
      ownerWindow.removeEventListener("resize", scheduleRefresh);
      ownerWindow.removeEventListener("scroll", scheduleRefresh, true);
      for (const [element, display] of hidden) { if (display) element.style.display = display; else element.style.removeProperty("display"); }
      hidden.clear();
    },
  };
}
