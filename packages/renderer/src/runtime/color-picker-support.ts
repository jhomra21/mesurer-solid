type EyeDropperConstructor = {
  new (): unknown;
  prototype: { open: Function };
  name?: string;
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
  const candidate = value as { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

const eyeDropperInterfaceDiagnostics = (candidate: unknown) => {
  if (!isEyeDropperConstructor(candidate)) {
    return {
      constructorName: "unavailable",
      constructorSource: "unavailable",
      openSource: "unavailable",
      instanceBrand: "unavailable",
    };
  }

  let instanceBrand = "construction-failed";
  try {
    instanceBrand = Object.prototype.toString.call(new candidate());
  } catch {
    // Keep the diagnostic sentinel when construction itself fails.
  }

  return {
    constructorName: candidate.name ?? "",
    constructorSource: Function.prototype.toString.call(candidate),
    openSource: Function.prototype.toString.call(candidate.prototype.open),
    instanceBrand,
  };
};

const recordColorPickerCapability = (
  ownerWindow: Window,
  candidate: unknown,
  reason: ColorPickerCapabilityReason,
) => {
  const root = ownerWindow.document.documentElement;
  const diagnostics = eyeDropperInterfaceDiagnostics(candidate);
  root.dataset.mesurerColorPickerRuntimeCapability = reason;
  root.dataset.mesurerColorPickerRuntimeSecureContext = String(ownerWindow.isSecureContext);
  root.dataset.mesurerColorPickerRuntimeWebdriver = String(ownerWindow.navigator.webdriver);
  root.dataset.mesurerColorPickerRuntimeEyeDropper = Object.prototype.toString.call(candidate);
  root.dataset.mesurerColorPickerRuntimeConstructorName = diagnostics.constructorName;
  root.dataset.mesurerColorPickerRuntimeConstructorSource = diagnostics.constructorSource;
  root.dataset.mesurerColorPickerRuntimeOpenSource = diagnostics.openSource;
  root.dataset.mesurerColorPickerRuntimeInstanceBrand = diagnostics.instanceBrand;
  root.dataset.mesurerColorPickerRuntimeUserAgent = String(ownerWindow.navigator.userAgent);
  root.dataset.mesurerColorPickerRuntimePlatform = String(ownerWindow.navigator.platform);
  root.dataset.mesurerColorPickerRuntimeVendor = String(ownerWindow.navigator.vendor);
  root.dataset.mesurerColorPickerRuntimeTopLevel = String(ownerWindow.top === ownerWindow);
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
