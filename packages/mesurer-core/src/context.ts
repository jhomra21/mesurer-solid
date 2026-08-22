import type { DistanceOverlay, Guide, Rect } from "./domain";

export type MesurerContextRequest =
  | { scope?: "workspace" }
  | { scope: "selection" }
  | { annotation: string };

export type MesurerElementFingerprint = {
  tag: string;
  id: string | null;
  testId: string | null;
  role: string | null;
  ariaLabel: string | null;
  classes: string[];
  /** Conservative text identity used only when no stronger DOM id is available. */
  text: string | null;
};

export type MesurerAnnotationTarget = {
  id: string;
  selector: string;
  fingerprint: MesurerElementFingerprint;
  lastRect: Rect;
};

export type MesurerAnnotationBaseline = {
  targets: Array<{ id: string; selector: string; rect: Rect }>;
  guides: Guide[];
  measurements: Array<{
    id: string;
    rect: Rect;
    deltaX: number;
    deltaY: number;
    snapped?: boolean;
  }>;
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

export type MesurerEvidenceMeasurement<ElementRef = unknown> = {
  id: string;
  rect: Rect;
  deltaX: number;
  deltaY: number;
  snapped?: boolean;
  elementRef?: ElementRef | null;
};

export type MesurerEvidenceDistance<ElementRef = unknown> = {
  id: string;
  rectA: Rect;
  rectB: Rect;
  elementRefA?: ElementRef | null;
  elementRefB?: ElementRef | null;
  horizontal: DistanceOverlay["horizontal"];
  vertical: DistanceOverlay["vertical"];
};

export type MesurerEvidenceWorkspace<ElementRef = unknown> = {
  guides: readonly Guide[];
  measurements: readonly MesurerEvidenceMeasurement<ElementRef>[];
  activeMeasurement: MesurerEvidenceMeasurement<ElementRef> | null;
  distances: readonly MesurerEvidenceDistance<ElementRef>[];
};

export type MesurerEvidenceScope<ElementRef = unknown> =
  | { kind: "workspace" }
  | { kind: "scoped"; elements: readonly ElementRef[]; regions: readonly Rect[] };

export type MesurerRelevantEvidence<ElementRef = unknown> = {
  guides: Guide[];
  measurements: MesurerEvidenceMeasurement<ElementRef>[];
  distances: MesurerEvidenceDistance<ElementRef>[];
};

export const cloneMesurerRect = (value: Rect): Rect => ({
  left: value.left,
  top: value.top,
  width: value.width,
  height: value.height,
});

export const mesurerRectsOverlap = (left: Rect, right: Rect) =>
  left.left <= right.left + right.width
  && left.left + left.width >= right.left
  && left.top <= right.top + right.height
  && left.top + left.height >= right.top;

export const unionMesurerRects = (values: readonly Rect[]): Rect | null => {
  if (!values.length) return null;
  const left = Math.min(...values.map((value) => value.left));
  const top = Math.min(...values.map((value) => value.top));
  const right = Math.max(...values.map((value) => value.left + value.width));
  const bottom = Math.max(...values.map((value) => value.top + value.height));
  return { left, top, width: right - left, height: bottom - top };
};

export const mesurerGuideTouchesRegions = (
  guide: Guide,
  regions: readonly Rect[],
  tolerance: number,
) => regions.some((region) => guide.orientation === "vertical"
  ? guide.position >= region.left - tolerance
    && guide.position <= region.left + region.width + tolerance
  : guide.position >= region.top - tolerance
    && guide.position <= region.top + region.height + tolerance);

export const collectMesurerWorkspaceMeasurements = <ElementRef>(
  workspace: Pick<MesurerEvidenceWorkspace<ElementRef>, "measurements" | "activeMeasurement">,
) => [
  ...workspace.measurements,
  ...(workspace.activeMeasurement
    && !workspace.measurements.some((measurement) => measurement.id === workspace.activeMeasurement?.id)
    ? [workspace.activeMeasurement]
    : []),
];

export function selectMesurerRelevantEvidence<ElementRef>(options: {
  workspace: MesurerEvidenceWorkspace<ElementRef>;
  scope: MesurerEvidenceScope<ElementRef>;
  guideTolerance: number;
}): MesurerRelevantEvidence<ElementRef> {
  const { workspace, scope, guideTolerance } = options;
  if (scope.kind === "workspace") {
    return {
      guides: workspace.guides.map((guide) => ({ ...guide })),
      measurements: collectMesurerWorkspaceMeasurements(workspace),
      distances: [...workspace.distances],
    };
  }

  const elementSet = new Set(scope.elements);
  const matchesElement = (element: ElementRef | null | undefined) =>
    element !== null && element !== undefined && elementSet.has(element);
  const matchesRect = (value: Rect) =>
    scope.regions.some((region) => mesurerRectsOverlap(value, region));

  return {
    guides: workspace.guides
      .filter((guide) => mesurerGuideTouchesRegions(guide, scope.regions, guideTolerance))
      .map((guide) => ({ ...guide })),
    measurements: collectMesurerWorkspaceMeasurements(workspace)
      .filter((measurement) => matchesElement(measurement.elementRef) || matchesRect(measurement.rect)),
    distances: workspace.distances.filter((distance) =>
      matchesElement(distance.elementRefA)
      || matchesElement(distance.elementRefB)
      || matchesRect(distance.rectA)
      || matchesRect(distance.rectB)),
  };
}

export function createMesurerAnnotationBaseline<ElementRef>(options: {
  targets: readonly MesurerAnnotationTarget[];
  elements?: readonly ElementRef[];
  region?: Rect | null;
  workspace: MesurerEvidenceWorkspace<ElementRef>;
  guideTolerance: number;
}): MesurerAnnotationBaseline {
  const { targets, elements = [], region = null, workspace, guideTolerance } = options;
  const targetRegion = unionMesurerRects(targets.map((target) => target.lastRect));
  const regions = targetRegion ? [targetRegion] : region ? [region] : [];
  const evidence = selectMesurerRelevantEvidence({
    workspace,
    scope: { kind: "scoped", elements, regions },
    guideTolerance,
  });

  return {
    targets: targets.map((target) => ({
      id: target.id,
      selector: target.selector,
      rect: cloneMesurerRect(target.lastRect),
    })),
    guides: evidence.guides,
    measurements: evidence.measurements.map((measurement) => {
      const value: MesurerAnnotationBaseline["measurements"][number] = {
        id: measurement.id,
        rect: cloneMesurerRect(measurement.rect),
        deltaX: measurement.deltaX,
        deltaY: measurement.deltaY,
      };
      if (measurement.snapped !== undefined) value.snapped = measurement.snapped;
      return value;
    }),
    distances: evidence.distances.map((distance) => ({
      id: distance.id,
      rectA: cloneMesurerRect(distance.rectA),
      rectB: cloneMesurerRect(distance.rectB),
      horizontal: distance.horizontal ? { ...distance.horizontal } : null,
      vertical: distance.vertical ? { ...distance.vertical } : null,
    })),
  };
}
