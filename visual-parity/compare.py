from __future__ import annotations

import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("parity-artifacts")
threshold = 8
states = sorted(p.name.removeprefix("react-").removesuffix(".png") for p in out.glob("react-*.png"))


def round_numbers(value):
    if isinstance(value, float):
        return round(value, 3)
    if isinstance(value, list):
        return [round_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: round_numbers(item) for key, item in value.items()}
    return value


def metric_differences(react, solid, path=""):
    diffs = []
    if type(react) is not type(solid):
        return [{"path": path, "react": react, "solid": solid}]
    if isinstance(react, dict):
        for key in sorted(set(react) | set(solid)):
            child = f"{path}.{key}" if path else key
            if key not in react or key not in solid:
                diffs.append({"path": child, "react": react.get(key), "solid": solid.get(key)})
            else:
                diffs.extend(metric_differences(react[key], solid[key], child))
    elif isinstance(react, list):
        if len(react) != len(solid):
            diffs.append({"path": f"{path}.length", "react": len(react), "solid": len(solid)})
        for index, (left, right) in enumerate(zip(react, solid)):
            diffs.extend(metric_differences(left, right, f"{path}[{index}]"))
    elif isinstance(react, (int, float)) and isinstance(solid, (int, float)):
        if abs(float(react) - float(solid)) > 0.25:
            diffs.append({"path": path, "react": react, "solid": solid})
    elif react != solid:
        diffs.append({"path": path, "react": react, "solid": solid})
    return diffs


report = {
    "threshold_per_channel": threshold,
    "states": {},
}

for state in states:
    react_path = out / f"react-{state}.png"
    solid_path = out / f"solid-{state}.png"
    react = Image.open(react_path).convert("RGBA")
    solid = Image.open(solid_path).convert("RGBA")
    if react.size != solid.size:
        raise SystemExit(f"size mismatch for {state}: {react.size} vs {solid.size}")

    width, height = react.size
    rp = react.load()
    sp = solid.load()
    exact = 0
    thresholded = 0
    max_delta = 0
    for y in range(height):
        for x in range(width):
            delta = max(abs(rp[x, y][i] - sp[x, y][i]) for i in range(4))
            if delta:
                exact += 1
                max_delta = max(max_delta, delta)
            if delta > threshold:
                thresholded += 1

    raw_diff = ImageChops.difference(react, solid)
    boosted = ImageEnhance.Contrast(raw_diff.convert("RGB")).enhance(4.0)
    boosted = ImageEnhance.Brightness(boosted).enhance(3.0)

    label_h = 28
    gap = 8
    canvas = Image.new("RGB", (width * 3 + gap * 2, height + label_h), "white")
    canvas.paste(react.convert("RGB"), (0, label_h))
    canvas.paste(solid.convert("RGB"), (width + gap, label_h))
    canvas.paste(boosted, (width * 2 + gap * 2, label_h))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), "React upstream", fill="black")
    draw.text((width + gap + 8, 8), "Solid port", fill="black")
    draw.text((width * 2 + gap * 2 + 8, 8), "Amplified pixel diff", fill="black")
    canvas.save(out / f"comparison-{state}.png")

    react_metrics = round_numbers(json.loads((out / f"react-{state}.json").read_text()))
    solid_metrics = round_numbers(json.loads((out / f"solid-{state}.json").read_text()))
    metric_diffs = metric_differences(react_metrics, solid_metrics)

    report["states"][state] = {
        "width": width,
        "height": height,
        "total_pixels": width * height,
        "exact_diff_pixels": exact,
        "exact_diff_ratio": exact / (width * height),
        "threshold_diff_pixels": thresholded,
        "threshold_diff_ratio": thresholded / (width * height),
        "max_channel_delta": max_delta,
        "metric_difference_count": len(metric_diffs),
        "metric_differences": metric_diffs[:100],
    }

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

# Treat the pinned React implementation as a visual contract. Every captured
# state must have zero perceptible pixel drift and zero computed layout/style
# drift. The one intentional exception is Settings > General: upstream and the
# port display their own package versions, so only those two text snapshots and
# a very small version-glyph pixel region may differ.
failures = []
expected_general_metric_paths = {"settings.text", "toolbar.text"}
for state, result in report["states"].items():
    metric_paths = {item["path"] for item in result["metric_differences"]}
    if state == "settings-general":
        if result["threshold_diff_pixels"] > 250:
            failures.append(
                f"{state}: {result['threshold_diff_pixels']} perceptible pixels exceed the 250-pixel version-text budget"
            )
        if not metric_paths.issubset(expected_general_metric_paths):
            failures.append(
                f"{state}: unexpected computed metric differences: {sorted(metric_paths - expected_general_metric_paths)}"
            )
        for item in result["metric_differences"]:
            if "Version0.0.11" not in str(item["react"]) or "Version0.1.0" not in str(item["solid"]):
                failures.append(f"{state}: allowed text difference is not solely the pinned React/Solid package version")
    else:
        if result["threshold_diff_pixels"] != 0:
            failures.append(f"{state}: {result['threshold_diff_pixels']} perceptible pixels differ")
        if result["metric_difference_count"] != 0:
            failures.append(f"{state}: {result['metric_difference_count']} computed layout/style metrics differ")

if failures:
    raise SystemExit("React → Solid visual parity gate failed:\n- " + "\n- ".join(failures))

print("React → Solid visual parity gate: PASS")
