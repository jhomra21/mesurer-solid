import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installDocumentScrollAnchoring } from "./document-scroll-anchoring";
import { createDocumentTextRuntime } from "./isolated-document-portal";
import { installIsolatedDocumentUiPassthrough } from "./isolated-document-ui-passthrough";
import { installNativeScrollStability } from "./native-scroll-stability";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingPresentation } from "./text-editing-presentation";
import {
  installMixedInlineTextTargeting,
  installRenderInPlaceTextEditing,
} from "./text-editing-render-in-place";
import { createTextPresentationPolicyRuntime } from "./text-presentation-policy-runtime";
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
  // Document-backed inspector controls can sit visually above the page while
  // the public ShadowRoot island remains in the browser top layer. Let real
  // pointer input pass through the isolated selection plane only over those
  // cached Mesurer UI regions; do not redispatch synthetic clicks.
  installIsolatedDocumentUiPassthrough(ctx, runtime);

  // The public package defaults to a ShadowRoot island. Keep the canonical
  // toolbar isolated and framework-owned there. Selection chrome uses the
  // MeasurementBox component's Solid Portal when it needs the document layer;
  // never reparent renderer-owned nodes imperatively.
  const { runtime: textRuntime } = createDocumentTextRuntime(runtime);

  installMixedInlineTextTargeting(ctx, textRuntime);
  // The custom dropdown owns Escape only while one of its options has focus.
  // Install that narrow guard before the core's global Escape cancellation.
  installUnifiedTextSelectEscapeGuard(ctx, textRuntime);
  // Select remains a valid direct-edit interaction surface, but saved Desired
  // text no longer becomes the page presentation merely because Select is on.
  // The policy runtime distinguishes scheduled presentation from synchronous
  // interaction and honors the explicit Keep text changes preference.
  const policyRuntime = createTextPresentationPolicyRuntime(ctx, textRuntime);
  installTextEditingCore(ctx, policyRuntime);
  installTextEditingPresentation(ctx, textRuntime);
  // Typography is the only inspector placement owner. It can observe the
  // editor/ring as those surfaces appear, so install it before render-in-place
  // rather than keeping a second fallback placement algorithm there. The card
  // is viewport UI: page chrome may move behind it, but scrolling never drags
  // the card with the edited element.
  installUnifiedTextInspector(ctx, textRuntime);
  installRenderInPlaceTextEditing(ctx, textRuntime);
  installUnifiedTextSelectMenus(ctx, textRuntime);
  installUnifiedTextSelectLayer(ctx, textRuntime);
  // Chromium can move the page in the compositor before JavaScript receives a
  // scroll event. Keep only page-following chrome (selection boxes, edit ring,
  // selected-text ranges) in the document anchor tree. Inspector cards remain
  // viewport-owned Mesurer UI and deliberately do not receive page anchors.
  installDocumentScrollAnchoring(ctx, textRuntime);
  // Keep native page anchors in document space and advance only hidden fallback
  // coordinates needed for post-scroll re-binding. This prevents selected-text
  // highlights from jumping after scrolling settles without moving the inspector.
  installNativeScrollStability(ctx, textRuntime);
}
