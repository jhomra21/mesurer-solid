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

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  if (ownerWindow.isSecureContext === false) return false;
  // SAFETY: EyeDropper is an optional browser Window extension read as unknown and decoded by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};
