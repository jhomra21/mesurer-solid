const explicitEditableState = (element: HTMLElement): boolean | null => {
  const raw = element.getAttribute("contenteditable") ?? element.contentEditable ?? "inherit";
  const value = raw.trim().toLowerCase();
  if (value === "false") return false;
  if (value === "" || value === "true" || value === "plaintext-only") return true;
  return null;
};

const inheritedEditableState = (element: HTMLElement): boolean => {
  const state = explicitEditableState(element);
  if (state !== null) return state;
  return element.parentElement ? inheritedEditableState(element.parentElement) : false;
};

if (!("isContentEditable" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get(this: HTMLElement) {
      return inheritedEditableState(this);
    },
  });
}
