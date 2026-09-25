import {
  MESURER_VERSION,
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  context,
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshot,
  type MesurerScreenshotService,
} from "../../../packages/mesurer/src/plugins";

const pluginStorageKey = "mesurer-plugin-settings";

const pluginAvailabilityStorageKey = `${pluginStorageKey}:availability`;

const url = new URL(window.location.href);

if (url.searchParams.get("reset") === "1") {
  window.localStorage.removeItem(pluginStorageKey);
  window.localStorage.removeItem(pluginAvailabilityStorageKey);
}

// This fixture owns plugin lifecycle and Settings geometry. Color Picker has its
// own browser and Electron contracts, so keep native capability unavailable here.
Reflect.deleteProperty(window, "EyeDropper");

type CapturePresentation = {
  measurementVisible: boolean;
  screenshotSelectionVisible: boolean;
};

const captures: CapturePresentation[] = [];

let captureRoots: ParentNode[] = [document];

const visibleInLayout = (element: Element) => element.getClientRects().length > 0;

const visibleMeasurement = (element: HTMLElement) => {
  if (visibleInLayout(element)) return true;

  // Selected measurement roots in the document-native anchor layer are
  // intentionally zero-height containers. Their absolutely positioned chrome
  // and label are the rendered presentation, so inspect those direct surfaces
  // rather than treating the ownership wrapper's empty box as hidden.
  return Array.from(element.children).some((child) => (
    child instanceof HTMLElement
    && visibleInLayout(child)
    && getComputedStyle(child).display !== "none"
    && getComputedStyle(child).visibility !== "hidden"
  ));
};

const presentationVisible = (
  selector: string,
  isVisible: (element: HTMLElement) => boolean = visibleInLayout,
) => captureRoots.some((root) =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).some(isVisible),
);

const deterministicCapture = async () => {
  captures.push({
    measurementVisible: presentationVisible("[data-mesurer-measurement='true']", visibleMeasurement),
    screenshotSelectionVisible: presentationVisible("[data-mesurer-screenshot-select='true']"),
  });

  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const context2d = canvas.getContext("2d");

  if (!context2d) throw new Error("Plugin settings fixture canvas unavailable");
  context2d.fillStyle = "#f8fafc";
  context2d.fillRect(0, 0, canvas.width, canvas.height);
  context2d.fillStyle = "#0f172a";
  context2d.fillRect(96, 96, 280, 160);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Plugin settings fixture capture failed"));
    }, "image/png");
  });
};

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  plugins: [
    context(),
    screenshot({
      copy: false,
      download: false,
      includeMeasurements: false,
      capture: deterministicCapture,
    }),
  ],
});

await subject.ready;

captureRoots = [subject.root, document];

const screenshotService = () => subject.pluginHost?.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);

type PluginSettingsHarness = {
  subject: MountedMesurer;
  screenshot(): MesurerScreenshotService | undefined;
  captures: CapturePresentation[];
  version: string;
};

declare global {
  interface Window {
    __MESURER_PLUGIN_SETTINGS_TEST__?: PluginSettingsHarness;
  }
}

window.__MESURER_PLUGIN_SETTINGS_TEST__ = { subject, screenshot: screenshotService, captures, version: MESURER_VERSION };
