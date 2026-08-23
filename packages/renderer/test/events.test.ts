import { describe, expect, it, vi } from "vitest";
import { trySetPointerCapture } from "../src/core/events";

describe("pointer capture guards", () => {
  it("treats expected owner-realm pointer races as unavailable", () => {
    const target = {
      ownerDocument: document,
      setPointerCapture: vi.fn(() => {
        throw new window.DOMException("No active pointer", "NotFoundError");
      }),
    };

    expect(trySetPointerCapture(target, 1)).toBe(false);
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("rethrows unexpected pointer-capture failures", () => {
    const failure = new Error("unexpected capture failure");
    const target = {
      ownerDocument: document,
      setPointerCapture: vi.fn(() => { throw failure; }),
    };

    expect(() => trySetPointerCapture(target, 1)).toThrow(failure);
  });

  it("reports unsupported pointer capture without throwing", () => {
    expect(trySetPointerCapture({ ownerDocument: document }, 1)).toBe(false);
  });
});
