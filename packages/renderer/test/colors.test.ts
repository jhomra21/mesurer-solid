import { describe, expect, it } from "vitest";
import { colorToHex, colorToHsl, colorToOklch, colorToRgb, parseCssColor } from "../src/core/colors";

describe("colors", () => {
  it("parses hex/rgb colors and formats the supported Mesurer outputs", () => {
    const red = parseCssColor("#ff0000");
    expect(red).toEqual({ red: 255, green: 0, blue: 0, alpha: 1 });
    expect(colorToHex(red!)).toBe("#ff0000");
    expect(colorToRgb(red!)).toBe("rgb(255, 0, 0)");
    expect(colorToHsl(red!)).toContain("hsl(0");
    expect(colorToOklch(red!)).toContain("oklch(");
    expect(parseCssColor("rgba(0, 128, 255, .5)")?.alpha).toBe(0.5);
  });
});
