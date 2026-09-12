import { describe, expect, it } from "vitest";
import { TEXT_EDITOR_PAINT_GUARD_CSS } from "../src/runtime/text-editor-paint-guard";

describe("direct text editor paint guard", () => {
  it("keeps the native input and its browser selection paintless", () => {
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("opacity: 0 !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("color: transparent !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("-webkit-text-fill-color: transparent !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("caret-color: transparent !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("background: transparent !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("box-shadow: none !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("text-shadow: none !important");
    expect(TEXT_EDITOR_PAINT_GUARD_CSS).toContain("[data-mesurer-text-editor=\"true\"]::selection");
  });
});
