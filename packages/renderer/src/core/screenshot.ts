export const MIN_SCREENSHOT_SELECTION = 4;

export const MESURER_CAPTURE_VISIBLE_MESSAGE = "mesurer:capture-visible";

export const MESURER_CAPTURE_BRIDGE_PING = "mesurer:capture-bridge-ping";

export const MESURER_CAPTURE_BRIDGE_PONG = "mesurer:capture-bridge-pong";

export const MESURER_CAPTURE_BRIDGE_REQUEST = "mesurer:capture-bridge-request";

export const MESURER_CAPTURE_BRIDGE_RESPONSE = "mesurer:capture-bridge-response";

export type ScreenshotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ScreenshotCaptureContext = {
  ownerDocument: Document;
  ownerWindow: Window;
};

export type ScreenshotCaptureProvider = (
  context: ScreenshotCaptureContext,
) => Promise<Blob>;

export type HostScreenshotPng = Blob | ArrayBuffer | Uint8Array;

export type HostScreenshotEnvelope = {
  png?: HostScreenshotPng | null;
};

export type HostScreenshotResult =
  | HostScreenshotPng
  | HostScreenshotEnvelope
  | null
  | undefined;

export type MesurerHostCapabilities = {
  captureScreenshot?: () => Promise<HostScreenshotResult>;
};

declare global {
  interface Window {
    __MESURER_HOST__?: MesurerHostCapabilities;
  }
}

const hostCapture = (ownerWindow: Window) =>
  ownerWindow.__MESURER_HOST__?.captureScreenshot;

export const hasHostScreenshotCapture = (ownerWindow: Window) =>
  hostCapture(ownerWindow) !== undefined;

const hostPngBlob = (result: HostScreenshotResult): Blob => {
  if (result instanceof Blob) return result;

  if (result instanceof Uint8Array) {
    const copy = new Uint8Array(result.byteLength);

    copy.set(result);

    return new Blob([copy.buffer], { type: "image/png" });
  }

  if (result instanceof ArrayBuffer) {
    return new Blob([result.slice(0)], { type: "image/png" });
  }

  if (result === null || result === undefined) {
    throw new Error("Host screenshot capture returned no PNG data.");
  }

  if (!result.png) {
    throw new Error("Host screenshot capture returned unsupported PNG data.");
  }

  return hostPngBlob(result.png);
};

export const captureHostScreenshotPng = async (ownerWindow: Window): Promise<Blob | null> => {
  const capture = hostCapture(ownerWindow);

  if (!capture) return null;

  return hostPngBlob(await capture());
};

