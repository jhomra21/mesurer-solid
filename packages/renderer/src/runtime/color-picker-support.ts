type EyeDropperConstructor = {
  new (): object;
  prototype: { open: Function };
  name?: string;
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

type ColorPickerCapabilityReason =
  | "supported"
  | "automated-host"
  | "secure-context-unavailable"
  | "eyedropper-unavailable";

type EyeDropperObservation = {
  available: boolean;
  tag: string;
  constructorName: string;
  constructorSource: string;
  openSource: string;
  instanceBrand: string;
  constructor?: EyeDropperConstructor;
};

const isEyeDropperConstructor = (value: unknown): value is EyeDropperConstructor => {
  if (typeof value !== "function") return false;
  // SAFETY: the function check establishes a callable boundary; this assertion is used only to validate the required native EyeDropper prototype contract below.
  const candidate = value as { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

const readEyeDropperObservation = (ownerWindow: Window): EyeDropperObservation => {
  // SAFETY: EyeDropper is an optional Window extension and is decoded immediately by isEyeDropperConstructor before any invocation.
  const value = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  const tag = Object.prototype.toString.call(value);
  if (!isEyeDropperConstructor(value)) {
    return {
      available: false,
      tag,
      constructorName: "unavailable",
      constructorSource: "unavailable",
      openSource: "unavailable",
      instanceBrand: "unavailable",
    };
  }

  let instanceBrand = "construction-failed";
  try {
    instanceBrand = Object.prototype.toString.call(new value());
  } catch {
    // Keep the diagnostic sentinel when construction itself fails.
  }

  return {
    available: true,
    tag,
    constructor: value,
    constructorName: value.name ?? "",
    constructorSource: Function.prototype.toString.call(value),
    openSource: Function.prototype.toString.call(value.prototype.open),
    instanceBrand,
  };
};

const recordColorPickerCapability = (
  ownerWindow: Window,
  observation: EyeDropperObservation,
  reason: ColorPickerCapabilityReason,
) => {
  const root = ownerWindow.document.documentElement;
  root.dataset.mesurerColorPickerRuntimeCapability = reason;
  root.dataset.mesurerColorPickerRuntimeSecureContext = String(ownerWindow.isSecureContext);
  root.dataset.mesurerColorPickerRuntimeWebdriver = String(ownerWindow.navigator.webdriver);
  root.dataset.mesurerColorPickerRuntimeEyeDropper = observation.tag;
  root.dataset.mesurerColorPickerRuntimeConstructorName = observation.constructorName;
  root.dataset.mesurerColorPickerRuntimeConstructorSource = observation.constructorSource;
  root.dataset.mesurerColorPickerRuntimeOpenSource = observation.openSource;
  root.dataset.mesurerColorPickerRuntimeInstanceBrand = observation.instanceBrand;
  root.dataset.mesurerColorPickerRuntimeUserAgent = String(ownerWindow.navigator.userAgent);
  root.dataset.mesurerColorPickerRuntimePlatform = String(ownerWindow.navigator.platform);
  root.dataset.mesurerColorPickerRuntimeVendor = String(ownerWindow.navigator.vendor);
  root.dataset.mesurerColorPickerRuntimeTopLevel = String(ownerWindow.top === ownerWindow);
};

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  const observation = readEyeDropperObservation(ownerWindow);

  // Native EyeDropper opens browser/OS chrome. Automated hosts can expose an
  // EyeDropper-shaped page API without being able to present that UI, so do not
  // advertise an inert toolbar action there.
  if (ownerWindow.navigator.webdriver === true) {
    recordColorPickerCapability(ownerWindow, observation, "automated-host");
    return false;
  }
  // EyeDropper is a secure-context-only browser capability. If the host does not
  // positively expose a secure context, do not advertise a control that cannot work.
  if (ownerWindow.isSecureContext !== true) {
    recordColorPickerCapability(ownerWindow, observation, "secure-context-unavailable");
    return false;
  }
  if (!observation.available || !observation.constructor) {
    recordColorPickerCapability(ownerWindow, observation, "eyedropper-unavailable");
    return false;
  }
  recordColorPickerCapability(ownerWindow, observation, "supported");
  return true;
};
