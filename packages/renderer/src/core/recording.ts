import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeVideo,
  type VideoCodec,
} from "mediabunny";

export type RecordingExportFormat = "webm" | "mp4";

export type RecordingQuality = "low" | "medium" | "high";

export type RecordingScale = 1 | 2 | 3;

export type RecordingMediaInfo = {
  duration: number;
  width: number;
  height: number;
};

export type RecordingExportOptions = {
  format?: RecordingExportFormat;
  startTime?: number;
  endTime?: number;
  scale?: RecordingScale;
  quality?: RecordingQuality;
};

export type NormalizedRecordingExportOptions = {
  format: RecordingExportFormat;
  startTime: number;
  endTime: number;
  scale: RecordingScale;
  quality: RecordingQuality;
};

export type MediaBunnyCanvasRecorder = {
  readonly format: RecordingExportFormat;
  readonly mimeType: string;
  readonly codec: VideoCodec;
  addFrame(timestamp: number, duration?: number): Promise<void>;
  finalize(): Promise<Blob>;
  cancel(): Promise<void>;
};

const MIME_TYPE: Record<RecordingExportFormat, string> = {
  webm: "video/webm",
  mp4: "video/mp4",
};

const WEBM_CODECS: readonly VideoCodec[] = ["vp9", "vp8"];

const MP4_CODECS: readonly VideoCodec[] = ["avc"];

const quality = (value: RecordingQuality) => new Quality(value);

const finitePositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export const recordingMimeType = (format: RecordingExportFormat) => MIME_TYPE[format];

export const normalizeRecordingDimensions = (
  width: number,
  height: number,
  format: RecordingExportFormat,
) => {
  let nextWidth = Math.max(2, Math.round(finitePositive(width, 2)));
  let nextHeight = Math.max(2, Math.round(finitePositive(height, 2)));

  // AVC encoders commonly require even dimensions. Normalize at the format
  // boundary so callers do not need codec-specific dimension knowledge.
  if (format === "mp4") {
    if (nextWidth % 2 !== 0) nextWidth += 1;

    if (nextHeight % 2 !== 0) nextHeight += 1;
  }

  return { width: nextWidth, height: nextHeight };
};

export const normalizeRecordingExportOptions = (
  media: RecordingMediaInfo,
  options: RecordingExportOptions = {},
): NormalizedRecordingExportOptions => {
  const duration = Math.max(0.001, finitePositive(media.duration, 0.001));

  const startTime = Math.min(
    duration,
    Math.max(0, Number.isFinite(options.startTime) ? options.startTime ?? 0 : 0),
  );

  const requestedEnd = Number.isFinite(options.endTime) ? options.endTime ?? duration : duration;
  const endTime = Math.min(duration, Math.max(startTime + 0.001, requestedEnd));

  return {
    format: options.format ?? "webm",
    startTime,
    endTime,
    scale: options.scale ?? 1,
    quality: options.quality ?? "medium",
  };
};

const codecsForFormat = (format: RecordingExportFormat) =>
  format === "webm" ? WEBM_CODECS : MP4_CODECS;

export const selectRecordingCodec = async (
  format: RecordingExportFormat,
  width: number,
  height: number,
  frameRate: number,
  recordingQuality: RecordingQuality = "medium",
): Promise<VideoCodec | null> => {
  const dimensions = normalizeRecordingDimensions(width, height, format);
  const encoderQuality = quality(recordingQuality);

  for (const codec of codecsForFormat(format)) {
    if (await canEncodeVideo(codec, {
      width: dimensions.width,
      height: dimensions.height,
      frameRate,
      quality: encoderQuality,
    })) {
      return codec;
    }
  }

  return null;
};

export const supportedRecordingFormats = async (
  width: number,
  height: number,
  frameRate = 30,
): Promise<RecordingExportFormat[]> => {
  const formats: RecordingExportFormat[] = [];

  if (await selectRecordingCodec("webm", width, height, frameRate)) formats.push("webm");

  if (await selectRecordingCodec("mp4", width, height, frameRate)) formats.push("mp4");

  return formats;
};

const outputFormat = (format: RecordingExportFormat) =>
  format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat();

