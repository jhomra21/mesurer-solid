const STYLE_ID = "mesurer-solid-styles";

export function ensureMeasurerStyles(css: string, target?: HTMLElement | ShadowRoot) {
  if (typeof document === "undefined") return;
  const ownerDocument = target?.ownerDocument ?? document;
  const root: Document | ShadowRoot = target?.nodeType === 11
    ? target as ShadowRoot
    : ownerDocument;
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const style = ownerDocument.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  if (root.nodeType === 9) (root as Document).head.append(style);
  else root.append(style);
}
