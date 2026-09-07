import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingPresentation } from "./text-editing-presentation";
import {
  installMixedInlineTextTargeting,
  installRenderInPlaceTextEditing,
} from "./text-editing-render-in-place";

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
 * history/Desired intent, mixed-inline targeting chooses the direct text run
 * under the pointer, and the presentation layers keep the host rendering and
 * Mesurer typography controls intact while the editor owns keyboard input.
 */
export function installTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  installMixedInlineTextTargeting(ctx, runtime);
  installTextEditingCore(ctx, runtime);
  installTextEditingPresentation(ctx, runtime);
  installRenderInPlaceTextEditing(ctx, runtime);
}