import {
  contextPlugin,
  MESURER_VERSION,
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshotPlugin,
  type MesurerScreenshotService,
  type ScreenshotCaptureProvider,
} from "../../../packages/renderer/src/plugins/screenshot";

const pluginStorageKey = "mesurer-plugin-settings";
const pluginAvailabilityStorageKey = `${pluginStorageKey}:availability`;
const url = new URL(window.location.href);
if (url.searchParams.get("reset") === "1") {
  window.localStorage.removeItem(pluginStorageKey);
  window.localStorage.removeItem(pluginAvailabilityStorageKey);
}

// This fixture owns plugin lifecycle and Settings geometry. Native Color Picker
// capability has its own browser contract, so keep toolbar composition stable here.
Reflect.deleteProperty(window, "EyeDropper");

type CapturePresentation = {
  measurementVisible: boolean;
  screenshotSelectionVisible: boolean;
  measurements: Array<{
    layer: "shadow" | "document";
    display: string;
    priority: string;
    rects: number;
    selected: boolean;
    isolatedDocumentLayer: boolean;
    isolatedProxy: boolean;
  }>;
};

const captures: CapturePresentation[] = [];
let captureRoots: Array<{ layer: "shadow" | "document"; root: ParentNode }> = [{ layer: "document", root: document }];

const visibleInLayout = (element: Element) => element.getClientRects().length > 0;
const matchingElements = (selector: string) => captureRoots.flatMap(({ layer, root }) =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).map((element) => ({ layer, element })),
);
const presentationVisible = (selector: string) => matchingElements(selector)
  .some(({ element }) => visibleInLayout(element));

const deterministicCapture: ScreenshotCaptureProvider = async ({ ownerDocument, ownerWindow }) => {
  captures.push({
    measurementVisible: presentationVisible("[data-mesurer-measurement='true']"),
    screenshotSelectionVisible: presentationVisible("[data-mesurer-screenshot-select='true']"),
    measurements: matchingElements("[data-mesurer-measurement='true']").map(({ layer, element }) => ({
      layer,
      display: element.style.getPropertyValue("display"),
      priority: element.style.getPropertyPriority("display"),
      rects: element.getClientRects().length,
      selected: element.dataset.mesurerSelectedMeasurement === "true",
      isolatedDocumentLayer: element.dataset.mesurerIsolatedDocumentLayer === "true",
      isolatedProxy: element.dataset.mesurerIsolatedSelectionProxy === "true",
    })),
  });

  const canvas = ownerDocument.createElement("canvas");
  canvas.width = ownerWindow.innerWidth;
  canvas.height = ownerWindow.innerHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Plugin settings fixture canvas unavailable");
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f172a";
  context.fillRect(96, 96, 280, 160);
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
    contextPlugin(),
    screenshotPlugin({
      copy: false,
      download: false,
      includeMeasurements: false,
      captureVisibleTab: deterministicCapture,
    }),
  ],
});

await subject.ready;
captureRoots = [
  { layer: "shadow", root: subject.root },
  { layer: "document", root: document },
];
const screenshot = () => subject.pluginHost?.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);

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

window.__MESURER_PLUGIN_SETTINGS_TEST__ = { subject, screenshot, captures, version: MESURER_VERSION };
