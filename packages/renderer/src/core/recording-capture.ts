import type { HostRecordingStreamResult, ScreenshotRect } from "./screenshot";

type MesurerElectronRecordingHost = {
  captureRecordingStream?: () => Promise<HostRecordingStreamResult>;
};

declare global {
  interface Window {
    __MESURER_RECORDING_HOST__?: MesurerElectronRecordingHost;
  }
}

export type RecordingViewportMetrics = {
  width: number;
  height: number;
};

export type RecordingVideoPlacement = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export type RecordingCapture = {
  stream: MediaStream;
  track: MediaStreamTrack;
  source: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  cropTarget: HTMLElement | null;
  regionLocked: boolean;
};

declare const RECORDING_CROP_TARGET: unique symbol;

type RecordingCropTarget = {
  readonly [RECORDING_CROP_TARGET]: "browser-crop-target";
};

type RegionCropTrack = MediaStreamTrack & {
  cropTo?: (target: RecordingCropTarget | null) => Promise<void>;
};

type CropTargetFactory = {
  fromElement(element: Element): Promise<RecordingCropTarget>;
};

type ChromiumDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
};

export const MESURER_RECORDING_BRIDGE_PING = "mesurer:recording-bridge-ping";

export const MESURER_RECORDING_BRIDGE_PONG = "mesurer:recording-bridge-pong";

export const MESURER_RECORDING_BRIDGE_REQUEST = "mesurer:recording-bridge-request";

export const MESURER_RECORDING_BRIDGE_RESPONSE = "mesurer:recording-bridge-response";

const HIDDEN_MEDIA_STYLE =
  "position:fixed;left:0;top:0;width:1px;height:1px;margin:0;padding:0;border:0;overflow:hidden;opacity:0;visibility:hidden;pointer-events:none";

const CAPTURE_ASPECT_TOLERANCE = 0.01;

export const recordingViewportMetrics = (
  ownerWindow: Window,
): RecordingViewportMetrics => ({
  width: ownerWindow.innerWidth,
  height: ownerWindow.innerHeight,
});

export const placeRecordingRectInVideo = (
  rect: ScreenshotRect,
  videoWidth: number,
  videoHeight: number,
  viewport: RecordingViewportMetrics,
): RecordingVideoPlacement => {
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const scaleX = videoWidth / viewportWidth;
  const scaleY = videoHeight / viewportHeight;

  const scalesMatch =
    Math.abs(scaleX - scaleY) <= CAPTURE_ASPECT_TOLERANCE * Math.max(scaleX, scaleY);

  const scale = scalesMatch ? scaleX : Math.min(scaleX, scaleY);
  const padX = scalesMatch ? 0 : (videoWidth - viewportWidth * scale) / 2;
  const padY = scalesMatch ? 0 : (videoHeight - viewportHeight * scale) / 2;
  const mapX = scalesMatch ? scaleX : scale;
  const mapY = scalesMatch ? scaleY : scale;
  const rawLeft = padX + rect.left * mapX;
  const rawTop = padY + rect.top * mapY;
  const rawRight = padX + (rect.left + rect.width) * mapX;
  const rawBottom = padY + (rect.top + rect.height) * mapY;
  const rawWidth = Math.max(rawRight - rawLeft, 1e-6);
  const rawHeight = Math.max(rawBottom - rawTop, 1e-6);
  const left = Math.max(0, Math.min(videoWidth, rawLeft));
  const top = Math.max(0, Math.min(videoHeight, rawTop));
  const right = Math.max(0, Math.min(videoWidth, rawRight));
  const bottom = Math.max(0, Math.min(videoHeight, rawBottom));
  const sx = Math.max(0, Math.round(left));
  const sy = Math.max(0, Math.round(top));
  const ex = Math.min(videoWidth, Math.round(right));
  const ey = Math.min(videoHeight, Math.round(bottom));

  return {
    sx,
    sy,
    sw: Math.max(1, ex - sx),
    sh: Math.max(1, ey - sy),
    dx: (left - rawLeft) / rawWidth,
    dy: (top - rawTop) / rawHeight,
    dw: Math.max(0, right - left) / rawWidth,
    dh: Math.max(0, bottom - top) / rawHeight,
  };
};

