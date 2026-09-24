import {
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshot,
  type MesurerScreenshotService,
} from "../../../packages/mesurer/src/plugins";

type HostCaptureFormat = "blob" | "array-buffer" | "uint8-array" | "wrapped";

let hostCaptureFormat: HostCaptureFormat = "blob";

const deterministicPng = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * 2;
  canvas.height = window.innerHeight * 2;
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

const hostCapture = async () => {
  const blob = await deterministicPng();

  if (hostCaptureFormat === "blob") return blob;

  const buffer = await blob.arrayBuffer();

  if (hostCaptureFormat === "array-buffer") return buffer;

  const bytes = new Uint8Array(buffer);

  if (hostCaptureFormat === "uint8-array") return bytes;

  return {
    png: bytes,
    width: window.innerWidth * 2,
    height: window.innerHeight * 2,
  };
};

declare global {
  interface Window {
    __MESURER_HOST__?: {
      captureScreenshot(): Promise<
        Blob
        | ArrayBuffer
        | Uint8Array
        | { png: Uint8Array; width: number; height: number }
      >;
    };
  }
}

window.__MESURER_HOST__ = {
  captureScreenshot: hostCapture,
};

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  topLayer: false,
  plugins: [screenshot({
    copy: false,
    download: false,
  })],
  persistKey: "mesurer-screenshot-contract",
});

await subject.ready;

const service = await subject.service<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);

type ScreenshotHarness = {
  subject: MountedMesurer;
  service: MesurerScreenshotService;
  setHostCaptureFormat(format: HostCaptureFormat): void;
};

declare global {
  interface Window {
    __MESURER_SCREENSHOT_TEST__?: ScreenshotHarness;
  }
}

window.__MESURER_SCREENSHOT_TEST__ = {
  subject,
  service,
  setHostCaptureFormat(format) {
    hostCaptureFormat = format;
  },
};
