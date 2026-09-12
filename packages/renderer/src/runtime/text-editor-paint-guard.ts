import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

export const TEXT_EDITOR_PAINT_GUARD_CSS = `
[data-mesurer-text-editor="true"] {
  opacity: 0 !important;
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  caret-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

[data-mesurer-text-editor="true"]::selection {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  background: transparent !important;
}
`;

/**
 * The native textarea is only the keyboard/selection surface for direct text
 * editing. The page text plus Mesurer's ring/highlight/caret are the visible
 * presentation. Install this rule before the core can mount the textarea so a
 * browser paint/compositor handoff can never expose a second copy of the text.
 */
export function installTextEditorPaintGuard(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow owns portalTarget and supplies its matching ShadowRoot constructor.
  const realm = ownerWindow as Window & typeof globalThis;
  const style = ownerDocument.createElement("style");
  style.dataset.mesurerTextEditorPaintGuard = "true";
  style.dataset.mesurerInspectorUi = "true";
  style.textContent = TEXT_EDITOR_PAINT_GUARD_CSS;

  const root = portalTarget.getRootNode();
  if (root instanceof realm.ShadowRoot) root.append(style);
  else (ownerDocument.head ?? ownerDocument.documentElement).append(style);

  ctx.lifecycle.onDispose(() => style.remove());
}
