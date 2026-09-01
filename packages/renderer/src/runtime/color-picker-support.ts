type EyeDropperConstructor = Function & {
  prototype: { open: Function };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

const isEyeDropperConstructor = (value: unknown): value is EyeDropperConstructor => {
  if (typeof value !== "function") return false;
  // SAFETY: the function check establishes a callable boundary; this assertion is used only to validate the required native EyeDropper prototype contract below.
  const candidate = value as Function & { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

const isAutomatedBrowserHost = (ownerWindow: Window) =>
  ownerWindow.navigator.webdriver === true;

const hasUsableBrowserIdentity = (ownerWindow: Window) =>
  typeof ownerWindow.navigator.userAgent === "string"
  && ownerWindow.navigator.userAgent.length > 0;

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  // Native EyeDropper opens browser/OS chrome. Automated and nonstandard embedded
  // hosts can expose an EyeDropper-shaped page API without being able to present
  // that UI, so do not advertise an inert toolbar action there.
  if (isAutomatedBrowserHost(ownerWindow) || !hasUsableBrowserIdentity(ownerWindow)) return false;
  // EyeDropper is a secure-context-only browser capability. If the host does not
  // positively expose a secure context, do not advertise a control that cannot work.
  if (ownerWindow.isSecureContext !== true) return false;
  // SAFETY: EyeDropper is an optional browser Window extension read as unknown and decoded by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};
