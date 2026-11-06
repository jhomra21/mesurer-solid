"""Historical v0.0.11 guide stroke normalization for the React -> Solid suites.

v0.0.11 paints a selected guide 2px wide starting at HITBOX/2 - 1, so it covers
`position - 1` and `position`. Mesurer Solid adopts upstream d46b908: the
configured 1px weight at HITBOX/2 - floor((weight - 1) / 2), which covers only
`position`. guide-drag-contract.mjs proves that current geometry in the browser.

The one pixel line React alone paints is excluded only after the capture proves
that shape, so any other guide drift still fails the gate.
"""

from __future__ import annotations

HITBOX = 14


def historical_guide_stroke(react, solid, rect):
    """Return ("vertical" | "horizontal", index) of the line to exclude, or None."""
    if not isinstance(rect, dict):
        return None
    width, height = react.size
    left, top = rect.get("left"), rect.get("top")
    if rect.get("width") == HITBOX and rect.get("height") == height:
        orientation, position, length = "vertical", left, height
    elif rect.get("height") == HITBOX and rect.get("width") == width:
        orientation, position, length = "horizontal", top, width
    else:
        return None
    if not isinstance(position, (int, float)) or position != int(position):
        return None
    position = int(position) + HITBOX // 2
    extent = width if orientation == "vertical" else height
    if not 1 <= position < extent:
        return None

    rp, sp = react.load(), solid.load()

    def pixel(image, index, along):
        return image[(index, along) if orientation == "vertical" else (along, index)]

    for along in range(length):
        # Solid paints exactly the guide's rounded position, matching React there.
        if pixel(rp, position, along) != pixel(sp, position, along):
            return None
        # React's extra 2px-stroke pixel is the same paint as the shared one.
        if pixel(rp, position - 1, along) != pixel(rp, position, along):
            return None
    return orientation, position - 1


def is_historical_guide_stroke_pixel(stroke, x, y):
    if stroke is None:
        return False
    orientation, index = stroke
    return x == index if orientation == "vertical" else y == index
