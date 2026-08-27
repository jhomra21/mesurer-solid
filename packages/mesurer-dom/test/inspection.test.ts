import { describe, expect, it } from "vitest";
import { getInspectMeasurement } from "../src";

describe("DOM inspection", () => {
  it("computes the same border, padding and margin geometry used by Select", () => {
    const element = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 80 }),
      tagName: "BUTTON",
      id: "save",
      classList: { item: (index: number) => index === 0 ? "primary" : null },
    };
    const styleReader = {
      getComputedStyle: () => ({
        paddingTop: "4px",
        paddingRight: "6px",
        paddingBottom: "8px",
        paddingLeft: "10px",
        marginTop: "2px",
        marginRight: "3px",
        marginBottom: "5px",
        marginLeft: "7px",
      }),
    };

    const result = getInspectMeasurement(element, styleReader, "test-id");

    expect(result.id).toBe("test-id");
    expect(result.label).toBe("button#save.primary");
    expect(result.rect).toEqual({ left: 10, top: 20, width: 100, height: 80 });
    expect(result.padding).toEqual({ top: 4, right: 6, bottom: 8, left: 10 });
    expect(result.paddingRect).toEqual({ left: 20, top: 24, width: 84, height: 68 });
    expect(result.margin).toEqual({ top: 2, right: 3, bottom: 5, left: 7 });
    expect(result.marginRect).toEqual({ left: 3, top: 18, width: 110, height: 87 });
  });
});
