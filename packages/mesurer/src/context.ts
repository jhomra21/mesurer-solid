import { inspectDomElement, type DomElementInspection } from "@jhomra21/mesurer-solid-dom";
import type {
  MesurerAnnotationBaseline,
  MesurerContextRequest,
  MesurerWorkspaceRuntime,
} from "@jhomra21/mesurer-solid-renderer";

export type MesurerContextTarget = {
  ref: string;
  inspection: DomElementInspection;
};

export type MesurerContextGuide = {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
};

export type MesurerContextMeasurement = {
  id: string;
  rect: { left: number; top: number; width: number; height: number };
  deltaX: number;
  deltaY: number;
  snapped?: boolean;
  targetRef?: string;
};

export type MesurerContextDistance = {
  id: string;
  rectA: { left: number; top: number; width: number; height: number };
  rectB: { left: number; top: number; width: number; height: number };
  horizontal: { x1: number; x2: number; y: number; value: number } | null;
  vertical: { y1: number; y2: number; x: number; value: number } | null;
  targetARef?: string;
  targetBRef?: string;
};

export type MesurerContextV1 = {
  schema: "mesurer.context/v1";
  id: string;
  createdAt: string;
  scope:
    | { kind: "workspace" }
    | { kind: "selection" }
    | {
        kind: "annotation";
        annotationId: string;
        note: string;
        targetStatus: "connected" | "partial" | "stale";
      };
  page: {
    url: string;
    title: string;
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
  };
  coordinateSpace: "viewport-css-px";
  visualState: {
    rulersVisible: boolean;
    xrayVisible: boolean;
  };
  targets: MesurerContextTarget[];
  visualContext: {
    guides: MesurerContextGuide[];
    measurements: MesurerContextMeasurement[];
    distances: MesurerContextDistance[];
  };
};

export type MesurerReviewChange = {
  kind: "target-rect" | "guide" | "measurement" | "distance";
  label: string;
  before: number;
  current: number;
  delta: number;
  unit: "px";
};

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
    | {
        id: "focus";
        kind: "clip";
        rect: { left: number; top: number; width: number; height: number };
      }
  >;
};

export type MesurerEvidenceImage = {
  id: "viewport" | "focus" | string;
  kind: "viewport" | "focus" | string;
  mimeType: "image/png" | "image/jpeg" | string;
  /** Base64 image bytes without a data URL prefix. */
  data: string;
};

export type MesurerEvidenceProvider = (input: {
  context: MesurerContextV1;
  plan: MesurerCapturePlanV1;
}) => Promise<MesurerEvidenceImage[]>;

export type MesurerContextDelivery = {
  context: MesurerContextV1;
  text: string;
  images: MesurerEvidenceImage[];
};

export type MesurerContextSender = (delivery: MesurerContextDelivery) => Promise<void>;

export type AcpTextContentBlock = { type: "text"; text: string };
export type AcpImageContentBlock = { type: "image"; mimeType: string; data: string };
export type MesurerAcpContentBlock = AcpTextContentBlock | AcpImageContentBlock;

const rect = (value: { left: number; top: number; width: number; height: number }) => ({ ...value });
const overlaps = (a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }) =>
  a.left <= b.left + b.width && a.left + a.width >= b.left &&
  a.top <= b.top + b.height && a.top + a.height >= b.top;

