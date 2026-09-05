const explicitEditableState = (element: HTMLElement): boolean | null => {
  const attribute = element.getAttribute("contenteditable");
  const property = typeof element.contentEditable === "string" ? element.contentEditable : null;
  const raw = attribute ?? property;
  if (raw === null) return null;
  const value = raw.trim().toLowerCase();
  if (value === "false") return false;
  if (value === "" || value === "true" || value === "plaintext-only") return true;
  return null;
};

if (!("isContentEditable" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get(this: HTMLElement) {
      let current: HTMLElement | null = this;
      while (current) {
        const state = explicitEditableState(current);
        if (state !== null) return state;
        current = current.parentElement;
      }
      return false;
    },
  });
}
