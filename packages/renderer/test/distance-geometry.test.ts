import { describe, expect, it } from "vitest";
import { getDistanceOverlay } from "../src/core/distances";
import { getPaddingBoxRect } from "../src/core/geometry";

describe("distance geometry", () => {
  it("anchors separated-box distance lines in their shared overlap", () => {
    const overlay = getDistanceOverlay(
      { left: 10, top: 10, width: 20, height: 20 },
      { left: 60, top: 20, width: 20, height: 40 },
      null,
      null,
      window,
    );

    expect(overlay.horizontal).toMatchObject({
      x1: 30,
      x2: 60,
      y: 25,
      value: 30,
    });
  });

  it("measures a vertical guide line to both sides of a containing box", () => {
    const overlay = getDistanceOverlay(
      { left: 50, top: 0, width: 0.5, height: 200 },
      { left: 10, top: 20, width: 100, height: 40 },
      null,
      null,
      window,
    );

    expect(overlay.edgeDistances).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: "x", side: "left", value: 40 }),
      expect.objectContaining({ axis: "x", side: "right", value: 60 }),
    ]));
    expect(overlay.horizontal?.value).toBe(40);
  });

  it("uses the padding box when measuring container spacing", () => {
    const element = document.createElement("div");
    element.style.borderLeft = "3px solid black";
    element.style.borderRight = "5px solid black";
    element.style.borderTop = "7px solid black";
    element.style.borderBottom = "11px solid black";
    document.body.append(element);

    expect(getPaddingBoxRect(
      { left: 10, top: 20, width: 100, height: 80 },
      element,
      window,
    )).toEqual({
      left: 13,
      top: 27,
      width: 92,
      height: 62,
    });

    element.remove();
  });
});
