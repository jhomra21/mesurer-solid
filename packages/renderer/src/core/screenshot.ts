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

type ClipboardItemConstructor = new (
  items: Record<string, Blob | PromiseLike<Blob>>,
) => ClipboardItem;

export const copyPngToClipboard = async (
  png: Blob | Promise<Blob>,
  ownerWindow: Window,
) => {
  const clipboard = ownerWindow.navigator.clipboard;
  const ClipboardItemCtor = (ownerWindow as Window & {
    ClipboardItem?: ClipboardItemConstructor;
  }).ClipboardItem;
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
  const url = ownerWindow.URL.createObjectURL(png);
  const link = ownerDocument.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  ownerDocument.documentElement.append(link);
  link.click();
  link.remove();
  ownerWindow.setTimeout(() => ownerWindow.URL.revokeObjectURL(url), 1000);
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

type CaptureResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error?: string };

type ChromeRuntimeLike = {
  id?: string;
  lastError?: { message?: string };
  sendMessage(message: { type: string }, callback: (response: CaptureResponse) => void): void;
};

const extensionRuntime = (ownerWindow: Window) =>
  (ownerWindow as Window & { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime;

const captureViaExtensionRuntime = (
  runtime: ChromeRuntimeLike,
  ownerWindow: Window,
) => new Promise<Blob>((resolve, reject) => {
  try {
    runtime.sendMessage({ type: MESURER_CAPTURE_VISIBLE_MESSAGE }, (response) => {
      if (runtime.lastError?.message) {
        reject(new Error(runtime.lastError.message));
        return;
      }
      if (!response?.ok || !response.dataUrl) {
        reject(new Error(response && !response.ok ? response.error ?? "Capture failed" : "Capture failed"));
        return;
      }
      void ownerWindow.fetch(response.dataUrl)
        .then((result) => result.blob())
        .then(resolve, reject);
    });
  } catch (cause) {
    reject(cause instanceof Error ? cause : new Error("Capture failed"));
  }
});

const pingCaptureBridge = (ownerWindow: Window) =>
  new Promise<boolean>((resolve) => {
    const id = randomRequestId(ownerWindow);
    const origin = ownerWindow.location.origin;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ownerWindow || event.origin !== origin) return;
      if (event.data?.type !== MESURER_CAPTURE_BRIDGE_PONG || event.data.id !== id) return;
      ownerWindow.removeEventListener("message", onMessage);
      ownerWindow.clearTimeout(timeoutId);
      resolve(true);
    };
    const timeoutId = ownerWindow.setTimeout(() => {
      ownerWindow.removeEventListener("message", onMessage);
      resolve(false);
    }, 80);
    ownerWindow.addEventListener("message", onMessage);
    ownerWindow.postMessage({ type: MESURER_CAPTURE_BRIDGE_PING, id }, origin);
  });

const captureViaBridge = (ownerWindow: Window) =>
  new Promise<Blob | null>((resolve, reject) => {
    const id = randomRequestId(ownerWindow);
    const origin = ownerWindow.location.origin;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ownerWindow || event.origin !== origin) return;
      if (event.data?.type !== MESURER_CAPTURE_BRIDGE_RESPONSE || event.data.id !== id) return;
      ownerWindow.removeEventListener("message", onMessage);
      ownerWindow.clearTimeout(timeoutId);
      if (!event.data.ok || typeof event.data.dataUrl !== "string") {
        resolve(null);
        return;
      }
      void ownerWindow.fetch(event.data.dataUrl)
        .then((result) => result.blob())
        .then(resolve, reject);
    };
    const timeoutId = ownerWindow.setTimeout(() => {
      ownerWindow.removeEventListener("message", onMessage);
      resolve(null);
    }, 4000);
    ownerWindow.addEventListener("message", onMessage);
    ownerWindow.postMessage({ type: MESURER_CAPTURE_BRIDGE_REQUEST, id }, origin);
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
  const stream = await media.getDisplayMedia({
    audio: false,
    video: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  } as DisplayMediaStreamOptions);
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
    const capture = { stream, video } satisfies TabCapture;
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

export const releaseScreenshotCapture = (ownerWindow: Window) => {
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

export const prepareScreenshotCapture = async (
  ownerDocument: Document,
  ownerWindow: Window,
) => {
  if (extensionRuntime(ownerWindow)?.id) return;
  if (await pingCaptureBridge(ownerWindow)) return;
  await startTabCapture(ownerDocument, ownerWindow);
};

export const captureVisibleTabPng: ScreenshotCaptureProvider = async (context) => {
  const { ownerDocument, ownerWindow } = context;
  const runtime = extensionRuntime(ownerWindow);
  if (runtime?.id) return captureViaExtensionRuntime(runtime, ownerWindow);
  if (await pingCaptureBridge(ownerWindow)) {
    const bridged = await captureViaBridge(ownerWindow);
    if (bridged) return bridged;
  }
  return captureViaDisplayMedia({ ownerDocument, ownerWindow });
};
