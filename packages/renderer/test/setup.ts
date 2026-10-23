const explicitEditableState = (element: HTMLElement): boolean | null => {
  const raw = element.getAttribute("contenteditable") ?? element.contentEditable ?? "inherit";
  const value = raw.trim().toLowerCase();

  if (value === "false") return false;

  if (value === "" || value === "true" || value === "plaintext-only") return true;

  return null;
};

// jsdom does not lay out elements. Real resize geometry is covered by browser
// contracts; supporting renderer tests only need the observer lifecycle.
globalThis.ResizeObserver ??= class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no media query engine. Device-pixel and reduced-motion behavior is
// covered by browser contracts; renderer tests only need a non-matching query.
window.matchMedia ??= (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});

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
