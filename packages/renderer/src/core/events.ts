export function isEditableKeyboardEvent(event: KeyboardEvent, ownerWindow: Window): boolean {
  // SAFETY: ownerWindow is the document realm for this event and therefore owns the DOM constructors used below.
  const realm = ownerWindow as Window & typeof globalThis;
  return event.composedPath().some((target) => target instanceof realm.HTMLElement && (
    target.isContentEditable
    || target instanceof realm.HTMLInputElement
    || target instanceof realm.HTMLTextAreaElement
    || target instanceof realm.HTMLSelectElement
  ));
}

type PointerCaptureTarget = {
  ownerDocument?: Document | null;
  setPointerCapture?: (pointerId: number) => void;
};

const isExpectedPointerCaptureError = (cause: unknown, target: PointerCaptureTarget): boolean => {
  const DOMExceptionConstructor = target.ownerDocument?.defaultView?.DOMException;
  if (!DOMExceptionConstructor) return false;
  return cause instanceof DOMExceptionConstructor
    && (cause.name === "NotFoundError" || cause.name === "InvalidStateError");
};

export function trySetPointerCapture(target: PointerCaptureTarget, pointerId: number): boolean {
  if (!target.setPointerCapture) return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch (error) {
    if (isExpectedPointerCaptureError(error, target)) return false;
    throw error;
  }
}
