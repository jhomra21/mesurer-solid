export const MESURER_SELECT_GESTURE_START_EVENT = "mesurer:select-gesture-start";

export function publishMesurerSelectGestureStart(ownerWindow: Window) {
  ownerWindow.dispatchEvent(new ownerWindow.Event(MESURER_SELECT_GESTURE_START_EVENT));
}

export function subscribeMesurerSelectGestureStart(
  ownerWindow: Window,
  listener: () => void,
) {
  ownerWindow.addEventListener(MESURER_SELECT_GESTURE_START_EVENT, listener);
  return () => ownerWindow.removeEventListener(MESURER_SELECT_GESTURE_START_EVENT, listener);
}