export const visibleSelectionSlice = (
  rect: ScreenshotRect,
  viewport: RecordingViewportMetrics,
) => {
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.left + rect.width, viewport.width);
  const bottom = Math.min(rect.top + rect.height, viewport.height);

  if (rect.width <= 0 || rect.height <= 0 || right <= left || bottom <= top) {
    return { dx: 0, dy: 0, dw: 0, dh: 0, visible: false };
  }

  return {
    dx: (left - rect.left) / rect.width,
    dy: (top - rect.top) / rect.height,
    dw: (right - left) / rect.width,
    dh: (bottom - top) / rect.height,
    visible: true,
  };
};

export const createRecordingCropTarget = (
  ownerDocument: Document,
  rect: ScreenshotRect,
) => {
  const target = ownerDocument.createElement("div");
  target.dataset.mesurerRecordingCrop = "true";
  target.setAttribute("aria-hidden", "true");
  target.style.position = "fixed";
  target.style.left = `${rect.left}px`;
  target.style.top = `${rect.top}px`;
  target.style.width = `${rect.width}px`;
  target.style.height = `${rect.height}px`;
  target.style.margin = "0";
  target.style.padding = "0";
  target.style.border = "0";
  target.style.background = "transparent";
  target.style.opacity = "0";
  target.style.pointerEvents = "none";
  ownerDocument.body.append(target);

  return target;
};

export const cropRecordingTrackToElement = async (
  track: MediaStreamTrack,
  element: Element | null,
) => {
  // SAFETY: cropTo is an optional Chromium extension on MediaStreamTrack; this read does not invoke it unless present.
  const cropTo = (track as RegionCropTrack).cropTo;

  // SAFETY: CropTarget is an optional Chromium global whose only consumed surface is the checked fromElement factory.
  const CropTarget = (globalThis as { CropTarget?: CropTargetFactory }).CropTarget;

  if (!cropTo || !CropTarget) return false;
  const target = element ? await CropTarget.fromElement(element) : null;

  await cropTo.call(track, target);

  return true;
};

export const nextRecordingVideoFrame = (
  source: HTMLVideoElement,
  ownerWindow: Window,
) => new Promise<void>((resolve) => {
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    ownerWindow.clearTimeout(timer);
    resolve();
  };

  const timer = ownerWindow.setTimeout(finish, 250);

  // SAFETY: requestVideoFrameCallback is an optional browser method; the fallback path is used when it is absent.
  const frameSource = source as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };

  if (frameSource.requestVideoFrameCallback) {
    frameSource.requestVideoFrameCallback(finish);

    return;
  }

  ownerWindow.requestAnimationFrame(finish);
});

const REGION_CROP_WAIT_MS = 600;

const nearly = (value: number, target: number) =>
  Math.abs(value - target) <= Math.max(2, target * 0.02);

// A cropped frame has the region's aspect ratio and is not the whole tab.
// A region as large as the viewport is the whole tab, so its aspect ratio alone proves the crop.
const regionCropReady = (
  source: HTMLVideoElement,
  rect: ScreenshotRect,
  ownerWindow: Window,
) => {
  const aspectMatches =
    Math.abs(source.videoWidth * rect.height - source.videoHeight * rect.width)
    <= CAPTURE_ASPECT_TOLERANCE * 3 * source.videoHeight * rect.width;

  const viewport = recordingViewportMetrics(ownerWindow);
  const pixelRatio = ownerWindow.devicePixelRatio || 1;
  const fillsViewport = rect.width >= viewport.width - 1 && rect.height >= viewport.height - 1;

  const wholeTab =
    nearly(source.videoWidth, viewport.width * pixelRatio)
    && nearly(source.videoHeight, viewport.height * pixelRatio);

  return aspectMatches && (fillsViewport || !wholeTab);
};

// The first frame at a new crop size is often the previous, uncropped picture.
// Require two presented frames that already look cropped.
const waitForRegionCrop = async (
  source: HTMLVideoElement,
  rect: ScreenshotRect,
  ownerWindow: Window,
) => {
  const deadline = ownerWindow.performance.now() + REGION_CROP_WAIT_MS;
  let stableFrames = 0;

  while (ownerWindow.performance.now() < deadline) {
    await nextRecordingVideoFrame(source, ownerWindow);
    stableFrames = regionCropReady(source, rect, ownerWindow) ? stableFrames + 1 : 0;

    if (stableFrames >= 2) return true;
  }

  return false;
};

