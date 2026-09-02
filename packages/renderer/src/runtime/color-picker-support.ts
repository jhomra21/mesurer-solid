type EyeDropperConstructor = {
  new (): object;
  prototype: { open: Function };
};
type WindowWithEyeDropper = Window & { EyeDropper?: unknown };
type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands?: Array<{ brand: string; version: string }>;
    mobile?: boolean;
    platform?: string;
  };
};

const recordColorPickerHostFingerprint = (ownerWindow: Window) => {
  const navigator = ownerWindow.navigator as NavigatorWithUserAgentData;
  const matchingNames = (value: object) => Object.getOwnPropertyNames(value)
    .filter((name) => /codex|openai|electron|webkit|cef|chrome|browser|bridge/i.test(name))
    .sort();
  const chromeValue = (ownerWindow as Window & { chrome?: object }).chrome;
  const fingerprint = {
    userAgent: navigator.userAgent,
    appVersion: navigator.appVersion,
    platform: navigator.platform,
    vendor: navigator.vendor,
    webdriver: navigator.webdriver,
    userAgentData: navigator.userAgentData
      ? {
          brands: navigator.userAgentData.brands ?? [],
          mobile: navigator.userAgentData.mobile,
          platform: navigator.userAgentData.platform,
        }
      : null,
    topLevel: ownerWindow.top === ownerWindow,
    hasOpener: Boolean(ownerWindow.opener),
    referrer: ownerWindow.document.referrer,
    protocol: ownerWindow.location.protocol,
    chromeKeys: chromeValue ? matchingNames(chromeValue) : [],
    windowBridgeKeys: matchingNames(ownerWindow),
    navigatorBridgeKeys: matchingNames(navigator),
  };
  ownerWindow.document.documentElement.dataset.mesurerColorPickerHostFingerprint = JSON.stringify(fingerprint);
};

// CodexBrowser currently exposes a native-looking EyeDropper in Mesurer's page
// realm even though the host cannot present the picker UI. Hide the control up
// front there instead of making the first user click discover that mismatch.
const isKnownUnavailableHost = (ownerWindow: Window) =>
  ownerWindow.navigator.userAgent.startsWith("CodexBrowser ");

// Some embedded Chromium hosts may still expose a native EyeDropper interface
// that aborts every open before a person can interact with it. Once observed,
// stop advertising the tool for the rest of this page realm.
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
  recordColorPickerHostFingerprint(ownerWindow);
  if (isKnownUnavailableHost(ownerWindow)) return false;
  if (operationallyUnavailableWindows.has(ownerWindow)) return false;
  // SAFETY: EyeDropper is an optional Window extension and is decoded immediately by isEyeDropperConstructor before use.
  const candidate = (ownerWindow as WindowWithEyeDropper).EyeDropper;
  return isEyeDropperConstructor(candidate);
};
