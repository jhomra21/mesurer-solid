import {
  MESURER_ARRANGE_ACTIVE_STATE_ID as rendererActiveStateId,
  MESURER_ARRANGE_PLUGIN_ID as rendererPluginId,
  MESURER_ARRANGE_SERVICE_ID as rendererServiceId,
  MESURER_ARRANGE_STATE_ID as rendererStateId,
  arrangePlugin as rendererArrangePlugin,
} from "@jhomra21/mesurer-solid-renderer";
import type {
  ArrangeCapturePlan,
  ArrangeIntent,
  ArrangeOffset,
  ArrangePresentation,
  ArrangeRect,
  ArrangeReview,
  ArrangeReviewTarget,
  ArrangeTarget,
  MesurerArrangeService,
} from "@jhomra21/mesurer-solid-renderer";
import type { MesurerPlugin } from "./core";
import { MESURER_VERSION } from "./version";

export const MESURER_ARRANGE_ACTIVE_STATE_ID: string = rendererActiveStateId;
export const MESURER_ARRANGE_PLUGIN_ID: string = rendererPluginId;
export const MESURER_ARRANGE_SERVICE_ID: string = rendererServiceId;
export const MESURER_ARRANGE_STATE_ID: string = rendererStateId;

export const arrangePlugin = (): MesurerPlugin => ({
  ...rendererArrangePlugin(),
  version: MESURER_VERSION,
});

export type {
  ArrangeCapturePlan,
  ArrangeIntent,
  ArrangeOffset,
  ArrangePresentation,
  ArrangeRect,
  ArrangeReview,
  ArrangeReviewTarget,
  ArrangeTarget,
  MesurerArrangeService,
};
