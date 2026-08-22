export function isEditableKeyboardEvent(event: KeyboardEvent, ownerWindow: Window): boolean {
  const realm = ownerWindow as Window & typeof globalThis;
  return event.composedPath().some((target) => target instanceof realm.HTMLElement && (
    target.isContentEditable
    || target instanceof realm.HTMLInputElement
    || target instanceof realm.HTMLTextAreaElement
    || target instanceof realm.HTMLSelectElement
  ));
}
