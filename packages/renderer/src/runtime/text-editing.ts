import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installDocumentScrollAnchoring } from "./document-scroll-anchoring";
import { createDocumentTextRuntime } from "./isolated-document-portal";
import { installNativeScrollStability } from "./native-scroll-stability";
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
  // The public package defaults to a ShadowRoot island. Keep the canonical
  // toolbar isolated and framework-owned there. Selection chrome uses the
  // MeasurementBox component's Solid Portal when it needs the document layer;
  // never reparent renderer-owned nodes imperatively.
  const { runtime: textRuntime } = createDocumentTextRuntime(runtime);

  installMixedInlineTextTargeting(ctx, textRuntime);
  // The custom dropdown owns Escape only while one of its options has focus.
  // Install that narrow guard before the core's global Escape cancellation.
  installUnifiedTextSelectEscapeGuard(ctx, textRuntime);
  installTextEditingCore(ctx, textRuntime);
  installTextEditingPresentation(ctx, textRuntime);
  // Typography is the only inspector placement owner. It can observe the
  // editor/ring as those surfaces appear, so install it before render-in-place
  // rather than keeping a second fallback placement algorithm there.
  installUnifiedTextInspector(ctx, textRuntime);
  installRenderInPlaceTextEditing(ctx, textRuntime);
  installUnifiedTextSelectMenus(ctx, textRuntime);
  installUnifiedTextSelectLayer(ctx, textRuntime);
  // Chromium can move the page in the compositor before JavaScript receives a
  // scroll event. Keep scroll-following owners in the document anchor tree so
  // their visible movement is resolved by CSS Anchor Positioning instead of
  // having fixed overlay geometry chase the page from JS. The text runtime is
  // created in the document layer for isolated public mounts and stays intact.
  installDocumentScrollAnchoring(ctx, textRuntime);
  // Keep every native anchor in document space and advance only the hidden
  // fallback coordinates needed for post-scroll re-binding. This prevents the
  // standalone Typography surface from staying viewport-fixed and prevents a
  // selected-text highlight from jumping after scrolling settles.
  installNativeScrollStability(ctx, textRuntime);
}
