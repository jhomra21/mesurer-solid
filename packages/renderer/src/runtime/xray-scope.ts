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

const documentStates = new WeakMap<Document, DocumentXrayState>();

const getDocumentState = (ownerDocument: Document) => {
  const existing = documentStates.get(ownerDocument);
  if (existing) return existing;
  const style = ownerDocument.createElement("style");
  style.dataset.mesurerXrayStyle = "true";
  style.textContent = scopedRules(`.${BODY_CLASS}`);
  const state = { activeInstances: new Set<number>(), style };
  documentStates.set(ownerDocument, state);
  return state;
};

const setDocumentVisible = (ownerDocument: Document, instanceId: number, visible: boolean) => {
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
  const ShadowRootCtor = (ownerWindow as Window & typeof globalThis).ShadowRoot;
  const shadowTarget = target instanceof ShadowRootCtor;
  const documentTarget = !shadowTarget && (target === ownerDocument.body || target === ownerDocument.documentElement);
  const className = token(instanceId);
  const style = ownerDocument.createElement("style");
  style.textContent = scopedRules(shadowTarget ? ":host" : `.${className}`);
  let visible = false;

  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;

    if (documentTarget) {
      setDocumentVisible(ownerDocument, instanceId, next);
      return;
    }

    if (shadowTarget) {
      if (next) target.append(style);
      else style.remove();
      return;
    }

    const element = target as HTMLElement;
    element.classList.toggle(className, next);
    if (next && !style.isConnected) ownerDocument.head?.append(style);
    if (!next) style.remove();
  };

  return {
    setVisible,
    dispose() {
      setVisible(false);
      style.remove();
    },
  };
}
