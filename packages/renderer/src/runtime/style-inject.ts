const STYLE_ID = "mesurer-solid-styles";

const isShadowRoot = (value: HTMLElement | ShadowRoot | undefined): value is ShadowRoot =>
  value?.nodeType === 11;

const isDocument = (value: Document | ShadowRoot): value is Document => value.nodeType === 9;

export function ensureMesurerStyles(css: string, target?: HTMLElement | ShadowRoot) {
  const ownerDocument = target?.ownerDocument ?? globalThis.document;
  if (!ownerDocument) return;
  const root: Document | ShadowRoot = isShadowRoot(target) ? target : ownerDocument;
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const style = ownerDocument.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  if (isDocument(root)) root.head.append(style);
  else root.append(style);
}

/** @deprecated Internal compatibility alias while renderer modules migrate to Mesurer naming. */
export const ensureMeasurerStyles = ensureMesurerStyles;
