from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("current-layout-guides-parity")
threshold = 8
states = sorted(path.name.removeprefix("react-").removesuffix(".png") for path in out.glob("react-*.png"))


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
    elif left != right:
        result.append({"path": path, "react": left, "solid": right})

    return result


def visible_shadow(value):
    prefix = "rgba(0, 0, 0, 0) 0px 0px 0px 0px, "

    while value.startswith(prefix):
        value = value[len(prefix):]

    return value


def normalize_implementation_ownership(react, solid):
    react_copy = copy.deepcopy(react)
    solid_copy = copy.deepcopy(solid)
    react_ownership = react_copy.pop("ownership", {})
    solid_ownership = solid_copy.pop("ownership", {})

    placement_ok = (
        react_ownership.get("dialogPosition") == "fixed"
        and solid_ownership.get("dialogPosition") == "static"
        and solid_ownership.get("parentPosition") == "fixed"
    )

    if placement_ok:
        solid_copy["panel"]["style"]["position"] = react_copy["panel"]["style"]["position"]

    react_shadow = react_copy["panel"]["style"].get("boxShadow", "")
    solid_shadow = solid_copy["panel"]["style"].get("boxShadow", "")
    shadow_ok = visible_shadow(react_shadow) == visible_shadow(solid_shadow)

    if shadow_ok:
        normalized_shadow = visible_shadow(react_shadow)
        react_copy["panel"]["style"]["boxShadow"] = normalized_shadow
        solid_copy["panel"]["style"]["boxShadow"] = normalized_shadow

    return react_copy, solid_copy, placement_ok, shadow_ok


report = {"threshold_per_channel": threshold, "states": {}}
failures = []

for state in states:
    react = Image.open(out / f"react-{state}.png").convert("RGBA")
    solid = Image.open(out / f"solid-{state}.png").convert("RGBA")

    if react.size != solid.size:
        failures.append(f"{state}: panel size differs: React {react.size}, Solid {solid.size}")
        continue

    react_contract = json.loads((out / f"react-{state}.json").read_text())
    solid_contract = json.loads((out / f"solid-{state}.json").read_text())
    react_contract, solid_contract, placement_ok, shadow_ok = normalize_implementation_ownership(
        react_contract,
        solid_contract,
    )
    contract_diffs = differences(react_contract, solid_contract)

    raw = ImageChops.difference(react, solid)
    pixels = raw.load()
    width, height = react.size
    thresholded = 0
    exact = 0
    max_delta = 0

    for y in range(height):
        for x in range(width):
            delta = max(pixels[x, y])

            if delta == 0:
                continue

            exact += 1
            max_delta = max(max_delta, delta)

            if delta > threshold:
                thresholded += 1

    boosted = ImageEnhance.Contrast(raw.convert("RGB")).enhance(4.0)
    boosted = ImageEnhance.Brightness(boosted).enhance(3.0)
    label_h = 28
    gap = 8
    canvas = Image.new("RGB", (width * 3 + gap * 2, height + label_h), "white")
    canvas.paste(react.convert("RGB"), (0, label_h))
    canvas.paste(solid.convert("RGB"), (width + gap, label_h))
    canvas.paste(boosted, (width * 2 + gap * 2, label_h))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), "React current", fill="black")
    draw.text((width + gap + 8, 8), "Solid", fill="black")
    draw.text((width * 2 + gap * 2 + 8, 8), "Amplified diff", fill="black")
    canvas.save(out / f"comparison-{state}.png")

    report["states"][state] = {
        "width": width,
        "height": height,
        "exact_diff_pixels": exact,
        "threshold_diff_pixels": thresholded,
        "max_channel_delta": max_delta,
        "verified_fixed_position_owner": placement_ok,
        "verified_equivalent_visible_shadow": shadow_ok,
        "contract_difference_count": len(contract_diffs),
        "contract_differences": contract_diffs[:100],
    }

    if thresholded:
        failures.append(f"{state}: {thresholded} perceptible pixels differ")

    if not placement_ok:
        failures.append(f"{state}: dialog placement ownership changed")

    if not shadow_ok:
        failures.append(f"{state}: visible floating shadow differs")

    if contract_diffs:
        failures.append(
            f"{state}: {len(contract_diffs)} layout/style/semantic differences: "
            + str([item["path"] for item in contract_diffs[:12]])
        )

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

if failures:
    raise SystemExit("Current React Layout Guides parity failed:\n- " + "\n- ".join(failures))

print("Current React Layout Guides visual/UI parity: PASS")