const unionRects = (values: Array<{ left: number; top: number; width: number; height: number }>) => {
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

const guideTouches = (
  guide: MesurerContextGuide,
  regions: Array<{ left: number; top: number; width: number; height: number }>,
  tolerance = 4,
) => regions.some((region) => guide.orientation === "vertical"
  ? guide.position >= region.left - tolerance && guide.position <= region.left + region.width + tolerance
  : guide.position >= region.top - tolerance && guide.position <= region.top + region.height + tolerance);

const randomId = (ownerWindow: Window) =>
  ownerWindow.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function captureMesurerContext(options: {
  runtime: MesurerWorkspaceRuntime;
  ownerDocument: Document;
  ownerWindow: Window;
  request?: MesurerContextRequest;
}): MesurerContextV1 {
  const { runtime, ownerDocument, ownerWindow } = options;
  const request = options.request ?? { scope: "workspace" };
  const snapshot = runtime.snapshot();
  if (!snapshot) throw new Error("Mesurer workspace is not ready yet.");

  let anchorElements: HTMLElement[] = [];
  let anchorRegions: Array<{ left: number; top: number; width: number; height: number }> = [];
  let scope: MesurerContextV1["scope"] = { kind: "workspace" };

  if ("annotation" in request) {
    const annotation = runtime.annotation(request.annotation);
    if (!annotation) throw new Error(`Mesurer annotation not found: ${request.annotation}`);
    anchorElements = uniqueElements(annotation.resolvedTargets.map((item) => item.element));
    const annotationRect = runtime.annotationRect(annotation.id);
    if (annotationRect) anchorRegions = [annotationRect];
    const total = annotation.resolvedTargets.length;
    const resolved = anchorElements.length;
    scope = {
      kind: "annotation",
      annotationId: annotation.id,
      note: annotation.note,
      targetStatus: total === 0 || resolved === 0 ? "stale" : resolved === total ? "connected" : "partial",
    };
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
    anchorRegions = [];
  }

  const regionMatches = (value: { left: number; top: number; width: number; height: number }) =>
    scope.kind === "workspace" || anchorRegions.some((region) => overlaps(value, region));
  const elementMatches = (element: HTMLElement | null | undefined) =>
    scope.kind === "workspace" || Boolean(element && anchorElements.includes(element));

  const measurements = [
    ...snapshot.measurements,
    ...(snapshot.activeMeasurement && !snapshot.measurements.some((item) => item.id === snapshot.activeMeasurement?.id)
      ? [snapshot.activeMeasurement]
      : []),
  ].filter((measurement) => elementMatches(measurement.elementRef) || regionMatches(measurement.rect));

  const distances = snapshot.heldDistances.filter((distance) =>
    elementMatches(distance.elementRefA) || elementMatches(distance.elementRefB) ||
    regionMatches(distance.rectA) || regionMatches(distance.rectB));

  const regionsForGuides = scope.kind === "workspace"
    ? []
    : anchorRegions.length
      ? anchorRegions
      : anchorElements.map((element) => rect(element.getBoundingClientRect()));
  const guides = snapshot.guides.filter((guide) => scope.kind === "workspace" || guideTouches(guide, regionsForGuides));

  const targetElements = uniqueElements([
    ...anchorElements,
    ...measurements.map((measurement) => measurement.elementRef),
    ...distances.flatMap((distance) => [distance.elementRefA, distance.elementRefB]),
  ]);
  const refByElement = new Map<HTMLElement, string>();
  const targets = targetElements.map((element, index) => {
    const ref = `target-${index + 1}`;
    refByElement.set(element, ref);
    return { ref, inspection: inspectDomElement(element) };
  });

  return {
    schema: "mesurer.context/v1",
    id: randomId(ownerWindow),
    createdAt: new Date().toISOString(),
    scope,
    page: {
      url: ownerWindow.location?.href ?? ownerDocument.URL,
      title: ownerDocument.title,
    },
    viewport: {
      width: ownerWindow.innerWidth,
      height: ownerWindow.innerHeight,
      devicePixelRatio: ownerWindow.devicePixelRatio,
      scrollX: ownerWindow.scrollX,
      scrollY: ownerWindow.scrollY,
    },
    coordinateSpace: "viewport-css-px",
    visualState: {
      rulersVisible: snapshot.rulersVisible,
      xrayVisible: snapshot.xrayVisible,
    },
    targets,
    visualContext: {
      guides: guides.map((guide) => ({ ...guide })),
      measurements: measurements.map((measurement) => ({
        id: measurement.id,
        rect: rect(measurement.rect),
        deltaX: measurement.deltaX,
        deltaY: measurement.deltaY,
        ...(measurement.snapped === undefined ? {} : { snapped: measurement.snapped }),
        ...(measurement.elementRef && refByElement.has(measurement.elementRef)
          ? { targetRef: refByElement.get(measurement.elementRef)! }
          : {}),
      })),
      distances: distances.map((distance) => ({
        id: distance.id,
        rectA: rect(distance.rectA),
        rectB: rect(distance.rectB),
        horizontal: distance.horizontal ? { ...distance.horizontal } : null,
        vertical: distance.vertical ? { ...distance.vertical } : null,
        ...(distance.elementRefA && refByElement.has(distance.elementRefA)
          ? { targetARef: refByElement.get(distance.elementRefA)! }
          : {}),
        ...(distance.elementRefB && refByElement.has(distance.elementRefB)
          ? { targetBRef: refByElement.get(distance.elementRefB)! }
          : {}),
      })),
    },
  };
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const lineRect = (value: { left: number; top: number; width: number; height: number }) =>
  `x=${px(value.left)} y=${px(value.top)} w=${px(value.width)} h=${px(value.height)}`;

export function formatMesurerContext(context: MesurerContextV1): string {
  const lines: string[] = ["Mesurer visual context", "", `Page: ${context.page.url}`, `Viewport: ${context.viewport.width} × ${context.viewport.height} CSS px; scroll x=${context.viewport.scrollX} y=${context.viewport.scrollY}`];
  if (context.scope.kind === "annotation") {
    lines.push("", "Annotation", context.scope.note, `Target status: ${context.scope.targetStatus}`);
  } else {
    lines.push("", `Scope: ${context.scope.kind}`);
  }
  if (context.visualState.rulersVisible || context.visualState.xrayVisible) {
    lines.push("", `Visual state: rulers=${context.visualState.rulersVisible ? "on" : "off"}; x-ray=${context.visualState.xrayVisible ? "on" : "off"}`);
  }
  if (context.targets.length) {
    lines.push("", "Targets");
    for (const target of context.targets) {
      const value = target.inspection;
      lines.push(
        `[${target.ref}] ${value.selector}`,
        `  rect: ${lineRect(value.rect)}`,
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
    for (const measurement of context.visualContext.measurements) {
      lines.push(`- ${measurement.targetRef ? `${measurement.targetRef}: ` : ""}${lineRect(measurement.rect)}; delta=${px(measurement.deltaX)} × ${px(measurement.deltaY)}`);
    }
  }
  if (context.visualContext.distances.length) {
    lines.push("", "Relevant distances");
    for (const distance of context.visualContext.distances) {
      const refs = [distance.targetARef, distance.targetBRef].filter(Boolean).join(" → ");
      const values = [
        distance.horizontal ? `horizontal=${px(distance.horizontal.value)}` : null,
        distance.vertical ? `vertical=${px(distance.vertical.value)}` : null,
      ].filter(Boolean).join("; ");
      lines.push(`- ${refs ? `${refs}: ` : ""}${values || "overlapping"}`);
    }
  }
  return lines.join("\n").trimEnd();
}

export function createMesurerCapturePlan(context: MesurerContextV1): MesurerCapturePlanV1 {
  const evidenceRects = [
    ...context.targets.map((target) => target.inspection.rect),
    ...context.visualContext.measurements.map((measurement) => measurement.rect),
    ...context.visualContext.distances.flatMap((distance) => [distance.rectA, distance.rectB]),
  ];
  const union = unionRects(evidenceRects);
  const captures: MesurerCapturePlanV1["captures"] = [{ id: "viewport", kind: "viewport" }];
  if (union) {
    const padding = 48;
    const left = Math.max(0, union.left - padding);
    const top = Math.max(0, union.top - padding);
    const right = Math.min(context.viewport.width, union.left + union.width + padding);
    const bottom = Math.min(context.viewport.height, union.top + union.height + padding);
    if (right > left && bottom > top) captures.push({
      id: "focus",
      kind: "clip",
      rect: { left, top, width: right - left, height: bottom - top },
    });
  }
  return {
    schema: "mesurer.capture/v1",
    contextId: context.id,
    chrome: "hide",
    evidence: "show",
    captures,
  };
}

const addChange = (changes: MesurerReviewChange[], kind: MesurerReviewChange["kind"], label: string, before: number, current: number) => {
  if (!Number.isFinite(before) || !Number.isFinite(current) || Math.abs(before - current) < 0.01) return;
  changes.push({ kind, label, before, current, delta: current - before, unit: "px" });
};

export function reviewMesurerAnnotation(options: {
  runtime: MesurerWorkspaceRuntime;
  ownerDocument: Document;
  ownerWindow: Window;
  annotationId: string;
}): MesurerReviewV1 {
  const annotation = options.runtime.annotation(options.annotationId);
  if (!annotation) throw new Error(`Mesurer annotation not found: ${options.annotationId}`);
  const current = captureMesurerContext({
    runtime: options.runtime,
    ownerDocument: options.ownerDocument,
    ownerWindow: options.ownerWindow,
    request: { annotation: options.annotationId },
  });
  if (current.scope.kind !== "annotation") throw new Error("Mesurer annotation context invariant failed.");
  const changes: MesurerReviewChange[] = [];

  for (const baseline of annotation.baseline.targets) {
    const target = current.targets.find((item) => item.inspection.selector === baseline.selector);
    if (!target) continue;
    addChange(changes, "target-rect", `${baseline.selector} left`, baseline.rect.left, target.inspection.rect.left);
    addChange(changes, "target-rect", `${baseline.selector} top`, baseline.rect.top, target.inspection.rect.top);
    addChange(changes, "target-rect", `${baseline.selector} width`, baseline.rect.width, target.inspection.rect.width);
    addChange(changes, "target-rect", `${baseline.selector} height`, baseline.rect.height, target.inspection.rect.height);
  }
  for (const baseline of annotation.baseline.guides) {
    const value = current.visualContext.guides.find((guide) => guide.id === baseline.id);
    if (value) addChange(changes, "guide", `${baseline.orientation} guide ${baseline.id}`, baseline.position, value.position);
  }
  for (const baseline of annotation.baseline.measurements) {
    const value = current.visualContext.measurements.find((measurement) => measurement.id === baseline.id);
    if (!value) continue;
    addChange(changes, "measurement", `${baseline.id} width`, baseline.rect.width, value.rect.width);
    addChange(changes, "measurement", `${baseline.id} height`, baseline.rect.height, value.rect.height);
  }
  for (const baseline of annotation.baseline.distances) {
    const value = current.visualContext.distances.find((distance) => distance.id === baseline.id);
    if (!value) continue;
    if (baseline.horizontal && value.horizontal) addChange(changes, "distance", `${baseline.id} horizontal`, baseline.horizontal.value, value.horizontal.value);
    if (baseline.vertical && value.vertical) addChange(changes, "distance", `${baseline.id} vertical`, baseline.vertical.value, value.vertical.value);
  }

  return {
    schema: "mesurer.review/v1",
    annotationId: annotation.id,
    note: annotation.note,
    targetStatus: current.scope.targetStatus,
    baseline: annotation.baseline,
    current,
    changes,
  };
}

export function toAcpContentBlocks(context: MesurerContextV1, images: MesurerEvidenceImage[] = []): MesurerAcpContentBlock[] {
  return [
    { type: "text", text: formatMesurerContext(context) },
    ...images.map((image) => ({ type: "image" as const, mimeType: image.mimeType, data: image.data })),
  ];
}

export async function copyTextToClipboard(ownerDocument: Document, ownerWindow: Window, text: string) {
  try {
    if (ownerWindow.navigator.clipboard?.writeText) {
      await ownerWindow.navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the user-gesture-compatible legacy path for pages where the
    // Clipboard API is unavailable or blocked by page/browser policy.
  }
  const textarea = ownerDocument.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  ownerDocument.body.append(textarea);
  textarea.select();
  const copied = ownerDocument.execCommand?.("copy") ?? false;
  textarea.remove();
  if (!copied) throw new Error("Unable to copy Mesurer context to the clipboard.");
}

export type { MesurerContextRequest } from "@jhomra21/mesurer-solid-renderer";
