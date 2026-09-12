import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { installDocumentScrollAnchoring } from "./document-scroll-anchoring";
import { createDocumentTextRuntime } from "./isolated-document-portal";
import { installIsolatedDocumentUiPassthrough } from "./isolated-document-ui-passthrough";
import { installNativeScrollStability } from "./native-scroll-stability";
import { installTextEditing as installTextEditingCore } from "./text-editing-core";
import { installTextEditingMeasurementLabelClearance } from "./text-editing-measurement-label-clearance";
import { installTextEditingPresentation } from "./text-editing-presentation";
import {
  installMixedInlineTextTargeting,
  installRenderInPlaceTextEditing,
} from "./text-editing-render-in-place";
import { installDirectEditSelectionChromeOwnership } from "./text-editing-selection-chrome";
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
  // The canonical toolbar is user-positioned viewport UI. Page content is
  // allowed to move underneath it; Mesurer must not relocate the toolbar on
  // selection, scroll, resize, or plugin-driven layout changes.

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
  // is Mesurer-owned for interaction but source-owned for geometry: clicking it
  // cannot retarget Select, while page scrolling carries it with the edited text.
  installUnifiedTextInspector(ctx, textRuntime);
  // Direct edit owns the visible border for its source. Keep ordinary selected
  // MeasurementBox roots logically mounted but paintless while the editor is
  // active. Pass the original renderer portal as well as the document-backed
  // text runtime so a transient Solid portal root still living in the isolated
  // ShadowRoot cannot become a second independently positioned blue rectangle.
  installDirectEditSelectionChromeOwnership(ctx, textRuntime, runtime.portalTarget);
  installRenderInPlaceTextEditing(ctx, textRuntime);
  installUnifiedTextSelectMenus(ctx, textRuntime);
  installUnifiedTextSelectLayer(ctx, textRuntime);
  // Chromium can move the page in the compositor before JavaScript receives a
  // scroll event. Keep page-linked selection/edit chrome and ordinary Typography
  // surfaces in the same document anchor tree so they move with their source.
  // Only an explicitly dragged pinned card leaves that geometry model.
  installDocumentScrollAnchoring(ctx, textRuntime);
  // Keep native page anchors in document space and advance only hidden fallback
  // coordinates needed for post-scroll re-binding. This prevents selected-text
  // highlights and source-linked Typography surfaces from jumping after settle.
  installNativeScrollStability(ctx, textRuntime);
  // Measurement labels are separate page chrome. If a visible dimensions pill
  // occupies the inspector's chosen lane, preserve the canonical lane rules but
  // add just enough clearance for that pill instead of letting Typography cover
  // it. Install this last so it resolves only real post-placement collisions.
  installTextEditingMeasurementLabelClearance(ctx, textRuntime, runtime.portalTarget);
}