export const createMediaBunnyCanvasRecorder = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: {
    format?: RecordingExportFormat;
    frameRate?: number;
    quality?: RecordingQuality;
  } = {},
): Promise<MediaBunnyCanvasRecorder> => {
  const format = options.format ?? "webm";
  const frameRate = Math.max(1, Math.min(120, Math.round(options.frameRate ?? 30)));
  const recordingQuality = options.quality ?? "medium";
  const width = canvas.width;
  const height = canvas.height;
  const codec = await selectRecordingCodec(format, width, height, frameRate, recordingQuality);

  if (!codec) {
    throw new Error(`MediaBunny cannot encode ${format.toUpperCase()} at ${width}×${height} in this runtime.`);
  }

  const target = new BufferTarget();

  const output = new Output({
    format: outputFormat(format),
    target,
  });

  const source = new CanvasSource(canvas, {
    codec,
    quality: quality(recordingQuality),
  });

  output.addVideoTrack(source, { frameRate });
  await output.start();

  let finished = false;
  let lastTimestamp = -1;

  const finalize = async () => {
    if (finished) throw new Error("Recording session is already closed.");
    finished = true;
    source.close();
    await output.finalize();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("MediaBunny produced an empty recording.");
    }

    return new Blob([target.buffer], { type: MIME_TYPE[format] });
  };

  return {
    format,
    mimeType: MIME_TYPE[format],
    codec,
    async addFrame(timestamp, duration = 1 / frameRate) {
      if (finished) throw new Error("Recording session is already closed.");

      if (!Number.isFinite(timestamp) || timestamp < 0) {
        throw new TypeError("Recording frame timestamp must be a non-negative finite number.");
      }

      if (!Number.isFinite(duration) || duration < 0) {
        throw new TypeError("Recording frame duration must be a non-negative finite number.");
      }

      if (timestamp <= lastTimestamp) {
        throw new Error("Recording frame timestamps must increase monotonically.");
      }

      lastTimestamp = timestamp;
      await source.add(timestamp, duration);
    },
    finalize,
    async cancel() {
      if (finished) return;
      finished = true;
      source.close();

      try {
        await output.cancel();
      } catch {
        // Cancellation is best-effort. The owning plugin still releases capture resources.
      }
    },
  };
};

export const inspectMediaBunnyRecording = async (
  blob: Blob,
): Promise<RecordingMediaInfo> => {
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  try {
    if (!(await input.canRead())) throw new Error("MediaBunny cannot read the recording.");
    const track = await input.getPrimaryVideoTrack();

    if (!track) throw new Error("Recording has no video track.");

    const [duration, width, height] = await Promise.all([
      input.computeDuration(),
      track.getCodedWidth(),
      track.getCodedHeight(),
    ]);

    return {
      duration: Math.max(0.001, duration),
      width,
      height,
    };
  } finally {
    input.dispose();
  }
};

export const exportMediaBunnyRecording = async (
  blob: Blob,
  options: RecordingExportOptions = {},
): Promise<{
  blob: Blob;
  format: RecordingExportFormat;
  duration: number;
  width: number;
  height: number;
}> => {
  const media = await inspectMediaBunnyRecording(blob);

  const normalized = normalizeRecordingExportOptions(media, options);
  const dimensions = normalizeRecordingDimensions(
    media.width * normalized.scale,
    media.height * normalized.scale,
    normalized.format,
  );

  const codec = await selectRecordingCodec(
    normalized.format,
    dimensions.width,
    dimensions.height,
    30,
    normalized.quality,
  );

  if (!codec) {
    throw new Error(`MediaBunny cannot export ${normalized.format.toUpperCase()} in this runtime.`);
  }

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  const target = new BufferTarget();

  const output = new Output({
    format: outputFormat(normalized.format),
    target,
  });

  try {
    const conversion = await Conversion.init({
      input,
      output,
      trim: {
        start: normalized.startTime,
        end: normalized.endTime,
      },
      video: {
        codec,
        width: dimensions.width,
        height: dimensions.height,
        fit: "fill",
        quality: quality(normalized.quality),
        forceTranscode: true,
      },
      audio: { discard: true },
    });

    if (!conversion.isValid) {
      throw new Error(
        `MediaBunny cannot convert this recording to ${normalized.format.toUpperCase()}.`,
      );
    }

    await conversion.execute();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("MediaBunny produced an empty export.");
    }

    const result = new Blob([target.buffer], { type: MIME_TYPE[normalized.format] });
    const info = await inspectMediaBunnyRecording(result);

    return {
      blob: result,
      format: normalized.format,
      duration: info.duration,
      width: info.width,
      height: info.height,
    };
  } finally {
    input.dispose();
  }
};

export const createRecordingFilename = (
  format: RecordingExportFormat,
  now = new Date(),
) => `mesurer-recording-${now.toISOString().replace(/[:.]/g, "-")}.${format}`;
