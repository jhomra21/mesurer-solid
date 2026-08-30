import {
  MESURER_ARRANGE_ACTIVE_STATE_ID as rendererActiveStateId,
  MESURER_ARRANGE_PLUGIN_ID as rendererPluginId,
  MESURER_ARRANGE_SERVICE_ID as rendererServiceId,
  MESURER_ARRANGE_SETTINGS_STATE_ID as rendererSettingsStateId,
  MESURER_ARRANGE_STATE_ID as rendererStateId,
  arrangePlugin as rendererArrangePlugin,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_ARRANGE_ACTIVE_STATE_ID: string = rendererActiveStateId;
export const MESURER_ARRANGE_PLUGIN_ID: string = rendererPluginId;
export const MESURER_ARRANGE_SERVICE_ID: string = rendererServiceId;
export const MESURER_ARRANGE_SETTINGS_STATE_ID: string = rendererSettingsStateId;
export const MESURER_ARRANGE_STATE_ID: string = rendererStateId;

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

export type ArrangeElementFingerprint = {
  tag: string;
  id: string | null;
  testId: string | null;
  role: string | null;
  ariaLabel: string | null;
  classes: string[];
  text: string | null;
};

export type ArrangeTarget = {
  id: string;
  selector: string;
  fingerprint: ArrangeElementFingerprint;
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

export const arrangePlugin = (): MesurerPlugin => ({
  ...rendererArrangePlugin(),
  version: MESURER_VERSION,
});