type EyeDropperConstructor = Function & {
  prototype: { open: Function };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

type ColorPickerCapabilityReason =
  | "supported"
  | "automated-host"
  | "secure-context-unavailable"
  | "eyedropper-unavailable";

const isEyeDropperConstructor = (value: unknown): value is EyeDropperConstructor => {
  if (typeof value !== "function") return false;
  // SAFETY: the function check establishes a callable boundary; this assertion is used only to validate the required native EyeDropper prototype contract below.
  const candidate = value as Function & { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

const recordColorPickerCapability = (
  ownerWindow: Window,
  candidate: unknown,
  reason: ColorPickerCapabilityReason,
) => {
  const root = ownerWindow.document.documentElement;
  root.dataset.mesurerColorPickerRuntimeCapability = reason;
  root.dataset.mesurerColorPickerRuntimeSecureContext = String(ownerWindow.isSecureContext);
  root.dataset.mesurerColorPickerRuntimeWebdriver = String(ownerWindow.navigator.webdriver);
  root.dataset.mesurerColorPickerRuntimeEyeDropper = Object.prototype.toString.call(candidate);
};

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  // Read the optional browser extension exactly once so the capability decision and
  // diagnostic bridge describe the same page-realm observation.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;

  // Native EyeDropper opens browser/OS chrome. Automated hosts can expose an
  // EyeDropper-shaped page API without being able to present that UI, so do not
  // advertise an inert toolbar action there.
  if (ownerWindow.navigator.webdriver === true) {
    recordColorPickerCapability(ownerWindow, candidate, "automated-host");
    return false;
  }
  // EyeDropper is a secure-context-only browser capability. If the host does not
  // positively expose a secure context, do not advertise a control that cannot work.
  if (ownerWindow.isSecureContext !== true) {
    recordColorPickerCapability(ownerWindow, candidate, "secure-context-unavailable");
    return false;
  }
  if (!isEyeDropperConstructor(candidate)) {
    recordColorPickerCapability(ownerWindow, candidate, "eyedropper-unavailable");
    return false;
  }
  recordColorPickerCapability(ownerWindow, candidate, "supported");
  return true;
};
