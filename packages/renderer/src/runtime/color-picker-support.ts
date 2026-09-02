type EyeDropperConstructor = {
  new (): object;
  prototype: { open: Function };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

// Some embedded Chromium hosts expose a native EyeDropper interface but abort
// every open before a person can interact with it. Once observed, stop
// advertising the tool for the rest of this page realm.
const operationallyUnavailableWindows = new WeakSet<Window>();

const isEyeDropperConstructor = (value: unknown): value is EyeDropperConstructor => {
  if (typeof value !== "function") return false;
  // SAFETY: the function check establishes a callable boundary; this assertion is used only to validate the required native EyeDropper prototype contract below.
  const candidate = value as { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

export const markNativeColorPickerOperationallyUnavailable = (ownerWindow: Window) => {
  operationallyUnavailableWindows.add(ownerWindow);
};

export const resetNativeColorPickerOperationalState = (ownerWindow: Window) => {
  operationallyUnavailableWindows.delete(ownerWindow);
};

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  if (operationallyUnavailableWindows.has(ownerWindow)) return false;
  // SAFETY: EyeDropper is an optional Window extension and is decoded immediately by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};
