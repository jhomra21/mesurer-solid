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
    });
  });

  it("owns container MIME types centrally", () => {
    expect(recordingMimeType("webm")).toBe("video/webm");
    expect(recordingMimeType("mp4")).toBe("video/mp4");
  });
});
