type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  // SAFETY: EyeDropper is an optional browser Window extension represented by this named capability type.
  const browserWindow = ownerWindow as WindowWithEyeDropper;
  return Boolean(browserWindow.EyeDropper);
};
