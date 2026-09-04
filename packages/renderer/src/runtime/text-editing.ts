import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingPresentation } from "./text-editing-presentation";

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
 * targeting/history/Desired intent, while the presentation adapter keeps the
 * field-local typography controls aligned with Mesurer's toolbar language.
 */
export function installTextEditing(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  installTextEditingCore(ctx, runtime);
  installTextEditingPresentation(ctx, runtime);
}