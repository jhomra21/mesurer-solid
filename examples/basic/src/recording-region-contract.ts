import { ALL_FORMATS, BlobSource, CanvasSink, Input, canEncodeVideo } from "mediabunny";
import { mountMesurer } from "../../../packages/mesurer/src/index";
import {
  MESURER_RECORDING_SERVICE_ID,
  recording,
  type MesurerRecordingService,
  type RecordingRect,
} from "../../../packages/mesurer/src/plugins";

// The region sits near the bottom-right corner so a smaller window can clip it.
const REGION: RecordingRect = { left: 700, top: 450, width: 260, height: 150 };

type Box = { left: number; top: number; width: number; height: number };

const place = (id: string, box: Box) => {
  const element = document.getElementById(id);

  if (!element) throw new Error(`Missing marker ${id}`);
  Object.assign(element.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });

  return element;
};

place("marker-red", { left: REGION.left + 20, top: REGION.top + 20, width: 40, height: 40 });

place("marker-green", { left: REGION.left + 200, top: REGION.top + 20, width: 30, height: 30 });

const sweep = place("marker-sweep", {
  left: REGION.left + 10,
  top: REGION.top + 110,
  width: 16,
  height: 30,
});

const startedAt = performance.now();

const animate = () => {
  const phase = (performance.now() - startedAt) / 300;
  sweep.style.left = `${REGION.left + 10 + 64 * (0.5 + 0.5 * Math.sin(phase))}px`;
  requestAnimationFrame(animate);
};

animate();

// Color Picker needs a capture source; a host screenshot keeps its availability independent of EyeDropper.
window.__MESURER_HOST__ = {
  captureScreenshot: async () => {
    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Screenshot fixture requires a 2D canvas.");
    context.fillStyle = "#336699";
    context.fillRect(0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Capture failed."))), "image/png");
    });
  },
};

const subject = mountMesurer({
  target: document.body,
  isolate: true,
  agent: true,
  plugins: [recording({ maxDurationSeconds: 12, quality: "high" })],
  persistKey: "mesurer-recording-region-contract",
});

await subject.ready;

const service = await subject.service<MesurerRecordingService>(MESURER_RECORDING_SERVICE_ID);

type Centroid = { x: number; y: number; pixels: number } | null;

const classify = {
  red: (r: number, g: number, b: number) => r > 190 && g < 90 && b < 90,
  green: (r: number, g: number, b: number) => g > 140 && r < 90 && b < 90,
  blue: (r: number, g: number, b: number) => b > 190 && r < 90 && g < 90,
};

export type DecodedFrame = {
  timestamp: number;
  width: number;
  height: number;
  red: Centroid;
  green: Centroid;
  blue: Centroid;
  // Share of fully black pixels in the right-hand quarter of the frame.
  blackRight: number;
};

const analyze = (canvas: OffscreenCanvas | HTMLCanvasElement, timestamp: number): DecodedFrame => {
  const { width, height } = canvas;
  // SAFETY: both canvas kinds return a 2D context for "2d"; null is handled below.
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (!context) throw new Error("Could not read a decoded frame.");
  const data = context.getImageData(0, 0, width, height).data;
  const sums = { red: [0, 0, 0], green: [0, 0, 0], blue: [0, 0, 0] };
  let black = 0;
  let rightPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      for (const key of ["red", "green", "blue"] as const) {
        if (classify[key](r, g, b)) {
          sums[key][0] += x;
          sums[key][1] += y;
          sums[key][2] += 1;
        }
      }

      if (x >= width * 0.75) {
        rightPixels += 1;

        if (r < 24 && g < 24 && b < 24) black += 1;
      }
    }
  }

  const centroid = (sum: number[]): Centroid =>
    sum[2] >= 20 ? { x: sum[0] / sum[2], y: sum[1] / sum[2], pixels: sum[2] } : null;

  return {
    timestamp,
    width,
    height,
    red: centroid(sums.red),
    green: centroid(sums.green),
    blue: centroid(sums.blue),
    blackRight: rightPixels ? black / rightPixels : 0,
  };
};

