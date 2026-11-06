import { describe, expect, it } from "vitest";
import {
  normalizeRecordingDimensions,
  normalizeRecordingExportOptions,
  recordingMimeType,
} from "../src/core/recording";

describe("recording core", () => {
  it("normalizes AVC dimensions to even pixels", () => {
    expect(normalizeRecordingDimensions(321, 181, "mp4")).toEqual({
      width: 322,
      height: 182,
    });
    expect(normalizeRecordingDimensions(321, 181, "webm")).toEqual({
      width: 321,
      height: 181,
    });
  });

  it("clamps trim boundaries and keeps public defaults deterministic", () => {
    expect(
      normalizeRecordingExportOptions(
        { duration: 4, width: 640, height: 360 },
        { startTime: -2, endTime: 99, scale: 2 },
      ),
    ).toEqual({
      format: "webm",
      startTime: 0,
      endTime: 4,
      scale: 2,
      quality: "medium",
      speed: 1,
    });
  });

  it("accepts only offered speeds and defaults only an omitted speed", () => {
    const media = { duration: 4, width: 640, height: 360 };

    for (const speed of [0.5, 1, 1.5, 2] as const) {
      expect(normalizeRecordingExportOptions(media, { speed }).speed).toBe(speed);
    }

    expect(normalizeRecordingExportOptions(media, {}).speed).toBe(1);

    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 3, "2", null]) {
      // SAFETY: the test deliberately passes values outside RecordingSpeed to prove the runtime boundary rejects them.
      expect(() => normalizeRecordingExportOptions(media, { speed } as never)).toThrow(/speed/i);
    }
  });

  it("owns container MIME types centrally", () => {
    expect(recordingMimeType("webm")).toBe("video/webm");
    expect(recordingMimeType("mp4")).toBe("video/mp4");
  });
});
