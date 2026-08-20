from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("interaction-artifacts-3x")
out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("interaction-side-by-side-3x")
out.mkdir(parents=True, exist_ok=True)

font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
font = ImageFont.truetype(str(font_path), 42) if font_path.exists() else ImageFont.load_default()

created = 0
for react_path in sorted(source.glob("react-*.png")):
    suffix = react_path.name.removeprefix("react-")
    solid_path = source / f"solid-{suffix}"
    if not solid_path.exists():
        raise SystemExit(f"Missing Solid screenshot for {suffix}")

    react = Image.open(react_path).convert("RGB")
    solid = Image.open(solid_path).convert("RGB")
    if react.size != solid.size:
        raise SystemExit(f"Image size mismatch for {suffix}: {react.size} vs {solid.size}")

    width, height = react.size
    header_height = 72
    divider_width = 4
    canvas = Image.new("RGB", (width * 2 + divider_width, height + header_height), "white")
    canvas.paste(react, (0, header_height))
    canvas.paste(solid, (width + divider_width, header_height))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle(
        (width, header_height, width + divider_width - 1, height + header_height),
        fill=(225, 225, 225),
    )
    draw.text((24, 14), "React", fill="black", font=font)
    draw.text((width + divider_width + 24, 14), "Solid", fill="black", font=font)

    label = suffix.removesuffix(".png").replace("-", " ")
    box = draw.textbbox((0, 0), label, font=font)
    label_width = box[2] - box[0]
    draw.text(
        ((width * 2 + divider_width - label_width) / 2, 14),
        label,
        fill=(90, 90, 90),
        font=font,
    )

    canvas.save(out / f"react-vs-solid-{suffix}", "PNG", optimize=False)
    created += 1

if created == 0:
    raise SystemExit(f"No React screenshots found in {source}")

print(f"Created {created} React | Solid side-by-side screenshots in {out}")
