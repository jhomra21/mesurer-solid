import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installDocumentScrollAnchoring } from "./document-scroll-anchoring";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingPresentation } from "./text-editing-presentation";
import {
  installMixedInlineTextTargeting,
  installRenderInPlaceTextEditing,
} from "./text-editing-render-in-place";
import { installUnifiedTextInspector } from "./text-editing-unified-inspector";
import {
  installUnifiedTextSelectEscapeGuard,
  installUnifiedTextSelectMenus,
} from "./text-editing-unified-selects";

export {
  MESURER_TEXT_EDIT_SERVICE_ID,
  MESURER_TEXT_EDIT_STATE_ID,
  type MesurerTextEditIntent,
  type MesurerTextEditService,
  type MesurerTextStyleChange,
  type MesurerTextStyleProperty,
} from "./text-editing-core";

/**
 * Install direct text editing as one composed renderer feature: the core owns
 * history/Desired intent, mixed-inline targeting chooses the direct text run,
 * and one interactive Typography inspector owns editing controls while the
 * host element remains the visible text surface.
 */
export function installTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  installMixedInlineTextTargeting(ctx, runtime);
  // The custom dropdown owns Escape only while one of its options has focus.
  // Install that narrow guard before the core's global Escape cancellation.
  installUnifiedTextSelectEscapeGuard(ctx, runtime);
  installTextEditingCore(ctx, runtime);
  installTextEditingPresentation(ctx, runtime);
  // Typography is the only inspector placement owner. It can observe the
  // editor/ring as those surfaces appear, so install it before render-in-place
  // rather than keeping a second fallback placement algorithm there.
  installUnifiedTextInspector(ctx, runtime);
  installRenderInPlaceTextEditing(ctx, runtime);
  installUnifiedTextSelectMenus(ctx, runtime);
  // Chromium can move the page in the compositor before JavaScript receives a
  // scroll event. Keep scroll-following owners in the document anchor tree so
  // their visible movement is resolved by CSS Anchor Positioning instead of
  // having fixed overlay geometry chase the page from JS. The text runtime is
  // moved once and stays intact there; all of its existing event/DOM ownership
  // relationships remain unchanged.
  installDocumentScrollAnchoring(ctx, runtime);
}
