const token = (instanceId: number) => `mesurer-xray-${instanceId}`;

const scopedRules = (selector: string) => `
${selector} *{outline:solid 1px #2563eb!important}
${selector} [data-mesurer-island],${selector} [data-mesurer-island] *,${selector} [data-mesurer-root],${selector} [data-mesurer-root] *{outline:none!important}
${selector} .mesurer-ti-box,${selector} .mesurer-ti-card,${selector} .mesurer-ti-card *{outline:none!important}
`;

export function createXrayScope(options: {
  ownerDocument: Document;
  target: HTMLElement | ShadowRoot;
  instanceId: number;
}) {
  const { ownerDocument, target, instanceId } = options;
  const ownerWindow = ownerDocument.defaultView ?? window;
  const ShadowRootCtor = (ownerWindow as Window & typeof globalThis).ShadowRoot;
  const shadowTarget = target instanceof ShadowRootCtor;
  const className = token(instanceId);
  const style = ownerDocument.createElement("style");
  style.textContent = scopedRules(shadowTarget ? ":host" : `.${className}`);
  let visible = false;

  const setVisible = (next: boolean) => {
    if (visible === next) return;
    visible = next;
    if (shadowTarget) {
      if (next) target.append(style);
      else style.remove();
      return;
    }
    const element = target as HTMLElement;
    element.classList.toggle(className, next);
    if (next && !style.isConnected) ownerDocument.head.append(style);
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
