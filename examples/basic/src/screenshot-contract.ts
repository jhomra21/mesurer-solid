import {
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  MESURER_SCREENSHOT_SERVICE_ID,
  screenshot,
  type MesurerScreenshotService,
} from "../../../packages/mesurer/src/plugins";

type HostCaptureFormat = "blob" | "array-buffer" | "uint8-array" | "wrapped" | "transparent" | "invalid";

type HostCaptureResult =
  | Blob
  | ArrayBuffer
  | Uint8Array
  | { png?: Blob | ArrayBuffer | Uint8Array | null };

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

const deterministicTransparentPng = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * 2;
  canvas.height = window.innerHeight * 2;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Transparent fixture canvas unavailable");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgb(255 255 255 / 50%)";
  context.fillRect(200, 200, 900, 500);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Transparent fixture capture failed"));
    }, "image/png");
  });
};

const hostCapture = async () => {
  if (hostCaptureFormat === "transparent") {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.documentElement.style.setProperty("--background", "#121212");

    return deterministicTransparentPng();
  }

  document.documentElement.style.removeProperty("background");
  document.body.style.removeProperty("background");
  document.documentElement.style.removeProperty("--background");
  const blob = await deterministicPng();

  if (hostCaptureFormat === "blob") return blob;

  const buffer = await blob.arrayBuffer();

  if (hostCaptureFormat === "array-buffer") return buffer;

  const bytes = new Uint8Array(buffer);

  if (hostCaptureFormat === "uint8-array") return bytes;

  if (hostCaptureFormat === "invalid") return {};

  return {
    png: bytes,
    width: window.innerWidth * 2,
    height: window.innerHeight * 2,
  };
};

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
