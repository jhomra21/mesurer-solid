from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("current-settings-parity")
threshold = 8
states = sorted(path.name.removeprefix("react-").removesuffix(".png") for path in out.glob("react-*.png"))


def rounded(value):
    """Computed colors serialize the same OKLab value with float noise below 1e-4."""
    return re.sub(r"-?\d+\.\d{4,}", lambda match: f"{float(match.group()):.3f}", value)


def differences(left, right, path="", tolerance=0.01):
    result = []

    if type(left) is not type(right):
        return [{"path": path, "react": left, "solid": right}]

    if isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            child = f"{path}.{key}" if path else key

            if key not in left or key not in right:
                result.append({"path": child, "react": left.get(key), "solid": right.get(key)})
            else:
                result.extend(differences(left[key], right[key], child, tolerance))
    elif isinstance(left, list):
        if len(left) != len(right):
            result.append({"path": f"{path}.length", "react": len(left), "solid": len(right)})

        for index, (a, b) in enumerate(zip(left, right)):
            result.extend(differences(a, b, f"{path}[{index}]", tolerance))
    elif isinstance(left, (int, float)) and isinstance(right, (int, float)):
        if abs(float(left) - float(right)) > tolerance:
            result.append({"path": path, "react": left, "solid": right})
    elif isinstance(left, str) and rounded(left) != rounded(right):
        result.append({"path": path, "react": left, "solid": right})
    elif not isinstance(left, str) and left != right:
        result.append({"path": path, "react": left, "solid": right})

    return result


frame_radius = 9


def outside_frame(x, y, width, height):
    """Corner pixels beyond the 9px rounded frame show the host page and the outer shadow, not the panel."""
    dx = frame_radius - (x + 0.5) if x < frame_radius else (x + 0.5) - (width - frame_radius) if x >= width - frame_radius else 0
    dy = frame_radius - (y + 0.5) if y < frame_radius else (y + 0.5) - (height - frame_radius) if y >= height - frame_radius else 0

    return dx > 0 and dy > 0 and dx * dx + dy * dy > frame_radius * frame_radius


report = {"threshold_per_channel": threshold, "states": {}}
failures = []

for state in states:
    react = Image.open(out / f"react-{state}.png").convert("RGBA")
    solid = Image.open(out / f"solid-{state}.png").convert("RGBA")
    react_contract = json.loads((out / f"react-{state}.json").read_text())
    solid_contract = json.loads((out / f"solid-{state}.json").read_text())

    # Placement of the dialog differs by design (upstream fixed surface vs Solid toolbar dialog); the panel is compared in its own box.
    contract_diffs = differences(react_contract, solid_contract)

    if react.size != solid.size:
        failures.append(f"{state}: panel size differs: React {react.size}, Solid {solid.size}")
        report["states"][state] = {"react_size": react.size, "solid_size": solid.size, "contract_difference_count": len(contract_diffs), "contract_differences": contract_diffs[:60]}
        continue

    raw = ImageChops.difference(react, solid)
    pixels = raw.load()
    width, height = react.size
    thresholded = 0
    exact = 0
    outside = 0
    max_delta = 0

    for y in range(height):
        for x in range(width):
            delta = max(pixels[x, y])

            if delta == 0:
                continue

            if outside_frame(x, y, width, height):
                outside += 1
                continue

            exact += 1
            max_delta = max(max_delta, delta)

            if delta > threshold:
                thresholded += 1

    boosted = ImageEnhance.Brightness(ImageEnhance.Contrast(raw.convert("RGB")).enhance(4.0)).enhance(3.0)
    label_h = 28
    gap = 8
    canvas = Image.new("RGB", (width * 3 + gap * 2, height + label_h), "white")
    canvas.paste(react.convert("RGB"), (0, label_h))
    canvas.paste(solid.convert("RGB"), (width + gap, label_h))
    canvas.paste(boosted, (width * 2 + gap * 2, label_h))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), "React 5c2fdae", fill="black")
    draw.text((width + gap + 8, 8), "Solid", fill="black")
    draw.text((width * 2 + gap * 2 + 8, 8), "Amplified diff", fill="black")
    canvas.save(out / f"comparison-{state}.png")

    report["states"][state] = {
        "width": width,
        "height": height,
        "exact_diff_pixels": exact,
        "ignored_outside_rounded_frame_pixels": outside,
        "threshold_diff_pixels": thresholded,
        "max_channel_delta": max_delta,
        "contract_difference_count": len(contract_diffs),
        "contract_differences": contract_diffs[:100],
    }

    if thresholded:
        failures.append(f"{state}: {thresholded} perceptible pixels differ")

    if contract_diffs:
        failures.append(f"{state}: {len(contract_diffs)} layout/style/semantic differences: " + str([item["path"] for item in contract_diffs[:12]]))

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps({state: {k: v for k, v in value.items() if k != "contract_differences"} for state, value in report["states"].items()}, indent=2))

if failures:
    raise SystemExit("Current React Settings parity failed:\n- " + "\n- ".join(failures))

print("Current React Settings visual/UI parity: PASS")