// Chromium can drop the first cropTo while the capture stream is still starting,
// leaving whole-tab frames. Retry once, then return to the uncropped stream so
// the canvas-painted fallback sees a frame it understands.
const confirmRegionCrop = async (
  track: MediaStreamTrack,
  source: HTMLVideoElement,
  cropTarget: HTMLElement,
  rect: ScreenshotRect,
  ownerWindow: Window,
) => {
  if (await waitForRegionCrop(source, rect, ownerWindow)) return true;

  try {
    await cropRecordingTrackToElement(track, cropTarget);

    if (await waitForRegionCrop(source, rect, ownerWindow)) return true;
    await cropRecordingTrackToElement(track, null);
  } catch {
    // Without a working crop the fallback below still records the selected region.
  }

  return false;
};

const recordingBridgeTargetOrigin = (ownerWindow: Window) =>
  ownerWindow.location.origin === "null"
    ? "*"
    : ownerWindow.location.origin;

const recordingBridgeMessage = (
  type: string,
  id: string,
  payload = "",
) => `${type}:${id}:${payload}`;

const recordingBridgeReply = (
  message: string,
  type: string,
  id: string,
) => {
  const prefix = `${type}:${id}:`;

  return message.startsWith(prefix) ? message.slice(prefix.length) : null;
};

