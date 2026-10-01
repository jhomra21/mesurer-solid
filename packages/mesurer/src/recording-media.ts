import {
  WEBM,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";

export type RecordingRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RecordingQuality = "low" | "medium" | "high";
export type RecordingFormat = "webm" | "mp4";

export type RecordingEngineOptions = {
  rect: RecordingRect;
  ownerWindow: Window;
  frameRate: number;
  quality: RecordingQuality;
};

export type RecordingMediaResult = {
  blob: Blob;
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
};

export type RecordingExportMediaOptions = {
  format: RecordingFormat;
  start?: number;
  end?: number;
  scale?: number;
  quality?: RecordingQuality;
  frameRate?: number;
};

const quality = (value: RecordingQuality) => new Quality(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const evenDimension = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * Map a layout-viewport region into a display-capture frame. Browser tab
 * capture may be letterboxed while a viewport is resizing, so this accounts
 * for both matching-scale and uniformly-fitted frames before cropping.
 */
export const placeRecordingRectInVideo = (
  rect: RecordingRect,
  videoWidth: number,
  videoHeight: number,
  viewport: { width: number; height: number },
) => {
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const scaleX = videoWidth / viewportWidth;
  const scaleY = videoHeight / viewportHeight;
  const scalesMatch = Math.abs(scaleX - scaleY) <= 0.01 * Math.max(scaleX, scaleY);
  const scale = scalesMatch ? scaleX : Math.min(scaleX, scaleY);
  const padX = scalesMatch ? 0 : (videoWidth - viewportWidth * scale) / 2;
  const padY = scalesMatch ? 0 : (videoHeight - viewportHeight * scale) / 2;
  const mapX = scalesMatch ? scaleX : scale;
  const mapY = scalesMatch ? scaleY : scale;
  const left = clamp(padX + rect.left * mapX, 0, videoWidth);
  const top = clamp(padY + rect.top * mapY, 0, videoHeight);
  const right = clamp(padX + (rect.left + rect.width) * mapX, 0, videoWidth);
  const bottom = clamp(padY + (rect.top + rect.height) * mapY, 0, videoHeight);
  const sx = Math.max(0, Math.round(left));
  const sy = Math.max(0, Math.round(top));
  const ex = Math.min(videoWidth, Math.round(right));
  const ey = Math.min(videoHeight, Math.round(bottom));

  return {
    sx,
    sy,
    sw: Math.max(1, ex - sx),
    sh: Math.max(1, ey - sy),
  };
};

const preferredCodec = async (
  format: RecordingFormat,
  width: number,
  height: number,
  frameRate: number,
  selectedQuality: RecordingQuality,
): Promise<VideoCodec> => {
  const outputFormat = format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  const supported = outputFormat.getSupportedVideoCodecs();
  const preference: VideoCodec[] = format === "mp4"
    ? ["avc", "hevc", "av1", "vp9"]
    : ["vp9", "vp8", "av1"];
  const codec = await getFirstEncodableVideoCodec(
    preference.filter((candidate) => supported.includes(candidate)),
    { width, height, frameRate, quality: quality(selectedQuality) },
  );

  if (!codec) throw new Error(`${format.toUpperCase()} video encoding is unavailable in this browser.`);
  return codec;
};

export class MediaBunnyRecordingSession {
  readonly rect: RecordingRect;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly codec: VideoCodec;
  readonly ended: Promise<void>;

  private readonly ownerWindow: Window;
  private readonly stream: MediaStream;
  private readonly source: MediaStreamVideoTrackSource;
  private readonly output: Output<WebMOutputFormat, BufferTarget>;
  private readonly startedAt: number;
  private sourceError: unknown = null;
  private stopping: Promise<RecordingMediaResult> | null = null;
  private active = true;

  private constructor(args: {
    rect: RecordingRect;
    width: number;
    height: number;
    frameRate: number;
    codec: VideoCodec;
    ownerWindow: Window;
    stream: MediaStream;
    source: MediaStreamVideoTrackSource;
    output: Output<WebMOutputFormat, BufferTarget>;
    track: MediaStreamTrack;
  }) {
    this.rect = args.rect;
    this.width = args.width;
    this.height = args.height;
    this.frameRate = args.frameRate;
    this.codec = args.codec;
    this.ownerWindow = args.ownerWindow;
    this.stream = args.stream;
    this.source = args.source;
    this.output = args.output;
    this.startedAt = args.ownerWindow.performance.now();
    this.ended = new Promise<void>((resolve) => {
      if (args.track.readyState === "ended") resolve();
      else args.track.addEventListener("ended", () => resolve(), { once: true });
    });
    void args.source.errorPromise.catch((cause) => {
      this.sourceError = cause;
    });
  }

  static async start(options: RecordingEngineOptions): Promise<MediaBunnyRecordingSession> {
    const { ownerWindow, rect } = options;
    const mediaDevices = ownerWindow.navigator.mediaDevices;
    if (!mediaDevices?.getDisplayMedia) throw new Error("Screen recording is unavailable in this browser.");

    const stream = await mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: options.frameRate, max: options.frameRate } },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("No video track was selected.");
    }

    const settings = track.getSettings();
    if (settings.displaySurface && settings.displaySurface !== "browser") {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("Select the current browser tab to record a Mesurer region.");
    }

    const ratio = ownerWindow.devicePixelRatio || 1;
    const width = evenDimension(rect.width * ratio);
    const height = evenDimension(rect.height * ratio);
    const codec = await preferredCodec("webm", width, height, options.frameRate, options.quality);
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const source = new MediaStreamVideoTrackSource(track, {
      codec,
      quality: quality(options.quality),
      latencyMode: "realtime",
      sizeChangeBehavior: "passThrough",
      transform: {
        frameRate: options.frameRate,
        process: async (sample) => {
          const crop = placeRecordingRectInVideo(rect, sample.displayWidth, sample.displayHeight, {
            width: ownerWindow.innerWidth,
            height: ownerWindow.innerHeight,
          });
          return sample.transform({
            crop: { left: crop.sx, top: crop.sy, width: crop.sw, height: crop.sh },
            width,
            height,
            fit: "fill",
            roundDimensionsTo: 2,
            alpha: "discard",
          });
        },
      },
    }, { frameRate: options.frameRate, timestampBase: "zero" });
    output.addVideoTrack(source, { frameRate: options.frameRate });

    try {
      await output.start();
      return new MediaBunnyRecordingSession({
        rect: { ...rect },
        width,
        height,
        frameRate: options.frameRate,
        codec,
        ownerWindow,
        stream,
        source,
        output,
        track,
      });
    } catch (cause) {
      stream.getTracks().forEach((item) => item.stop());
      void output.cancel().catch(() => undefined);
      throw cause;
    }
  }

  elapsed(): number {
    return Math.max(0, (this.ownerWindow.performance.now() - this.startedAt) / 1000);
  }

  async stop(): Promise<RecordingMediaResult> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      this.active = false;
      this.source.close();
      try {
        await this.output.finalize();
        if (this.sourceError) throw this.sourceError;
        const buffer = this.output.target.buffer;
        if (!buffer) throw new Error("MediaBunny finalized the recording without output data.");
        const mimeType = await this.output.getMimeType();
        return {
          blob: new Blob([buffer], { type: mimeType }),
          duration: Math.max(0.1, this.elapsed()),
          width: this.width,
          height: this.height,
          frameRate: this.frameRate,
          codec: this.codec,
        };
      } finally {
        this.cleanupCapture();
      }
    })();
    return this.stopping;
  }

  cancel() {
    if (!this.active && this.stopping) return;
    this.active = false;
    this.source.close();
    void this.output.cancel().catch(() => undefined);
    this.cleanupCapture();
  }

  private cleanupCapture() {
    this.stream.getTracks().forEach((track) => track.stop());
  }
}

