export const MESURER_SELECT_GESTURE_START_EVENT = "mesurer:select-gesture-start";

export function publishMesurerSelectGestureStart(ownerWindow: Window) {
  // SAFETY: ownerWindow is the browsing-context global that created the renderer root, so it carries that realm's Event constructor.
  const realm = ownerWindow as Window & typeof globalThis;
  ownerWindow.dispatchEvent(new realm.Event(MESURER_SELECT_GESTURE_START_EVENT));
}

export function subscribeMesurerSelectGestureStart(
  ownerWindow: Window,
  listener: () => void,
) {
  ownerWindow.addEventListener(MESURER_SELECT_GESTURE_START_EVENT, listener);
  return () => ownerWindow.removeEventListener(MESURER_SELECT_GESTURE_START_EVENT, listener);
}
