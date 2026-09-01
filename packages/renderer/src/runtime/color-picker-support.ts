import { createSignal, type Accessor, type Setter } from "solid-js";

type EyeDropperConstructor = Function & {
  prototype: { open: Function };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };

type NativeColorPickerCapability = {
  read: Accessor<boolean>;
  write: Setter<boolean>;
  checks: number;
  intervalId: number;
};

const CAPABILITY_RECHECK_MS = 250;
const CAPABILITY_RECHECK_LIMIT = 20;
const capabilityByWindow = new WeakMap<Window, NativeColorPickerCapability>();

const isEyeDropperConstructor = (value: unknown): value is EyeDropperConstructor => {
  if (typeof value !== "function") return false;
  // SAFETY: the function check establishes a callable boundary; this assertion is used only to validate the required native EyeDropper prototype contract below.
  const candidate = value as Function & { prototype?: { open?: unknown } };
  return typeof candidate.prototype?.open === "function";
};

const readNativeColorPickerSupport = (ownerWindow: Window) => {
  if (ownerWindow.isSecureContext === false) return false;
  // SAFETY: EyeDropper is an optional browser Window extension read as unknown and decoded by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};

const createNativeColorPickerCapability = (ownerWindow: Window): NativeColorPickerCapability => {
  const [read, write] = createSignal(readNativeColorPickerSupport(ownerWindow));
  const capability: NativeColorPickerCapability = {
    read,
    write,
    checks: 0,
    intervalId: 0,
  };

  const refresh = () => {
    capability.checks += 1;
    capability.write(readNativeColorPickerSupport(ownerWindow));
    if (capability.checks < CAPABILITY_RECHECK_LIMIT) return;
    ownerWindow.clearInterval(capability.intervalId);
  };

  ownerWindow.setTimeout(refresh, 0);
  capability.intervalId = ownerWindow.setInterval(refresh, CAPABILITY_RECHECK_MS);
  return capability;
};

export const supportsNativeColorPicker = (ownerWindow: Window) => {
  let capability = capabilityByWindow.get(ownerWindow);
  if (!capability) {
    capability = createNativeColorPickerCapability(ownerWindow);
    capabilityByWindow.set(ownerWindow, capability);
  }
  return capability.read();
};
