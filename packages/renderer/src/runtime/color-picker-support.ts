type EyeDropperCandidate = Function & {
  prototype?: { open?: unknown };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  if (ownerWindow.isSecureContext === false) return false;
  // SAFETY: EyeDropper is an optional browser Window extension. A truthy placeholder is not enough; the native contract needs a constructible-looking API with an open method.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return typeof candidate === "function"
    && typeof (candidate as EyeDropperCandidate).prototype?.open === "function";
};
