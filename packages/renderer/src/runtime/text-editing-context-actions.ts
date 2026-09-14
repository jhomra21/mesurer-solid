import type { MesurerPluginContext } from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";

const EDITOR = "[data-mesurer-text-editor='true']";
const RUNTIME_MOUNT = "[data-mesurer-text-edit-runtime='true']";
const ACTIVE_ATTRIBUTE = "data-mesurer-direct-text-edit-active";
const STYLE_MARKER = "data-mesurer-direct-edit-context-actions";

type DocumentState = {
  users: Set<symbol>;
  active: Set<symbol>;
  style: HTMLStyleElement;
};

const documentStates = new WeakMap<Document, DocumentState>();

const syncDocumentState = (ownerDocument: Document, state: DocumentState) => {
  const active = state.active.size > 0;
  if (active) ownerDocument.documentElement.setAttribute(ACTIVE_ATTRIBUTE, "true");
  else ownerDocument.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);
};

const acquireDocumentState = (ownerDocument: Document) => {
  let state = documentStates.get(ownerDocument);
  if (state) return state;

  const style = ownerDocument.createElement("style");
  style.setAttribute(STYLE_MARKER, "true");
  style.textContent = `
html[${ACTIVE_ATTRIBUTE}="true"] [data-mesurer-annotation-trigger="true"] {
  display: none !important;
}
`;
  ownerDocument.head.append(style);
  state = { users: new Set(), active: new Set(), style };
  documentStates.set(ownerDocument, state);
  return state;
};

/**
 * Direct text edit is an editing interaction, not an annotation interaction.
 * While the editor is mounted, suppress only the selection annotation trigger
 * so it cannot compete with the dimensions pill or Typography surface. Saved
 * annotation markers and panels remain available.
 *
 * The observer is scoped to Mesurer's text-edit runtime. It never watches page
 * content and does no work on pointermove or scroll.
 */
export function installDirectEditContextActionSuppression(
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) {
  const { ownerDocument, ownerWindow, portalTarget } = runtime;
  // SAFETY: ownerWindow is the browsing-context global paired with ownerDocument.
  const realm = ownerWindow as Window & typeof globalThis;
  const mounts = portalTarget.querySelectorAll<HTMLElement>(RUNTIME_MOUNT);
  const runtimeMount = mounts.item(mounts.length - 1);
  if (!runtimeMount?.isConnected) return;

  const state = acquireDocumentState(ownerDocument);
  const token = Symbol("mesurer-direct-text-edit");
  state.users.add(token);
  let active = false;

  const sync = () => {
    const next = Boolean(runtimeMount.querySelector(EDITOR));
    if (next === active) return;
    active = next;
    if (active) state.active.add(token);
    else state.active.delete(token);
    syncDocumentState(ownerDocument, state);
  };

  const observer = new realm.MutationObserver(sync);
  observer.observe(runtimeMount, { childList: true, subtree: true });
  sync();

  ctx.lifecycle.onDispose(() => {
    observer.disconnect();
    state.active.delete(token);
    state.users.delete(token);
    syncDocumentState(ownerDocument, state);
    if (state.users.size > 0) return;
    state.style.remove();
    ownerDocument.documentElement.removeAttribute(ACTIVE_ATTRIBUTE);
    documentStates.delete(ownerDocument);
  });
}