export const supportedRecordingFormats = async (
  width = 1280,
  height = 720,
  frameRate = 30,
  selectedQuality: RecordingQuality = "medium",
): Promise<RecordingFormat[]> => {
  const formats: RecordingFormat[] = [];
  for (const format of ["webm", "mp4"] as const) {
    try {
      await preferredCodec(format, evenDimension(width), evenDimension(height), frameRate, selectedQuality);
      formats.push(format);
    } catch {
      // Only report formats that can actually be encoded in the current browser.
    }
  }
  return formats;
};

export async function exportRecordingMedia(
  sourceBlob: Blob,
  sourceSize: { width: number; height: number },
  options: RecordingExportMediaOptions,
): Promise<RecordingMediaResult> {
  const scale = clamp(options.scale ?? 1, 0.25, 3);
  const width = evenDimension(sourceSize.width * scale);
  const height = evenDimension(sourceSize.height * scale);
  const frameRate = clamp(Math.round(options.frameRate ?? 30), 1, 60);
  const selectedQuality = options.quality ?? "medium";
  const format = options.format;
  const outputFormat = format === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat();
  const codec = await preferredCodec(format, width, height, frameRate, selectedQuality);
  const output = new Output({ format: outputFormat, target: new BufferTarget() });
  const input = new Input({ formats: [WEBM], source: new BlobSource(sourceBlob) });
  const sourceDuration = await input.computeDuration();
  const start = clamp(options.start ?? 0, 0, sourceDuration);
  const end = clamp(options.end ?? sourceDuration, Math.min(sourceDuration, start + 0.01), sourceDuration);
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    trim: { start, end },
    video: {
      width,
      height,
      fit: "fill",
      frameRate,
      codec,
      quality: quality(selectedQuality),
      forceTranscode: true,
      alpha: "discard",
    },
    audio: { discard: true },
    copy: false,
  });

  if (!conversion.isValid) {
    input.dispose();
    throw new Error(`${format.toUpperCase()} export is unavailable for this recording.`);
  }

  try {
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("MediaBunny conversion completed without output data.");
    const mimeType = await output.getMimeType();
    return {
      blob: new Blob([buffer], { type: mimeType }),
      duration: Math.max(0.1, end - start),
      width,
      height,
      frameRate,
      codec,
    };
  } catch (cause) {
    await conversion.cancel().catch(() => undefined);
    throw cause;
  } finally {
    input.dispose();
  }
}
