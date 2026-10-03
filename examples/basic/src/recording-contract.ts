import {
  mountMesurer,
  type MountedMesurer,
} from "../../../packages/mesurer/src/index";
import {
  MESURER_RECORDING_SERVICE_ID,
  MESURER_SCREENSHOT_SERVICE_ID,
  recording,
  screenshot,
  type MesurerRecordingAsset,
  type MesurerRecordingService,
  type MesurerScreenshotService,
  type RecordingRect,
} from "../../../packages/mesurer/src/plugins";

const SOURCE_WIDTH = 1280;

const SOURCE_HEIGHT = 900;

const sourceCanvas = document.createElement("canvas");

sourceCanvas.width = SOURCE_WIDTH;

sourceCanvas.height = SOURCE_HEIGHT;

sourceCanvas.setAttribute("aria-hidden", "true");

sourceCanvas.style.position = "fixed";

sourceCanvas.style.left = "-10000px";

document.body.append(sourceCanvas);

const sourceContext = sourceCanvas.getContext("2d");

if (!sourceContext) throw new Error("Recording fixture requires a 2D canvas.");

let animationFrame = 0;

const drawSource = () => {
  const phase = animationFrame % 255;
  sourceContext.fillStyle = `rgb(${phase} 40 ${255 - phase})`;
  sourceContext.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  sourceContext.fillStyle = "#ffffff";
  const stripe = (animationFrame * 11) % SOURCE_WIDTH;

  sourceContext.fillRect(stripe, 0, 80, SOURCE_HEIGHT);
  animationFrame += 1;
  requestAnimationFrame(drawSource);
};

drawSource();

const mediaDevices = navigator.mediaDevices ?? {};

let extensionBridgeEnabled = false;

let displayMediaRequests = 0;

let extensionMediaRequests = 0;

let acquisitionDelayMs = 0;

const waitForAcquisition = () =>
  acquisitionDelayMs > 0
    ? new Promise<void>((resolve) => window.setTimeout(resolve, acquisitionDelayMs))
    : Promise.resolve();

const RECORDING_PING = "mesurer:recording-bridge-ping";

const RECORDING_PONG = "mesurer:recording-bridge-pong";

const RECORDING_REQUEST = "mesurer:recording-bridge-request";

const RECORDING_RESPONSE = "mesurer:recording-bridge-response";

const bridgeRequestId = (
  value: string,
  type: string,
) => {
  const prefix = `${type}:`;

  if (!value.startsWith(prefix)) return null;
  const body = value.slice(prefix.length);
  const separator = body.indexOf(":");

  return separator < 0 ? null : body.slice(0, separator);
};

window.addEventListener("message", (event) => {
  if (!extensionBridgeEnabled || event.source !== window || event.origin !== window.location.origin) return;
  const message = String(event.data ?? "");
  const pingId = bridgeRequestId(message, RECORDING_PING);

  if (pingId) {
    window.postMessage(`${RECORDING_PONG}:${pingId}:`, window.location.origin);

    return;
  }

  const requestId = bridgeRequestId(message, RECORDING_REQUEST);

  if (!requestId) return;
  window.postMessage(
    `${RECORDING_RESPONSE}:${requestId}:ok:fixture-stream-id`,
    window.location.origin,
  );
});

if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
}

Object.defineProperty(mediaDevices, "getDisplayMedia", {
  configurable: true,
  value: async () => {
    displayMediaRequests += 1;
    await waitForAcquisition();

    return sourceCanvas.captureStream(60);
  },
});

Object.defineProperty(mediaDevices, "getUserMedia", {
  configurable: true,
  value: async () => {
    extensionMediaRequests += 1;
    await waitForAcquisition();

    return sourceCanvas.captureStream(60);
  },
});

const interactionTarget = document.querySelector<HTMLButtonElement>("[data-testid='record-interaction']");

if (!interactionTarget) throw new Error("Recording fixture interaction target is missing.");

