import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installDocumentScrollAnchoring } from "./document-scroll-anchoring";
import { stabilizeNativeScrollRuntimeLayer } from "./native-scroll-runtime-layer";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingPresentation } from "./text-editing-presentation";
import {
  installMixedInlineTextTargeting,
  installRenderInPlaceTextEditing,
} from "./text-editing-render-in-place";
import { installUnifiedTextInspector } from "./text-editing-unified-inspector";
import {
  installUnifiedTextSelectEscapeGuard,
  installUnifiedTextSelectLayer,
} from "./text-editing-unified-select-layer";
import { installUnifiedTextSelectMenus } from "./text-editing-unified-selects";

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
  installRenderInPlaceTextEditing(ctx, runtime);
  installUnifiedTextInspector(ctx, runtime);
  installUnifiedTextSelectMenus(ctx, runtime);
  installUnifiedTextSelectLayer(ctx, runtime);
  // Chromium can move the page in the compositor before JavaScript receives a
  // scroll event. Put scroll-following owners in the document anchor tree so
  // their visible movement is resolved by CSS Anchor Positioning instead of
  // having fixed overlay geometry chase the page from JS.
  installDocumentScrollAnchoring(ctx, runtime);
  // The Typography shell itself must first be created in Mesurer's normal
  // portal. Move the intact text runtime into the document layer only for the
  // active edit, then restore it so subsequent edits initialize normally.
  stabilizeNativeScrollRuntimeLayer(ctx, runtime);
}