export const normalizeScreenshotRect = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  viewport: { width: number; height: number },
): ScreenshotRect => {
  const left = Math.max(0, Math.min(start.x, end.x, viewport.width));
  const top = Math.max(0, Math.min(start.y, end.y, viewport.height));
  const right = Math.max(0, Math.min(Math.max(start.x, end.x), viewport.width));
  const bottom = Math.max(0, Math.min(Math.max(start.y, end.y), viewport.height));

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

export const cropPngToViewportRect = async (
  blob: Blob,
  rect: ScreenshotRect,
  viewport: { width: number; height: number },
  ownerDocument: Document,
): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);

  try {
    const scaleX = bitmap.width / viewport.width;
    const scaleY = bitmap.height / viewport.height;
    const sx = Math.max(0, Math.round(rect.left * scaleX));
    const sy = Math.max(0, Math.round(rect.top * scaleY));
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.height * scaleY)));
    const canvas = ownerDocument.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Could not crop screenshot");
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((cropped) => {
        if (cropped) resolve(cropped);
        else reject(new Error("Could not crop screenshot"));
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
};

export const copyPngToClipboard = async (
  png: Blob | Promise<Blob>,
  ownerWindow: Window,
) => {
  const clipboard = ownerWindow.navigator.clipboard;
  const ClipboardItemCtor = globalThis.ClipboardItem;

  if (!clipboard?.write || !ClipboardItemCtor) {
    throw new Error("PNG clipboard copy is not available");
  }

  await clipboard.write([new ClipboardItemCtor({ "image/png": png })]);
};

export const createScreenshotFilename = (now = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `mesurer-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
};

export const downloadPng = (
  png: Blob,
  filename: string,
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  const url = globalThis.URL.createObjectURL(png);
  const link = ownerDocument.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  ownerDocument.documentElement.append(link);
  link.click();
  link.remove();
  ownerWindow.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

export const waitForNextPaint = (ownerWindow: Window) =>
  new Promise<void>((resolve) => {
    ownerWindow.requestAnimationFrame(() => {
      ownerWindow.requestAnimationFrame(() => resolve());
    });
  });

const randomRequestId = (ownerWindow: Window) =>
  ownerWindow.crypto?.randomUUID?.()
  ?? `mesurer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const bridgeMessage = (type: string, id: string, payload = "") =>
  `${type}:${id}:${payload}`;

const bridgeTargetOrigin = (ownerWindow: Window) =>
  ownerWindow.location.origin === "null"
    ? "*"
    : ownerWindow.location.origin;

const bridgeReply = (
  message: string,
  type: string,
  id: string,
) => {
  const prefix = `${type}:${id}:`;

  return message.startsWith(prefix) ? message.slice(prefix.length) : null;
};

const pingCaptureBridge = (ownerWindow: Window) =>
  new Promise<boolean>((resolve) => {
    const id = randomRequestId(ownerWindow);
    const origin = ownerWindow.location.origin;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== ownerWindow || event.origin !== origin) return;
      const message = String(event.data ?? "");

      if (bridgeReply(message, MESURER_CAPTURE_BRIDGE_PONG, id) === null) return;
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
      bridgeMessage(MESURER_CAPTURE_BRIDGE_PING, id),
      bridgeTargetOrigin(ownerWindow),
    );
  });

const captureViaBridge = (ownerWindow: Window) =>
  new Promise<Blob | null>((resolve, reject) => {
    const id = randomRequestId(ownerWindow);
    const origin = ownerWindow.location.origin;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== ownerWindow || event.origin !== origin) return;
      const message = String(event.data ?? "");
      const payload = bridgeReply(message, MESURER_CAPTURE_BRIDGE_RESPONSE, id);

      if (payload === null) return;
      ownerWindow.removeEventListener("message", onMessage);
      ownerWindow.clearTimeout(timeoutId);

      if (!payload.startsWith("ok:")) {
        resolve(null);

        return;
      }

      const dataUrl = payload.slice(3);

      if (!dataUrl) {
        resolve(null);

        return;
      }

      void ownerWindow.fetch(dataUrl)
        .then((result) => result.blob())
        .then(resolve, reject);
    };

    const timeoutId = ownerWindow.setTimeout(() => {
      ownerWindow.removeEventListener("message", onMessage);
      resolve(null);
    }, 4000);

    ownerWindow.addEventListener("message", onMessage);
    ownerWindow.postMessage(
      bridgeMessage(MESURER_CAPTURE_BRIDGE_REQUEST, id),
      bridgeTargetOrigin(ownerWindow),
    );
  });

type TabCapture = {
  stream: MediaStream;
  video: HTMLVideoElement;
};

const tabCaptures = new WeakMap<Window, TabCapture>();

const liveTabCapture = (ownerWindow: Window) => {
  const current = tabCaptures.get(ownerWindow);
  const track = current?.stream.getVideoTracks()[0];

  if (!current || !track || track.readyState !== "live") {
    tabCaptures.delete(ownerWindow);

    return undefined;
  }

  return current;
};