const recordingRequestId = (ownerWindow: Window) =>
  ownerWindow.crypto?.randomUUID?.()
  ?? `mesurer-recording-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const pingRecordingBridge = (
  ownerWindow: Window,
) => new Promise<boolean>((resolve) => {
  const id = recordingRequestId(ownerWindow);
  const origin = ownerWindow.location.origin;

  const onMessage = (event: MessageEvent) => {
    if (event.source !== ownerWindow || event.origin !== origin) return;

    const payload = recordingBridgeReply(
      String(event.data ?? ""),
      MESURER_RECORDING_BRIDGE_PONG,
      id,
    );

    if (payload === null) return;
    ownerWindow.removeEventListener("message", onMessage);
    ownerWindow.clearTimeout(timeoutId);
    resolve(true);
  };

  const timeoutId = ownerWindow.setTimeout(() => {
    ownerWindow.removeEventListener("message", onMessage);
    resolve(false);
  }, 80);

  ownerWindow.addEventListener("message", onMessage);
  ownerWindow.postMessage(
    recordingBridgeMessage(MESURER_RECORDING_BRIDGE_PING, id),
    recordingBridgeTargetOrigin(ownerWindow),
  );
});

const requestRecordingBridgeStreamId = (
  ownerWindow: Window,
) => new Promise<string | null>((resolve) => {
  const id = recordingRequestId(ownerWindow);
  const origin = ownerWindow.location.origin;

  const onMessage = (event: MessageEvent) => {
    if (event.source !== ownerWindow || event.origin !== origin) return;

    const payload = recordingBridgeReply(
      String(event.data ?? ""),
      MESURER_RECORDING_BRIDGE_RESPONSE,
      id,
    );

    if (payload === null) return;
    ownerWindow.removeEventListener("message", onMessage);
    ownerWindow.clearTimeout(timeoutId);

    if (!payload.startsWith("ok:")) {
      resolve(null);

      return;
    }

    const streamId = payload.slice(3);

    resolve(streamId || null);
  };

  const timeoutId = ownerWindow.setTimeout(() => {
    ownerWindow.removeEventListener("message", onMessage);
    resolve(null);
  }, 1500);

  ownerWindow.addEventListener("message", onMessage);
  ownerWindow.postMessage(
    recordingBridgeMessage(MESURER_RECORDING_BRIDGE_REQUEST, id),
    recordingBridgeTargetOrigin(ownerWindow),
  );
});

type ChromiumTabVideoConstraint = MediaTrackConstraints & {
  mandatory: {
    chromeMediaSource: "tab";
    chromeMediaSourceId: string;
  };
};

const recordingHostCapture = (ownerWindow: Window) =>
  ownerWindow.__MESURER_RECORDING_HOST__?.captureRecordingStream
  ?? ownerWindow.__MESURER_HOST__?.captureRecordingStream;

const hostRecordingStream = async (
  ownerWindow: Window,
  media: MediaDevices,
): Promise<MediaStream> => {
  const capture = recordingHostCapture(ownerWindow);

  if (!capture) {
    throw new Error("Native recording capture is unavailable.");
  }

  const result = await capture();
  const streamId = result?.streamId?.trim();

  if (!streamId) {
    throw new Error("Native recording capture returned no stream id.");
  }

  const video: ChromiumTabVideoConstraint = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  };

  return media.getUserMedia({
    audio: false,
    video,
  });
};

const extensionRecordingStream = async (
  ownerWindow: Window,
  media: MediaDevices,
) => {
  if (!ownerWindow.isSecureContext) return null;

  if (!(await pingRecordingBridge(ownerWindow))) return null;
  const streamId = await requestRecordingBridgeStreamId(ownerWindow);

  if (!streamId) return null;

  const video: ChromiumTabVideoConstraint = {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  };

  return media.getUserMedia({
    audio: false,
    video,
  });
};

const applyRecordingFrameRate = async (
  stream: MediaStream,
  frameRate: number,
) => {
  const track = stream.getVideoTracks()[0];

  if (!track?.applyConstraints) return stream;

  try {
    await track.applyConstraints({
      frameRate: {
        ideal: frameRate,
        max: frameRate,
      },
    });
  } catch {
    // Capture sources are allowed to negotiate below the requested rate.
    // Mesurer still encodes on the selected 60/120 fps timeline.
  }

  return stream;
};

const requestRecordingStream = async (
  ownerWindow: Window,
  frameRate: number,
) => {
  const media = ownerWindow.navigator.mediaDevices;

  if (!media) {
    throw new Error("Screen recording is unavailable in this browser.");
  }

  if (recordingHostCapture(ownerWindow)) {
    return applyRecordingFrameRate(
      await hostRecordingStream(ownerWindow, media),
      frameRate,
    );
  }

  try {
    const extensionStream = await extensionRecordingStream(ownerWindow, media);

    if (extensionStream) {
      return applyRecordingFrameRate(extensionStream, frameRate);
    }
  } catch {
    // The extension path is an optimization. Fall through to the browser
    // picker when the tab grant expired or the one-use stream id cannot be consumed.
  }

  if (!media.getDisplayMedia) {
    throw new Error("Screen recording is unavailable in this browser.");
  }

  const frameRateConstraint = {
    ideal: frameRate,
    max: frameRate,
  };

  const currentTab: ChromiumDisplayMediaStreamOptions = {
    audio: false,
    video: {
      displaySurface: "browser",
      frameRate: frameRateConstraint,
    },
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  };

  try {
    return applyRecordingFrameRate(
      await media.getDisplayMedia(currentTab),
      frameRate,
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;

    return applyRecordingFrameRate(
      await media.getDisplayMedia({
        audio: false,
        video: { frameRate: frameRateConstraint },
      }),
      frameRate,
    );
  }
};

export const openRecordingCapture = async (
  ownerDocument: Document,
  ownerWindow: Window,
  rect: ScreenshotRect,
  frameRate = 60,
): Promise<RecordingCapture> => {
  const stream = await requestRecordingStream(ownerWindow, frameRate);
  const track = stream.getVideoTracks()[0];

  if (!track) {
    stream.getTracks().forEach((candidate) => candidate.stop());

    throw new Error("No video track was selected.");
  }

  if (track.getSettings().displaySurface && track.getSettings().displaySurface !== "browser") {
    stream.getTracks().forEach((candidate) => candidate.stop());

    throw new Error("Select the current browser tab to record this region.");
  }

  const source = ownerDocument.createElement("video");
  source.autoplay = true;
  source.muted = true;
  source.playsInline = true;
  source.srcObject = stream;
  source.setAttribute("playsinline", "");
  source.setAttribute("aria-hidden", "true");
  source.style.cssText = HIDDEN_MEDIA_STYLE;
  ownerDocument.body.append(source);

  try {
    await source.play();

    if (source.videoWidth <= 0 || source.videoHeight <= 0) {
      await new Promise<void>((resolve, reject) => {
        source.addEventListener("loadeddata", () => resolve(), { once: true });
        source.addEventListener("error", () => reject(new Error("Could not read the selected video track.")), {
          once: true,
        });
      });
    }

    const cropTarget = createRecordingCropTarget(ownerDocument, rect);
    let regionLocked = false;

    try {
      regionLocked = await cropRecordingTrackToElement(track, cropTarget);
    } catch {
      regionLocked = false;
    }

    if (regionLocked) {
      regionLocked = await confirmRegionCrop(track, source, cropTarget, rect, ownerWindow);
    }

    if (!regionLocked) {
      cropTarget.remove();
      await nextRecordingVideoFrame(source, ownerWindow);
    }

    const pixelRatio = ownerWindow.devicePixelRatio || 1;

    const initialPlacement = placeRecordingRectInVideo(
      rect,
      source.videoWidth,
      source.videoHeight,
      recordingViewportMetrics(ownerWindow),
    );

    const canvas = ownerDocument.createElement("canvas");
    canvas.width = regionLocked
      ? Math.max(2, Math.round(rect.width * pixelRatio))
      : initialPlacement.sw;
    canvas.height = regionLocked
      ? Math.max(2, Math.round(rect.height * pixelRatio))
      : initialPlacement.sh;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = HIDDEN_MEDIA_STYLE;
    ownerDocument.body.append(canvas);

    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      canvas.remove();

      throw new Error("Screen recording requires a 2D canvas.");
    }

    const capture: RecordingCapture = {
      stream,
      track,
      source,
      canvas,
      context,
      cropTarget: regionLocked ? cropTarget : null,
      regionLocked,
    };

    paintRecordingFrame(capture, rect, recordingViewportMetrics(ownerWindow));

    return capture;
  } catch (cause) {
    source.pause();
    source.srcObject = null;
    source.remove();
    stream.getTracks().forEach((candidate) => candidate.stop());

    throw cause;
  }
};

export const paintRecordingFrame = (
  capture: RecordingCapture,
  rect: ScreenshotRect,
  viewport: RecordingViewportMetrics,
) => {
  const { source, canvas, context, regionLocked } = capture;

  if (source.videoWidth <= 0 || source.videoHeight <= 0) return;

  if (regionLocked) {
    const slice = visibleSelectionSlice(rect, viewport);

    // Region Capture only delivers the on-screen part of a clipped region.
    // Stretching it over the whole canvas would distort the recording.
    if (slice.dw >= 0.999 && slice.dh >= 0.999) {
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      return;
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!slice.visible) return;
    context.drawImage(
      source,
      0,
      0,
      source.videoWidth,
      source.videoHeight,
      slice.dx * canvas.width,
      slice.dy * canvas.height,
      slice.dw * canvas.width,
      slice.dh * canvas.height,
    );

    return;
  }

  const placed = placeRecordingRectInVideo(
    rect,
    source.videoWidth,
    source.videoHeight,
    viewport,
  );

  const coversFrame =
    placed.dx <= 0.001
    && placed.dy <= 0.001
    && placed.dw >= 0.999
    && placed.dh >= 0.999;

  const destX = coversFrame ? 0 : placed.dx * canvas.width;
  const destY = coversFrame ? 0 : placed.dy * canvas.height;
  const destWidth = coversFrame ? canvas.width : placed.dw * canvas.width;
  const destHeight = coversFrame ? canvas.height : placed.dh * canvas.height;

  if (!coversFrame) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (destWidth < 1 || destHeight < 1 || placed.dw <= 0 || placed.dh <= 0) return;
  context.drawImage(
    source,
    placed.sx,
    placed.sy,
    placed.sw,
    placed.sh,
    destX,
    destY,
    destWidth,
    destHeight,
  );
};

export const closeRecordingCapture = (
  capture: RecordingCapture,
) => {
  capture.source.pause();
  capture.source.srcObject = null;
  capture.stream.getTracks().forEach((track) => track.stop());
  capture.cropTarget?.remove();
  capture.canvas.remove();
  capture.source.remove();
};