let interactionClicks = 0;

interactionTarget.addEventListener("click", () => {
  interactionClicks += 1;
  interactionTarget.dataset.clicks = String(interactionClicks);
});

const deterministicScreenshotPng = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth * 2;
  canvas.height = window.innerHeight * 2;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Screenshot fixture requires a 2D canvas.");
  context.fillStyle = "#f5f5f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0d99ff";
  context.fillRect(160, 160, 720, 420);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Screenshot fixture capture failed."));
    }, "image/png");
  });
};

window.__MESURER_HOST__ = {
  captureScreenshot: deterministicScreenshotPng,
};

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  plugins: [
    recording({
      maxDurationSeconds: 5,
      quality: "medium",
    }),
    screenshot({
      copy: false,
      download: false,
    }),
  ],
  persistKey: "mesurer-recording-contract",
});

await subject.ready;

const service = await subject.service<MesurerRecordingService>(MESURER_RECORDING_SERVICE_ID);
const screenshotService = await subject.service<MesurerScreenshotService>(MESURER_SCREENSHOT_SERVICE_ID);

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const waitForEvent = (
  target: EventTarget,
  event: string,
) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => {
    target.removeEventListener(event, onEvent);
    reject(new Error(`Timed out waiting for ${event}.`));
  }, 3000);

  const onEvent = () => {
    window.clearTimeout(timer);
    resolve();
  };

  target.addEventListener(event, onEvent, { once: true });
});

const sampleAsset = async (
  asset: MesurerRecordingAsset,
) => {
  const url = globalThis.URL.createObjectURL(asset.blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  document.body.append(video);

  try {
    if (video.readyState < 1) await waitForEvent(video, "loadedmetadata");
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth);
    canvas.height = Math.max(1, video.videoHeight);
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Could not sample the recorded video.");

    const sampleAt = async (time: number) => {
      video.currentTime = Math.min(
        Math.max(0, time),
        Math.max(0, asset.duration - 0.02),
      );

      if (video.seeking) await waitForEvent(video, "seeked");

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const pixel = context.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
      ).data;

      return [pixel[0], pixel[1], pixel[2], pixel[3]];
    };

    const first = await sampleAt(Math.min(0.08, asset.duration * 0.2));
    const second = await sampleAt(Math.max(first.length ? 0.1 : 0, asset.duration * 0.8));

    return {
      first,
      second,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.remove();
    globalThis.URL.revokeObjectURL(url);
  }
};

type RecordingHarness = {
  subject: MountedMesurer;
  service: MesurerRecordingService;
  screenshotService: MesurerScreenshotService;
  setExtensionBridge(enabled: boolean): void;
  setAcquisitionDelay(milliseconds: number): void;
  counters(): {
    displayMediaRequests: number;
    extensionMediaRequests: number;
  };
  record(rect: RecordingRect, durationMs?: number): Promise<{
    asset: {
      duration: number;
      width: number;
      height: number;
      bytes: number;
    };
    samples: {
      first: number[];
      second: number[];
      width: number;
      height: number;
    };
  }>;
};

declare global {
  interface Window {
    __MESURER_RECORDING_TEST__?: RecordingHarness;
  }
}

window.__MESURER_RECORDING_TEST__ = {
  subject,
  service,
  screenshotService,
  setExtensionBridge(enabled) {
    extensionBridgeEnabled = enabled;
  },
  setAcquisitionDelay(milliseconds) {
    acquisitionDelayMs = Math.max(0, milliseconds);
  },
  counters() {
    return {
      displayMediaRequests,
      extensionMediaRequests,
    };
  },
  async record(rect, durationMs = 900) {
    await service.start(rect);
    await wait(durationMs);
    const asset = await service.stop();
    const samples = await sampleAsset(asset);

    return {
      asset: {
        duration: asset.duration,
        width: asset.width,
        height: asset.height,
        bytes: asset.blob.size,
      },
      samples,
    };
  },
};