const startTabCapture = async (
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  const existing = liveTabCapture(ownerWindow);

  if (existing) return existing;
  const media = ownerWindow.navigator.mediaDevices;

  if (!media?.getDisplayMedia) throw new Error("Screenshot capture is unavailable");

  const constraints = {
    audio: false,
    video: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  };

  const stream = await media.getDisplayMedia(constraints);
  const track = stream.getVideoTracks()[0];

  if (!track) {
    stream.getTracks().forEach((next) => next.stop());
    throw new Error("Capture failed");
  }

  try {
    const video = ownerDocument.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
    }

    const capture: TabCapture = { stream, video };
    tabCaptures.set(ownerWindow, capture);
    track.addEventListener("ended", () => {
      if (tabCaptures.get(ownerWindow) === capture) tabCaptures.delete(ownerWindow);
    }, { once: true });

    return capture;
  } catch (cause) {
    stream.getTracks().forEach((next) => next.stop());
    throw cause;
  }
};

const releaseTabCapture = (ownerWindow: Window) => {
  const current = tabCaptures.get(ownerWindow);

  if (!current) return;
  tabCaptures.delete(ownerWindow);
  current.video.pause();
  current.video.srcObject = null;
  current.stream.getTracks().forEach((track) => track.stop());
};

const captureViaDisplayMedia: ScreenshotCaptureProvider = async ({
  ownerDocument,
  ownerWindow,
}) => {
  const { video } = await startTabCapture(ownerDocument, ownerWindow);
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Capture failed");
  context.drawImage(video, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (next) resolve(next);
      else reject(new Error("Capture failed"));
    }, "image/png");
  });
};

type ScreenshotCaptureAdapter = {
  prepare(context: ScreenshotCaptureContext): Promise<void>;
  capture(context: ScreenshotCaptureContext): Promise<Blob>;
  release(ownerWindow: Window): void;
};

const hostCaptureAdapter: ScreenshotCaptureAdapter = {
  prepare: async () => undefined,
  capture: async ({ ownerWindow }) => {
    const captured = await captureHostScreenshotPng(ownerWindow);

    if (!captured) throw new Error("Host screenshot capture is unavailable.");

    return captured;
  },
  release: () => undefined,
};

const bridgeCaptureAdapter: ScreenshotCaptureAdapter = {
  prepare: async () => undefined,
  capture: async ({ ownerWindow }) => {
    const captured = await captureViaBridge(ownerWindow);

    if (!captured) throw new Error("Host screenshot capture failed.");

    return captured;
  },
  release: () => undefined,
};

const displayCaptureAdapter: ScreenshotCaptureAdapter = {
  prepare: async ({ ownerDocument, ownerWindow }) => {
    await startTabCapture(ownerDocument, ownerWindow);
  },
  capture: captureViaDisplayMedia,
  release: releaseTabCapture,
};

const captureAdapters = new WeakMap<Window, ScreenshotCaptureAdapter>();

const resolveCaptureAdapter = async (
  context: ScreenshotCaptureContext,
): Promise<ScreenshotCaptureAdapter> => {
  const existing = captureAdapters.get(context.ownerWindow);

  if (existing) return existing;

  let adapter = displayCaptureAdapter;

  if (hostCapture(context.ownerWindow)) {
    adapter = hostCaptureAdapter;
  } else if (await pingCaptureBridge(context.ownerWindow)) {
    adapter = bridgeCaptureAdapter;
  }

  captureAdapters.set(context.ownerWindow, adapter);

  return adapter;
};

export const prepareScreenshotCapture = async (
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  const context = { ownerDocument, ownerWindow };
  const adapter = await resolveCaptureAdapter(context);

  await adapter.prepare(context);
};

export const captureScreenshotPng: ScreenshotCaptureProvider = async (context) => {
  const adapter = await resolveCaptureAdapter(context);

  return adapter.capture(context);
};

export const releaseScreenshotCapture = (ownerWindow: Window) => {
  const adapter = captureAdapters.get(ownerWindow);

  captureAdapters.delete(ownerWindow);
  adapter?.release(ownerWindow);
};

/** @deprecated Use captureScreenshotPng(). */
export const captureVisibleTabPng: ScreenshotCaptureProvider = captureScreenshotPng;
