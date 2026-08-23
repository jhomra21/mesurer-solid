export function isEditableKeyboardEvent(event: KeyboardEvent, ownerWindow: Window): boolean {
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

const isExpectedPointerCaptureError = (error: unknown, target: PointerCaptureTarget): boolean => {
  const DOMExceptionConstructor = target.ownerDocument?.defaultView?.DOMException;
  return typeof DOMExceptionConstructor === "function"
    && error instanceof DOMExceptionConstructor
    && (error.name === "NotFoundError" || error.name === "InvalidStateError");
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
