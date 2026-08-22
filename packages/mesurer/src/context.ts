import { inspectDomElement } from "@jhomra21/mesurer-solid-dom";

export type MesurerContextRequest =
  | { scope?: "workspace" }
  | { scope: "selection" }
  | { annotation: string };

export type MesurerContextRect = { left: number; top: number; width: number; height: number };
export type MesurerContextEdges = { top: number; right: number; bottom: number; left: number };
export type MesurerElementFingerprint = {
  tag: string;
  id: string | null;
  testId: string | null;
  role: string | null;
  ariaLabel: string | null;
  classes: string[];
  text: string | null;
};
export type MesurerElementInspection = {
  selector: string;
  tag: string;
  id: string | null;
  classes: string[];
  text: string;
  role: string | null;
  ariaLabel: string | null;
  rect: MesurerContextRect & { right: number; bottom: number; x: number; y: number };
  margin: MesurerContextEdges;
  padding: MesurerContextEdges;
  border: MesurerContextEdges;
  typography: {
    fontFamily: string; fontSize: string; fontWeight: string; lineHeight: string;
    letterSpacing: string; textAlign: string; color: string;
  };
  appearance: {
    backgroundColor: string; borderColor: string; borderRadius: string; boxShadow: string; opacity: string;
  };
  layout: {
    display: string; position: string; zIndex: string; overflowX: string; overflowY: string;
    flexDirection: string; alignItems: string; justifyContent: string; gap: string;
    gridTemplateColumns: string; gridTemplateRows: string; transform: string;
  };
  scroll: {
    clientWidth: number; clientHeight: number; scrollWidth: number; scrollHeight: number;
    overflowsX: boolean; overflowsY: boolean;
  };
};

export type MesurerAnnotationTarget = {
  id: string;
  selector: string;
  fingerprint: MesurerElementFingerprint;
  lastRect: MesurerContextRect;
};
export type MesurerAnnotationBaseline = {
  targets: Array<{ id: string; selector: string; rect: MesurerContextRect }>;
  guides: Array<{ id: string; orientation: "vertical" | "horizontal"; position: number }>;
  measurements: Array<{ id: string; rect: MesurerContextRect; deltaX: number; deltaY: number; snapped?: boolean }>;
  distances: Array<{
    id: string;
    rectA: MesurerContextRect;
    rectB: MesurerContextRect;
    horizontal: { x1: number; x2: number; y: number; value: number } | null;
    vertical: { y1: number; y2: number; x: number; value: number } | null;
  }>;
};
export type MesurerAnnotation = {
  id: string;
  note: string;
  createdAt: number;
  anchor:
    | { kind: "elements"; targets: MesurerAnnotationTarget[]; region: MesurerContextRect | null }
    | { kind: "region"; rect: MesurerContextRect };
  baseline: MesurerAnnotationBaseline;
};

export type MesurerContextTarget = { ref: string; inspection: MesurerElementInspection };
export type MesurerContextGuide = { id: string; orientation: "vertical" | "horizontal"; position: number };
export type MesurerContextMeasurement = {
  id: string; rect: MesurerContextRect; deltaX: number; deltaY: number; snapped?: boolean; targetRef?: string;
};
export type MesurerContextDistance = {
  id: string; rectA: MesurerContextRect; rectB: MesurerContextRect;
  horizontal: { x1: number; x2: number; y: number; value: number } | null;
  vertical: { y1: number; y2: number; x: number; value: number } | null;
  targetARef?: string; targetBRef?: string;
};

export type MesurerContextV1 = {
  schema: "mesurer.context/v1";
  id: string;
  createdAt: string;
  scope:
    | { kind: "workspace" }
    | { kind: "selection" }
    | { kind: "annotation"; annotationId: string; note: string; targetStatus: "connected" | "partial" | "stale" };
  page: { url: string; title: string };
  viewport: { width: number; height: number; devicePixelRatio: number; scrollX: number; scrollY: number };
  coordinateSpace: "viewport-css-px";
  /** Requested/annotated viewport regions. Empty for whole-workspace context. */
  regions: MesurerContextRect[];
  visualState: { rulersVisible: boolean; xrayVisible: boolean };
  targets: MesurerContextTarget[];
  visualContext: { guides: MesurerContextGuide[]; measurements: MesurerContextMeasurement[]; distances: MesurerContextDistance[] };
};

