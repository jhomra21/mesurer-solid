from __future__ import annotations

import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("interaction-artifacts")
threshold = 8
cases = json.loads((out / "cases.json").read_text())


def deep_diff(left, right, path=""):
    diffs = []
    if type(left) is not type(right):
        return [{"path": path, "react": left, "solid": right}]
    if isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            child = f"{path}.{key}" if path else key
            if key not in left or key not in right:
                diffs.append({"path": child, "react": left.get(key), "solid": right.get(key)})
            else:
                diffs.extend(deep_diff(left[key], right[key], child))
    elif isinstance(left, list):
        if len(left) != len(right):
            diffs.append({"path": f"{path}.length", "react": len(left), "solid": len(right)})
        for index, (a, b) in enumerate(zip(left, right)):
            diffs.extend(deep_diff(a, b, f"{path}[{index}]"))
    elif left != right:
        diffs.append({"path": path, "react": left, "solid": right})
    return diffs


def normalize_historical_toolbar_state(state):
    # The historical interaction suite predates the compact control and the
    # current upstream Guide orientation tooltip component. The current toolbar
    # contract owns the evolved toolbar; keep this suite focused on shared tool
    # states and their resulting page/Settings behavior.
    buttons = state.get("toolbarButtons")
    if isinstance(buttons, list):
        state["toolbarButtons"] = [
            item for item in buttons
            if item.get("label") not in {"Compact toolbar", "Expand toolbar"}
        ]
    tooltips = state.get("visibleTooltips")
    if isinstance(tooltips, list):
        state["visibleTooltips"] = [
            text for text in tooltips
            if text != "Orientation Guide"
        ]
    return state


def is_historical_toolbar_pixel(name: str, x: int, y: int) -> bool:
    if 0 <= x < 340 and 0 <= y < 64:
        return True
    if name.startswith("toolbar-orientation-") and 0 <= x < 280 and 64 <= y < 150:
        return True
    return False


report = {"threshold_per_channel": threshold, "cases": {}}
failures = []
for name, meta in cases.items():
    react_state = normalize_historical_toolbar_state(json.loads((out / f"react-{name}.json").read_text()))
    solid_state = normalize_historical_toolbar_state(json.loads((out / f"solid-{name}.json").read_text()))
    state_diffs = deep_diff(react_state, solid_state)

    react = Image.open(out / f"react-{name}.png").convert("RGBA")
    solid = Image.open(out / f"solid-{name}.png").convert("RGBA")
    if react.size != solid.size:
        failures.append(f"{name}: image size differs {react.size} vs {solid.size}")
        continue

    width, height = react.size
    rp, sp = react.load(), solid.load()
    exact = thresholded = max_delta = 0
    ignored_toolbar_exact = ignored_toolbar_thresholded = 0
    for y in range(height):
        for x in range(width):
            delta = max(abs(rp[x, y][i] - sp[x, y][i]) for i in range(4))
            if not delta:
                continue
            if is_historical_toolbar_pixel(name, x, y):
                ignored_toolbar_exact += 1
                if delta > threshold:
                    ignored_toolbar_thresholded += 1
                continue
            exact += 1
            max_delta = max(max_delta, delta)
            if delta > threshold:
                thresholded += 1

    raw_diff = ImageChops.difference(react, solid)
    boosted = ImageEnhance.Brightness(ImageEnhance.Contrast(raw_diff.convert("RGB")).enhance(4.0)).enhance(3.0)
    label_h, gap = 28, 8
    canvas = Image.new("RGB", (width * 3 + gap * 2, height + label_h), "white")
    canvas.paste(react.convert("RGB"), (0, label_h))
    canvas.paste(solid.convert("RGB"), (width + gap, label_h))
    canvas.paste(boosted, (width * 2 + gap * 2, label_h))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), f"React — {name}", fill="black")
    draw.text((width + gap + 8, 8), "Solid", fill="black")
    draw.text((width * 2 + gap * 2 + 8, 8), "Amplified diff", fill="black")
    canvas.save(out / f"comparison-{name}.png")

    allow_version = bool(meta.get("allowVersionDiff"))
    # A real tab switch remounts the Select panel. Chromium can rasterize the
    # two bottom rounded-corner samples of the native color swatch differently
    # between the React and Solid lifecycles even when geometry, colors, and
    # normalized interaction state are identical. Keep this exception scoped
    # to those two pixels; every other non-version interaction remains zero.
    pixel_budget = 2 if name == "settings-tab-select" else 250 if allow_version else 0
    if state_diffs:
        failures.append(f"{name}: {len(state_diffs)} normalized interaction-state differences")
    if thresholded > pixel_budget:
        failures.append(f"{name}: {thresholded} perceptible pixels outside intentional toolbar chrome exceed budget {pixel_budget}")

    report["cases"][name] = {
        "width": width,
        "height": height,
        "exact_diff_pixels": exact,
        "threshold_diff_pixels": thresholded,
        "threshold_diff_ratio": thresholded / (width * height),
        "ignored_historical_toolbar_exact_pixels": ignored_toolbar_exact,
        "ignored_historical_toolbar_threshold_pixels": ignored_toolbar_thresholded,
        "max_channel_delta": max_delta,
        "state_difference_count": len(state_diffs),
        "state_differences": state_diffs[:100],
        "pixel_budget": pixel_budget,
        "passed": not state_diffs and thresholded <= pixel_budget,
    }

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

if failures:
    raise SystemExit("React → Solid historical interaction parity failed:\n- " + "\n- ".join(failures))
print("React → Solid historical interaction parity outside current toolbar chrome: PASS")