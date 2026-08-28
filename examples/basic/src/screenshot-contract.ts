import {
  mountMeasurer,
  type MountedMeasurer,
} from "../../../packages/mesurer/src/index";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshotPlugin,
  type MesurerScreenshotService,
  type ScreenshotCaptureProvider,
} from "../../../packages/renderer/src/plugins/screenshot";

const deterministicCapture: ScreenshotCaptureProvider = async ({ ownerDocument, ownerWindow }) => {
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = ownerWindow.innerWidth * 2;
  canvas.height = ownerWindow.innerHeight * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Fixture canvas unavailable");
  context.fillStyle = "#f5f5f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0d99ff";
  context.fillRect(200, 200, 900, 500);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Fixture capture failed"));
    }, "image/png");
  });
};

const subject = mountMeasurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  plugins: [screenshotPlugin({
    copy: false,
    download: false,
    captureVisibleTab: deterministicCapture,
  })],
  persistKey: "mesurer-screenshot-contract",
});

await subject.ready;
const service = subject.pluginHost?.service.get<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);
if (!service) throw new Error("Screenshot service did not mount");

type ScreenshotHarness = {
  subject: MountedMeasurer;
  service: MesurerScreenshotService;
};

declare global {
  interface Window {
    __MESURER_SCREENSHOT_TEST__?: ScreenshotHarness;
  }
}

window.__MESURER_SCREENSHOT_TEST__ = { subject, service };