export type MesurerReviewMetricChange = {
  kind: "target-rect" | "guide" | "measurement" | "distance";
  label: string;
  before: number;
  current: number;
  delta: number;
  unit: "px";
};
export type MesurerReviewPresenceChange = {
  kind: "missing";
  evidence: "target" | "guide" | "measurement" | "distance";
  id: string;
  label: string;
};
export type MesurerReviewChange = MesurerReviewMetricChange | MesurerReviewPresenceChange;
export type MesurerReviewV1 = {
  schema: "mesurer.review/v1";
  annotationId: string;
  note: string;
  targetStatus: "connected" | "partial" | "stale";
  baseline: MesurerAnnotationBaseline;
  current: MesurerContextV1;
  changes: MesurerReviewChange[];
};
export type MesurerCapturePlanV1 = {
  schema: "mesurer.capture/v1";
  contextId: string;
  chrome: "hide";
  evidence: "show";
  captures: Array<
    | { id: "viewport"; kind: "viewport" }
    | { id: "focus"; kind: "clip"; rect: MesurerContextRect }
  >;
};
export type MesurerEvidenceImage = {
  id: "viewport" | "focus" | string;
  kind: "viewport" | "focus" | string;
  mimeType: "image/png" | "image/jpeg" | string;
  /** Base64 image bytes without a data URL prefix. */
  data: string;
};
export type MesurerEvidenceProvider = (input: { context: MesurerContextV1; plan: MesurerCapturePlanV1 }) => Promise<MesurerEvidenceImage[]>;
export type MesurerContextDelivery = { context: MesurerContextV1; text: string; images: MesurerEvidenceImage[] };
export type MesurerContextSender = (delivery: MesurerContextDelivery) => Promise<void>;
export type AcpTextContentBlock = { type: "text"; text: string };
export type AcpImageContentBlock = { type: "image"; mimeType: string; data: string };
export type MesurerAcpContentBlock = AcpTextContentBlock | AcpImageContentBlock;

/**
 * Explicit renderer-to-protocol adapter source. The renderer owns live DOM references;
 * this public boundary deliberately describes only the fields that may enter JSON context.
 */
export type MesurerWorkspaceContextSource = {
  snapshot(): {
    rulersVisible: boolean;
    xrayVisible: boolean;
    guideRelevanceTolerance?: number;
    measurements: Array<{ id: string; rect: MesurerContextRect; deltaX: number; deltaY: number; snapped?: boolean; elementRef?: HTMLElement | null }>;
    activeMeasurement: { id: string; rect: MesurerContextRect; deltaX: number; deltaY: number; snapped?: boolean; elementRef?: HTMLElement | null } | null;
    heldDistances: Array<{
      id: string; rectA: MesurerContextRect; rectB: MesurerContextRect;
      elementRefA?: HTMLElement | null; elementRefB?: HTMLElement | null;
      horizontal: { x1: number; x2: number; y: number; value: number } | null;
      vertical: { y1: number; y2: number; x: number; value: number } | null;
    }>;
    guides: Array<{ id: string; orientation: "vertical" | "horizontal"; position: number }>;
  } | null;
  currentSelection(): { elements: HTMLElement[]; region: MesurerContextRect | null };
  annotations(): MesurerAnnotation[];
  annotation(id: string): (MesurerAnnotation & { resolvedTargets: Array<{ target: MesurerAnnotationTarget; element: HTMLElement | null }> }) | null;
  annotationRect(id: string): MesurerContextRect | null;
};

const DEFAULT_GUIDE_RELEVANCE_TOLERANCE = 10;
const rect = (value: MesurerContextRect): MesurerContextRect => ({ left: value.left, top: value.top, width: value.width, height: value.height });
const overlaps = (a: MesurerContextRect, b: MesurerContextRect) =>
  a.left <= b.left + b.width && a.left + a.width >= b.left && a.top <= b.top + b.height && a.top + a.height >= b.top;
