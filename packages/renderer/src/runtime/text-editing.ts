import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installNativeScrollAnchoring } from "./native-scroll-anchoring";
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
  // Geometry-following edit chrome must register before the Typography shell.
  // During scroll this keeps the ring on the host before inspector placement
  // reads it, so both surfaces are resolved in the same scroll event.
  installRenderInPlaceTextEditing(ctx, runtime);
  installUnifiedTextInspector(ctx, runtime);
  installUnifiedTextSelectMenus(ctx, runtime);
  installUnifiedTextSelectLayer(ctx, runtime);
  // Root scrolling can be compositor-driven ahead of JavaScript. On browsers
  // with CSS Anchor Positioning, bind selection/edit/hover chrome directly to
  // its page element so the browser owns scroll movement instead of JS timers.
  installNativeScrollAnchoring(ctx, runtime);
}
