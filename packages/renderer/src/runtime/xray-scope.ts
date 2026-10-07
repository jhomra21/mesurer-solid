import { getAccessibleDocuments } from "../core/document-tree";

const BODY_CLASS = "mesurer-solid-xray";

const token = (instanceId: number) => `mesurer-xray-${instanceId}`;

const scopedRules = (selector: string) => `
${selector} *{outline:solid 1px #2563eb!important}
${selector} [data-mesurer-island],${selector} [data-mesurer-island] *,${selector} [data-mesurer-root],${selector} [data-mesurer-root] *{outline:none!important}
${selector} .mesurer-ti-box,${selector} .mesurer-ti-card,${selector} .mesurer-ti-card *{outline:none!important}
`;

type DocumentXrayState = {
  activeInstances: Set<number>;
  style: HTMLStyleElement;
};

type DocumentWatcher = {
  load: EventListener;
  observer: MutationObserver | null;
};

const documentStates = new WeakMap<Document, DocumentXrayState>();

const getDocumentState = (ownerDocument: Document) => {
  const existing = documentStates.get(ownerDocument);

  if (existing) return existing;

  const style = ownerDocument.createElement("style");

  style.dataset.mesurerXrayStyle = "true";
  style.textContent = scopedRules(`.${BODY_CLASS}`);

  const state = {
    activeInstances: new Set<number>(),
    style,
  };

  documentStates.set(ownerDocument, state);

  return state;
};

const setDocumentVisible = (
  ownerDocument: Document,
  instanceId: number,
  visible: boolean,
) => {
  const state = getDocumentState(ownerDocument);

  if (visible) state.activeInstances.add(instanceId);
  else state.activeInstances.delete(instanceId);

  const host = ownerDocument.body ?? ownerDocument.documentElement;
  const active = state.activeInstances.size > 0;

  host?.classList.toggle(BODY_CLASS, active);

  if (active) {
    if (!state.style.isConnected) ownerDocument.head?.append(state.style);
  } else {
    state.style.remove();
  }
};

export function createXrayScope(options: {
  ownerDocument: Document;
  target: HTMLElement | ShadowRoot;
  instanceId: number;
}) {
  const { ownerDocument, target, instanceId } = options;
  const ownerWindow = ownerDocument.defaultView ?? window;

  // SAFETY: ownerWindow is the realm that owns target and therefore its DOM constructors.
  const realm = ownerWindow as Window & typeof globalThis;

  const shadowTarget = target instanceof realm.ShadowRoot;

  const documentTarget = !shadowTarget
    && (target === ownerDocument.body || target === ownerDocument.documentElement);

  const className = token(instanceId);
  const style = ownerDocument.createElement("style");

  style.dataset.mesurerXrayStyle = "true";
  style.textContent = scopedRules(shadowTarget ? ":host" : `.${className}`);

  const elementStyleRoot = !shadowTarget
    ? target.getRootNode()
    : null;

  const scopedStyleHost = elementStyleRoot instanceof realm.ShadowRoot
    ? elementStyleRoot
    : ownerDocument.head;

  const appliedDocuments = new Set<Document>();
  const documentWatchers = new Map<Document, DocumentWatcher>();
  let visible = false;

  const releaseDocumentWatcher = (currentDocument: Document) => {
    const watcher = documentWatchers.get(currentDocument);

    if (!watcher) return;

    currentDocument.removeEventListener("load", watcher.load, true);
    watcher.observer?.disconnect();
    documentWatchers.delete(currentDocument);
  };

  const syncDocumentTree = () => {
    const documents = visible
      ? new Set(getAccessibleDocuments(target))
      : new Set<Document>();

    for (const currentDocument of appliedDocuments) {
      if (!documents.has(currentDocument)) {
        setDocumentVisible(currentDocument, instanceId, false);
      }
    }

    for (const currentDocument of documents) {
      setDocumentVisible(currentDocument, instanceId, true);
    }

    appliedDocuments.clear();

    for (const currentDocument of documents) {
      appliedDocuments.add(currentDocument);

      if (documentWatchers.has(currentDocument)) continue;

      const load: EventListener = () => syncDocumentTree();

      // SAFETY: defaultView is the realm that owns currentDocument and therefore its MutationObserver constructor.
      const currentRealm = currentDocument.defaultView as (Window & typeof globalThis) | null;

      const Observer = currentRealm?.MutationObserver;

      const observer = Observer && currentDocument.body
        ? new Observer(() => syncDocumentTree())
        : null;

      currentDocument.addEventListener("load", load, true);
      observer?.observe(currentDocument.body, {
        childList: true,
        subtree: true,
      });

      documentWatchers.set(currentDocument, {
        load,
        observer,
      });
    }

    for (const currentDocument of documentWatchers.keys()) {
      if (!documents.has(currentDocument)) releaseDocumentWatcher(currentDocument);
    }
  };

  const setVisible = (next: boolean) => {
    if (visible === next) return;

    visible = next;

    if (documentTarget) {
      syncDocumentTree();

      return;
    }

    if (shadowTarget) {
      if (next && !style.isConnected) target.append(style);
      else if (!next) style.remove();

      return;
    }

    target.classList.toggle(className, next);

    if (next && !style.isConnected) scopedStyleHost?.append(style);

    if (!next) style.remove();
  };

  return {
    setVisible,
    dispose() {
      if (visible) setVisible(false);

      for (const currentDocument of documentWatchers.keys()) {
        releaseDocumentWatcher(currentDocument);
      }

      for (const currentDocument of appliedDocuments) {
        setDocumentVisible(currentDocument, instanceId, false);
      }

      appliedDocuments.clear();
      style.remove();
    },
  };
}