const unionRects = (values: MesurerContextRect[]) => {
  if (!values.length) return null;
  const left = Math.min(...values.map((value) => value.left));
  const top = Math.min(...values.map((value) => value.top));
  const right = Math.max(...values.map((value) => value.left + value.width));
  const bottom = Math.max(...values.map((value) => value.top + value.height));
  return { left, top, width: right - left, height: bottom - top };
};
const uniqueElements = (values: Array<HTMLElement | null | undefined>) => {
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];
  for (const value of values) {
    if (!value?.isConnected || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};
const guideTouches = (guide: MesurerContextGuide, regions: MesurerContextRect[], tolerance: number) =>
  regions.some((region) => guide.orientation === "vertical"
    ? guide.position >= region.left - tolerance && guide.position <= region.left + region.width + tolerance
    : guide.position >= region.top - tolerance && guide.position <= region.top + region.height + tolerance);
const randomId = (ownerWindow: Window) => ownerWindow.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function captureMesurerContext(options: {
  runtime: MesurerWorkspaceContextSource;
  ownerDocument: Document;
  ownerWindow: Window;
  request?: MesurerContextRequest;
}): MesurerContextV1 {
  const { runtime, ownerDocument, ownerWindow } = options;
  const request = options.request ?? { scope: "workspace" };
  const snapshot = runtime.snapshot();
  if (!snapshot) throw new Error("Mesurer workspace is not ready yet.");

  let anchorElements: HTMLElement[] = [];
  let anchorRegions: MesurerContextRect[] = [];
  let scope: MesurerContextV1["scope"] = { kind: "workspace" };
  const preferredRefByElement = new Map<HTMLElement, string>();
  if ("annotation" in request) {
    const annotation = runtime.annotation(request.annotation);
    if (!annotation) throw new Error(`Mesurer annotation not found: ${request.annotation}`);
    for (const item of annotation.resolvedTargets) {
      if (item.element?.isConnected) preferredRefByElement.set(item.element, item.target.id);
    }
    anchorElements = uniqueElements(annotation.resolvedTargets.map((item) => item.element));
    const annotationRect = runtime.annotationRect(annotation.id);
    if (annotationRect) anchorRegions = [annotationRect];
    const total = annotation.resolvedTargets.length;
    const resolved = annotation.resolvedTargets.filter((item) => item.element?.isConnected).length;
    const targetStatus = annotation.anchor.kind === "region" ? "connected" as const
      : total === 0 || resolved === 0 ? "stale" as const
        : resolved === total ? "connected" as const : "partial" as const;
    scope = { kind: "annotation", annotationId: annotation.id, note: annotation.note, targetStatus };
  } else if (request.scope === "selection") {
    const selection = runtime.currentSelection();
    anchorElements = uniqueElements(selection.elements);
    if (!anchorElements.length && !selection.region) throw new Error("Mesurer has no current selection.");
    anchorRegions = selection.region ? [selection.region] : anchorElements.map((element) => rect(element.getBoundingClientRect()));
    scope = { kind: "selection" };
  } else {
    anchorElements = uniqueElements([
      ...runtime.currentSelection().elements,
      ...snapshot.measurements.map((measurement) => measurement.elementRef),
      snapshot.activeMeasurement?.elementRef,
      ...snapshot.heldDistances.flatMap((distance) => [distance.elementRefA, distance.elementRefB]),
    ]);
  }

  const regionMatches = (value: MesurerContextRect) => scope.kind === "workspace" || anchorRegions.some((region) => overlaps(value, region));
  const elementMatches = (element: HTMLElement | null | undefined) => scope.kind === "workspace" || Boolean(element && anchorElements.includes(element));
  const measurements = [
    ...snapshot.measurements,
    ...(snapshot.activeMeasurement && !snapshot.measurements.some((item) => item.id === snapshot.activeMeasurement?.id) ? [snapshot.activeMeasurement] : []),
  ].filter((measurement) => elementMatches(measurement.elementRef) || regionMatches(measurement.rect));
  const distances = snapshot.heldDistances.filter((distance) =>
    elementMatches(distance.elementRefA) || elementMatches(distance.elementRefB) || regionMatches(distance.rectA) || regionMatches(distance.rectB));
  const regionsForGuides = scope.kind === "workspace" ? [] : anchorRegions.length ? anchorRegions : anchorElements.map((element) => rect(element.getBoundingClientRect()));
  const guideTolerance = snapshot.guideRelevanceTolerance ?? DEFAULT_GUIDE_RELEVANCE_TOLERANCE;
  const guides = snapshot.guides.filter((guide) => scope.kind === "workspace" || guideTouches(guide, regionsForGuides, guideTolerance));

  const targetElements = uniqueElements([
    ...anchorElements,
    ...measurements.map((measurement) => measurement.elementRef),
    ...distances.flatMap((distance) => [distance.elementRefA, distance.elementRefB]),
  ]);
  const refByElement = new Map<HTMLElement, string>();
  const usedRefs = new Set(preferredRefByElement.values());
  let generatedRef = 1;
  const nextRef = () => {
    let value = `target-${generatedRef++}`;
    while (usedRefs.has(value)) value = `target-${generatedRef++}`;
    usedRefs.add(value);
    return value;
  };
  const targets: MesurerContextTarget[] = targetElements.map((element) => {
    const ref = preferredRefByElement.get(element) ?? nextRef();
    refByElement.set(element, ref);
    return { ref, inspection: inspectDomElement(element) };
  });
  const contextMeasurements = measurements.map((measurement): MesurerContextMeasurement => {
    const value: MesurerContextMeasurement = {
      id: measurement.id,
      rect: rect(measurement.rect),
      deltaX: measurement.deltaX,
      deltaY: measurement.deltaY,
    };
    if (measurement.snapped !== undefined) value.snapped = measurement.snapped;
    const targetRef = measurement.elementRef ? refByElement.get(measurement.elementRef) : undefined;
    if (targetRef) value.targetRef = targetRef;
    return value;
  });
  const contextDistances = distances.map((distance): MesurerContextDistance => {
    const value: MesurerContextDistance = {
      id: distance.id,
      rectA: rect(distance.rectA),
      rectB: rect(distance.rectB),
      horizontal: distance.horizontal ? { ...distance.horizontal } : null,
      vertical: distance.vertical ? { ...distance.vertical } : null,
    };
    const targetARef = distance.elementRefA ? refByElement.get(distance.elementRefA) : undefined;
    const targetBRef = distance.elementRefB ? refByElement.get(distance.elementRefB) : undefined;
    if (targetARef) value.targetARef = targetARef;
    if (targetBRef) value.targetBRef = targetBRef;
    return value;
  });

  return {
    schema: "mesurer.context/v1", id: randomId(ownerWindow), createdAt: new Date().toISOString(), scope,
    page: { url: ownerWindow.location?.href ?? ownerDocument.URL, title: ownerDocument.title },
    viewport: {
      width: ownerWindow.innerWidth, height: ownerWindow.innerHeight, devicePixelRatio: ownerWindow.devicePixelRatio,
      scrollX: ownerWindow.scrollX, scrollY: ownerWindow.scrollY,
    },
    coordinateSpace: "viewport-css-px",
    regions: scope.kind === "workspace" ? [] : anchorRegions.map(rect),
    visualState: { rulersVisible: snapshot.rulersVisible, xrayVisible: snapshot.xrayVisible },
    targets,
    visualContext: {
      guides: guides.map((guide) => ({ ...guide })),
      measurements: contextMeasurements,
      distances: contextDistances,
    },
  };
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const lineRect = (value: MesurerContextRect) => `x=${px(value.left)} y=${px(value.top)} w=${px(value.width)} h=${px(value.height)}`;
export function formatMesurerContext(context: MesurerContextV1): string {
  const lines: string[] = [
    "Mesurer visual context", "", `Page: ${context.page.url}`,
    `Viewport: ${context.viewport.width} × ${context.viewport.height} CSS px; scroll x=${context.viewport.scrollX} y=${context.viewport.scrollY}`,
  ];
  if (context.scope.kind === "annotation") lines.push("", "Annotation", context.scope.note, `Target status: ${context.scope.targetStatus}`);
  else lines.push("", `Scope: ${context.scope.kind}`);
  if (context.regions.length) {
    lines.push("", "Requested regions");
    context.regions.forEach((region, index) => lines.push(`- region-${index + 1}: ${lineRect(region)}`));
  }
  if (context.visualState.rulersVisible || context.visualState.xrayVisible) lines.push("", `Visual state: rulers=${context.visualState.rulersVisible ? "on" : "off"}; x-ray=${context.visualState.xrayVisible ? "on" : "off"}`);
  if (context.targets.length) {
    lines.push("", "Targets");
    for (const target of context.targets) {
      const value = target.inspection;
      lines.push(
        `[${target.ref}] ${value.selector}`, `  rect: ${lineRect(value.rect)}`,
        `  margin: ${px(value.margin.top)} ${px(value.margin.right)} ${px(value.margin.bottom)} ${px(value.margin.left)}`,
        `  padding: ${px(value.padding.top)} ${px(value.padding.right)} ${px(value.padding.bottom)} ${px(value.padding.left)}`,
        `  layout: display=${value.layout.display}; position=${value.layout.position}; gap=${value.layout.gap}`,
        `  typography: ${value.typography.fontSize} / ${value.typography.lineHeight}; weight=${value.typography.fontWeight}; align=${value.typography.textAlign}`,
      );
      if (value.text) lines.push(`  text: ${JSON.stringify(value.text)}`);
    }
  }
  if (context.visualContext.guides.length) {
    lines.push("", "Relevant guides");
    for (const guide of context.visualContext.guides) lines.push(`- ${guide.orientation} ${guide.orientation === "vertical" ? "x" : "y"}=${px(guide.position)}`);
  }
  if (context.visualContext.measurements.length) {
    lines.push("", "Relevant measurements");
    for (const measurement of context.visualContext.measurements) lines.push(`- ${measurement.targetRef ? `${measurement.targetRef}: ` : ""}${lineRect(measurement.rect)}; delta=${px(measurement.deltaX)} × ${px(measurement.deltaY)}`);
  }
  if (context.visualContext.distances.length) {
    lines.push("", "Relevant distances");
    for (const distance of context.visualContext.distances) {
      const refs = [distance.targetARef, distance.targetBRef].filter(Boolean).join(" → ");
      const values = [distance.horizontal ? `horizontal=${px(distance.horizontal.value)}` : null, distance.vertical ? `vertical=${px(distance.vertical.value)}` : null].filter(Boolean).join("; ");
      lines.push(`- ${refs ? `${refs}: ` : ""}${values || "overlapping"}`);
    }
  }
  return lines.join("\n").trimEnd();
}

export function createMesurerCapturePlan(context: MesurerContextV1): MesurerCapturePlanV1 {
  const evidenceRects: MesurerContextRect[] = [
    ...context.regions,
    ...context.targets.map((target) => target.inspection.rect),
    ...context.visualContext.measurements.map((measurement) => measurement.rect),
    ...context.visualContext.distances.flatMap((distance) => [distance.rectA, distance.rectB]),
  ];
  const union = unionRects(evidenceRects);
  const captures: MesurerCapturePlanV1["captures"] = [{ id: "viewport", kind: "viewport" }];
  if (union) {
    const padding = 48;
    const left = Math.max(0, union.left - padding), top = Math.max(0, union.top - padding);
    const right = Math.min(context.viewport.width, union.left + union.width + padding);
    const bottom = Math.min(context.viewport.height, union.top + union.height + padding);
    if (right > left && bottom > top) captures.push({ id: "focus", kind: "clip", rect: { left, top, width: right - left, height: bottom - top } });
  }
  return { schema: "mesurer.capture/v1", contextId: context.id, chrome: "hide", evidence: "show", captures };
}

const addMetricChange = (
  changes: MesurerReviewChange[],
  kind: MesurerReviewMetricChange["kind"],
  label: string,
  before: number,
  current: number,
) => {
  if (!Number.isFinite(before) || !Number.isFinite(current) || Math.abs(before - current) < 0.01) return;
  changes.push({ kind, label, before, current, delta: current - before, unit: "px" });
};
const addMissing = (
  changes: MesurerReviewChange[],
  evidence: MesurerReviewPresenceChange["evidence"],
  id: string,
  label: string,
) => changes.push({ kind: "missing", evidence, id, label });

export function reviewMesurerAnnotation(options: {
  runtime: MesurerWorkspaceContextSource;
  ownerDocument: Document;
  ownerWindow: Window;
  annotationId: string;
}): MesurerReviewV1 {
  const annotation = options.runtime.annotation(options.annotationId);
  if (!annotation) throw new Error(`Mesurer annotation not found: ${options.annotationId}`);
  const current = captureMesurerContext({ runtime: options.runtime, ownerDocument: options.ownerDocument, ownerWindow: options.ownerWindow, request: { annotation: options.annotationId } });
  if (current.scope.kind !== "annotation") throw new Error("Mesurer annotation context invariant failed.");
  const workspace = options.runtime.snapshot();
  if (!workspace) throw new Error("Mesurer workspace is not ready yet.");
  const workspaceMeasurements = [
    ...workspace.measurements,
    ...(workspace.activeMeasurement && !workspace.measurements.some((item) => item.id === workspace.activeMeasurement?.id)
      ? [workspace.activeMeasurement]
      : []),
  ];
  const changes: MesurerReviewChange[] = [];
  for (const baseline of annotation.baseline.targets) {
    const target = current.targets.find((item) => item.ref === baseline.id);
    if (!target) {
      addMissing(changes, "target", baseline.id, baseline.selector);
      continue;
    }
    addMetricChange(changes, "target-rect", `${target.inspection.selector} left`, baseline.rect.left, target.inspection.rect.left);
    addMetricChange(changes, "target-rect", `${target.inspection.selector} top`, baseline.rect.top, target.inspection.rect.top);
    addMetricChange(changes, "target-rect", `${target.inspection.selector} width`, baseline.rect.width, target.inspection.rect.width);
    addMetricChange(changes, "target-rect", `${target.inspection.selector} height`, baseline.rect.height, target.inspection.rect.height);
  }
  for (const baseline of annotation.baseline.guides) {
    const value = current.visualContext.guides.find((guide) => guide.id === baseline.id)
      ?? workspace.guides.find((guide) => guide.id === baseline.id);
    if (!value) {
      addMissing(changes, "guide", baseline.id, `${baseline.orientation} guide ${baseline.id}`);
      continue;
    }
    addMetricChange(changes, "guide", `${baseline.orientation} guide ${baseline.id}`, baseline.position, value.position);
  }
  for (const baseline of annotation.baseline.measurements) {
    const value = current.visualContext.measurements.find((measurement) => measurement.id === baseline.id)
      ?? workspaceMeasurements.find((measurement) => measurement.id === baseline.id);
    if (!value) {
      addMissing(changes, "measurement", baseline.id, baseline.id);
      continue;
    }
    addMetricChange(changes, "measurement", `${baseline.id} width`, baseline.rect.width, value.rect.width);
    addMetricChange(changes, "measurement", `${baseline.id} height`, baseline.rect.height, value.rect.height);
  }
  for (const baseline of annotation.baseline.distances) {
    const value = current.visualContext.distances.find((distance) => distance.id === baseline.id)
      ?? workspace.heldDistances.find((distance) => distance.id === baseline.id);
    if (!value) {
      addMissing(changes, "distance", baseline.id, baseline.id);
      continue;
    }
    if (baseline.horizontal && value.horizontal) addMetricChange(changes, "distance", `${baseline.id} horizontal`, baseline.horizontal.value, value.horizontal.value);
    else if (baseline.horizontal && !value.horizontal) addMissing(changes, "distance", baseline.id, `${baseline.id} horizontal`);
    if (baseline.vertical && value.vertical) addMetricChange(changes, "distance", `${baseline.id} vertical`, baseline.vertical.value, value.vertical.value);
    else if (baseline.vertical && !value.vertical) addMissing(changes, "distance", baseline.id, `${baseline.id} vertical`);
  }
  return { schema: "mesurer.review/v1", annotationId: annotation.id, note: annotation.note, targetStatus: current.scope.targetStatus, baseline: annotation.baseline, current, changes };
}

export function toAcpContentBlocks(context: MesurerContextV1, images: MesurerEvidenceImage[] = []): MesurerAcpContentBlock[] {
  const blocks: MesurerAcpContentBlock[] = [{ type: "text", text: formatMesurerContext(context) }];
  for (const image of images) {
    blocks.push({ type: "text", text: `Mesurer visual evidence: ${image.kind} (${image.id})` });
    blocks.push({ type: "image", mimeType: image.mimeType, data: image.data });
  }
  return blocks;
}

export async function copyTextToClipboard(ownerDocument: Document, ownerWindow: Window, text: string) {
  try {
    if (ownerWindow.navigator.clipboard?.writeText) { await ownerWindow.navigator.clipboard.writeText(text); return; }
  } catch {
    // Fall through for pages where Clipboard API access is unavailable or blocked.
  }
  const textarea = ownerDocument.createElement("textarea");
  textarea.value = text; textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed"; textarea.style.opacity = "0"; textarea.style.pointerEvents = "none";
  ownerDocument.body.append(textarea); textarea.select();
  const copied = ownerDocument.execCommand?.("copy") ?? false;
  textarea.remove();
  if (!copied) throw new Error("Unable to copy Mesurer context to the clipboard.");
}
