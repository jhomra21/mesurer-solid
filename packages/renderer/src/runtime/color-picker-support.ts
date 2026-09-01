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

const isKnownUnsupportedColorPickerHost = (ownerWindow: Window) => {
  // Codex's in-app browser can expose a Chromium page realm that passes native
  // EyeDropper shape checks even though the host cannot present the OS picker.
  // Treat the branded host as unsupported rather than rendering an inert tool.
  return /(?:^|\s)CodexBrowser(?:\s|$)/i.test(ownerWindow.navigator.userAgent);
};

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  // EyeDropper is a secure-context-only browser capability. If the host does not
  // positively expose a secure context, do not advertise a control that cannot work.
  if (ownerWindow.isSecureContext !== true) return false;
  if (isKnownUnsupportedColorPickerHost(ownerWindow)) return false;
  // SAFETY: EyeDropper is an optional browser Window extension read as unknown and decoded by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};