const toPng = (canvas: OffscreenCanvas | HTMLCanvasElement) =>
  canvas instanceof HTMLCanvasElement
    ? new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed."))), "image/png"))
    : canvas.convertToBlob({ type: "image/png" });

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const decodeFrames = async (blob: Blob) => {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });

  try {
    const track = await input.getPrimaryVideoTrack();

    if (!track) throw new Error("Recording has no video track.");
    const sink = new CanvasSink(track);
    const frames: DecodedFrame[] = [];
    const pictures: { timestamp: number; png: Blob }[] = [];
    let previous: { canvas: OffscreenCanvas | HTMLCanvasElement; timestamp: number } | null = null;

    for await (const wrapped of sink.canvases()) {
      frames.push(analyze(wrapped.canvas, wrapped.timestamp));

      // Keep the first two frames and the last as visual evidence.
      if (frames.length <= 2) pictures.push({ timestamp: wrapped.timestamp, png: await toPng(wrapped.canvas) });
      previous = { canvas: wrapped.canvas, timestamp: wrapped.timestamp };
    }

    if (previous) pictures.push({ timestamp: previous.timestamp, png: await toPng(previous.canvas) });

    const pictureData = await Promise.all(pictures.map(async (picture) => ({
      timestamp: picture.timestamp,
      dataUrl: await blobToDataUrl(picture.png),
    })));

    return { duration: await input.computeDuration(), frames, pictures: pictureData };
  } finally {
    input.dispose();
  }
};

export type CropProbeOptions = {
  // "real" delegates to Chromium, "drop-first" ignores the first cropTo, "drop-all" ignores every cropTo.
  crop: "real" | "drop-first" | "drop-all";
  // Hold back every requestVideoFrameCallback so no frame is ever reported as presented.
  stallFrames?: boolean;
  // Hand the recorder a whole-tab stream of exactly this size (the real capture redrawn onto a canvas),
  // so a HiDPI page yields a scaled whole-tab stream.
  wholeTabSize?: { width: number; height: number };
};

const scaledWholeTabStream = async (source: MediaStream, size: { width: number; height: number }) => {
  const video = document.createElement("video");

  video.muted = true;
  video.srcObject = source;
  await video.play();

  const canvas = document.createElement("canvas");

  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");

  if (!context) throw new Error("Scaled stream fixture requires a 2D canvas.");

  const draw = () => {
    context.drawImage(video, 0, 0, size.width, size.height);
    requestAnimationFrame(draw);
  };

  draw();

  return canvas.captureStream(60);
};

type CropProbeLog = {
  cropCalls: ("target" | "null")[];
  frameRequests: number;
  frameCancels: number;
  streamSize: { width: number; height: number } | null;
};

const probeLog: CropProbeLog = { cropCalls: [], frameRequests: 0, frameCancels: 0, streamSize: null };

const installCropProbe = (options: CropProbeOptions) => {
  probeLog.cropCalls = [];
  probeLog.frameRequests = 0;
  probeLog.frameCancels = 0;
  probeLog.streamSize = null;

  const media = navigator.mediaDevices;
  const getDisplayMedia = media.getDisplayMedia.bind(media);

  media.getDisplayMedia = async (constraints) => {
    const captured = await getDisplayMedia(constraints);
    const stream = options.wholeTabSize ? await scaledWholeTabStream(captured, options.wholeTabSize) : captured;

    // SAFETY: cropTo is an optional Chromium extension on the track; it is only read here and wrapped below.
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
      cropTo?: (target: Element | null) => Promise<void>;
    };

    const realCropTo = track.cropTo?.bind(track);

    track.cropTo = async (target) => {
      probeLog.cropCalls.push(target ? "target" : "null");

      const settings = track.getSettings();

      probeLog.streamSize = options.wholeTabSize ?? { width: settings.width ?? 0, height: settings.height ?? 0 };

      const dropped = options.crop === "drop-all"
        || (options.crop === "drop-first" && probeLog.cropCalls.length === 1);

      if (!dropped && realCropTo) await realCropTo(target);
    };

    return stream;
  };

  if (options.stallFrames) {
    const prototype = HTMLVideoElement.prototype;

    prototype.requestVideoFrameCallback = () => {
      probeLog.frameRequests += 1;

      return probeLog.frameRequests;
    };

    prototype.cancelVideoFrameCallback = () => {
      probeLog.frameCancels += 1;
    };
  }
};

const canEncodeMp4 = (width: number, height: number) =>
  canEncodeVideo("avc", { width: width + (width % 2), height: height + (height % 2) });

type RegionHarness = {
  region: RecordingRect;
  service: MesurerRecordingService;
  decodeFrames: typeof decodeFrames;
  installCropProbe: typeof installCropProbe;
  readCropProbe: () => CropProbeLog;
  canEncodeMp4: typeof canEncodeMp4;
};

declare global {
  interface Window {
    __MESURER_REGION_TEST__?: RegionHarness;
  }
}

window.__MESURER_REGION_TEST__ = {
  region: REGION,
  service,
  decodeFrames,
  installCropProbe,
  readCropProbe: () => structuredClone(probeLog),
  canEncodeMp4,
};