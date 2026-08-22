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
