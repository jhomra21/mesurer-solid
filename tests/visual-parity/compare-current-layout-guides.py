from __future__ import annotations

import copy
import json
import math
import re
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


def verified_corner_rasterization(react, solid, contract_diffs, placement_ok, shadow_ok):
    if not placement_ok or not shadow_ok or contract_diffs:
        return False

    react_panel = react.get("panel", {})
    solid_panel = solid.get("panel", {})
    react_style = react_panel.get("style", {})
    solid_style = solid_panel.get("style", {})

    return (
        react_panel.get("rect") == solid_panel.get("rect")
        and react_style.get("borderRadius") == solid_style.get("borderRadius")
        and react_style.get("backgroundColor") == solid_style.get("backgroundColor")
    )


def corner_radius_px(contract):
    value = contract.get("panel", {}).get("style", {}).get("borderRadius", "")
    match = re.match(r"^([0-9]+(?:\\.[0-9]+)?)px$", value)

    return float(match.group(1)) if match else 0.0


def is_rounded_corner_edge_pixel(x, y, width, height, radius):
    if radius <= 0:
        return False

    left = x < radius
    right = x >= width - radius
    top = y < radius
    bottom = y >= height - radius

    if not ((left or right) and (top or bottom)):
        return False

    center_x = radius if left else width - radius
    center_y = radius if top else height - radius
    distance = math.hypot((x + 0.5) - center_x, (y + 0.5) - center_y)

    # The screenshot crop includes the antialiased rounded edge and pixels outside
    # the component surface. Those pixels can expose different page underlay even
    # when the panel itself has an identical radius/background contract.
    return distance >= radius - 0.5


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
    corner_raster_ok = verified_corner_rasterization(
        react_contract,
        solid_contract,
        contract_diffs,
        placement_ok,
        shadow_ok,
    )

    raw = ImageChops.difference(react, solid)
    pixels = raw.load()
    width, height = react.size
    thresholded = 0
    exact = 0
    ignored_corner_thresholded = 0
    max_delta = 0
    corner_radius = corner_radius_px(react_contract)

    for y in range(height):
        for x in range(width):
            delta = max(pixels[x, y])

            if delta == 0:
                continue

            exact += 1
            max_delta = max(max_delta, delta)

            if delta > threshold:
                if (
                    corner_raster_ok
                    and is_rounded_corner_edge_pixel(x, y, width, height, corner_radius)
                ):
                    ignored_corner_thresholded += 1
                else:
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
        "ignored_verified_corner_edge_pixels": ignored_corner_thresholded,
        "corner_radius_px": corner_radius,
        "max_channel_delta": max_delta,
        "verified_corner_surface": corner_raster_ok,
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
