from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("parity-artifacts")
threshold = 8
states = sorted(p.name.removeprefix("react-").removesuffix(".png") for p in out.glob("react-*.png"))
react_version = json.loads(Path("upstream/packages/mesurer/package.json").read_text())["version"]
solid_version = json.loads(Path("packages/renderer/package.json").read_text())["version"]
contract_keys = ("toolbarIconContract", "settingsContract")
# Upstream currently runs in the site's light DOM while the Solid renderer is
# deliberately isolated in a shadow root. Browser/default min-size computation
# can therefore differ between `0px` and `auto` without being a Mesurer design
# declaration or affecting rendered geometry. The contract still compares the
# actual x/y/width/height and every visual style token below.
non_design_contract_suffixes = (".style.minWidth", ".style.minHeight")
version_token = re.compile(r"Version[0-9A-Za-z.+-]+")

# This visual suite is intentionally pinned to the pre-compact v0.0.11 toolbar.
# Mesurer Solid now adopts the newer toolbar chrome/compact treatment under a
# dedicated current-browser contract. Keep this historical gate authoritative
# for page results and Settings, but do not make the old toolbar shell veto the
# explicitly adopted newer shell. The masked region contains only toolbar chrome
# plus its measured drop-shadow fringe in these fixtures; page targets begin
# much farther down the viewport.
def is_historical_toolbar_pixel(state: str, x: int, y: int) -> bool:
    if 0 <= x < 340 and 0 <= y < 64:
        return True
    if state == "orientation-menu" and 0 <= x < 280 and 64 <= y < 150:
        return True
    return False


def is_historical_toolbar_metric_difference(difference):
    path = difference["path"]
    return (
        path == "toolbar"
        or path.startswith("toolbar.")
        or path.startswith("toolbarButtons")
        or path in {"guideMenu.rect.left", "guideMenu.rect.right", "guideMenu.rect.x"}
    )


def is_historical_toolbar_contract_difference(difference):
    return difference["path"].startswith("uiContract.toolbarIconContract")


def round_numbers(value):
    if isinstance(value, float):
        return round(value, 3)
    if isinstance(value, list):
        return [round_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: round_numbers(item) for key, item in value.items()}
    return value


def metric_differences(react, solid, path="", numeric_tolerance=0.25):
    diffs = []
    if type(react) is not type(solid):
        return [{"path": path, "react": react, "solid": solid}]
    if isinstance(react, dict):
        for key in sorted(set(react) | set(solid)):
            child = f"{path}.{key}" if path else key
            if key not in react or key not in solid:
                diffs.append({"path": child, "react": react.get(key), "solid": solid.get(key)})
            else:
                diffs.extend(metric_differences(react[key], solid[key], child, numeric_tolerance))
    elif isinstance(react, list):
        if len(react) != len(solid):
            diffs.append({"path": f"{path}.length", "react": len(react), "solid": len(solid)})
        for index, (left, right) in enumerate(zip(react, solid)):
            diffs.extend(metric_differences(left, right, f"{path}[{index}]", numeric_tolerance))
    elif isinstance(react, (int, float)) and isinstance(solid, (int, float)):
        if abs(float(react) - float(solid)) > numeric_tolerance:
            diffs.append({"path": path, "react": react, "solid": solid})
    elif react != solid:
        diffs.append({"path": path, "react": react, "solid": solid})
    return diffs


def normalize_version_text(value):
    return version_token.sub("Version<version>", str(value))


def normalize_typography_label_text(value):
    # The visible Solid product label intentionally diverges while the internal
    # compatibility id and all icon/layout/style contracts remain unchanged.
    return str(value).replace("Typography A", "Text inspector A")


def normalize_allowed_settings_text(value):
    return normalize_version_text(normalize_typography_label_text(value))


def is_intentional_typography_label_difference(difference):
    """Allow only the documented Solid product-label rename; no visual/layout drift."""
    path = difference["path"]
    react = difference["react"]
    solid = difference["solid"]
    exact_label_paths = {
        "toolbarButtons[4].ariaLabel",
        "uiContract.toolbarIconContract[4].name",
    }
    if path in exact_label_paths:
        return react == "Text inspector (A)" and solid == "Typography (A)"
    if path == "toolbar.text":
        return normalize_typography_label_text(solid) == str(react)
    return False


def is_environmental_contract_difference(difference):
    return difference["path"].endswith(non_design_contract_suffixes)


report = {
    "threshold_per_channel": threshold,
    "react_version": react_version,
    "solid_version": solid_version,
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
    ignored_toolbar_exact = 0
    ignored_toolbar_thresholded = 0
    max_delta = 0
    for y in range(height):
        for x in range(width):
            delta = max(abs(rp[x, y][i] - sp[x, y][i]) for i in range(4))
            if not delta:
                continue
            if is_historical_toolbar_pixel(state, x, y):
                ignored_toolbar_exact += 1
                if delta > threshold:
                    ignored_toolbar_thresholded += 1
                continue
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
    react_contract = {key: react_metrics.pop(key, None) for key in contract_keys}
    solid_contract = {key: solid_metrics.pop(key, None) for key in contract_keys}
    raw_metric_diffs = metric_differences(react_metrics, solid_metrics)
    metric_diffs = [
        difference
        for difference in raw_metric_diffs
        if not is_historical_toolbar_metric_difference(difference)
        and not is_intentional_typography_label_difference(difference)
    ]
    raw_contract_diffs = metric_differences(
        react_contract,
        solid_contract,
        path="uiContract",
        numeric_tolerance=0.01,
    )
    contract_diffs = [
        difference
        for difference in raw_contract_diffs
        if not is_historical_toolbar_contract_difference(difference)
        and not is_environmental_contract_difference(difference)
        and not is_intentional_typography_label_difference(difference)
    ]

    report["states"][state] = {
        "width": width,
        "height": height,
        "total_pixels": width * height,
        "exact_diff_pixels": exact,
        "exact_diff_ratio": exact / (width * height),
        "threshold_diff_pixels": thresholded,
        "threshold_diff_ratio": thresholded / (width * height),
        "ignored_historical_toolbar_exact_pixels": ignored_toolbar_exact,
        "ignored_historical_toolbar_threshold_pixels": ignored_toolbar_thresholded,
        "max_channel_delta": max_delta,
        "metric_difference_count": len(metric_diffs),
        "metric_differences": metric_diffs[:100],
        "contract_difference_count": len(contract_diffs),
        "contract_differences": contract_diffs[:200],
        "ignored_historical_toolbar_metric_difference_count": sum(
            is_historical_toolbar_metric_difference(item) for item in raw_metric_diffs
        ),
        "ignored_historical_toolbar_contract_difference_count": sum(
            is_historical_toolbar_contract_difference(item) for item in raw_contract_diffs
        ),
        "ignored_environmental_contract_difference_count": sum(
            is_environmental_contract_difference(item) for item in raw_contract_diffs
        ),
        "ignored_typography_label_difference_count": sum(
            is_intentional_typography_label_difference(item)
            for item in [*raw_metric_diffs, *raw_contract_diffs]
        ),
    }

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

# The pinned React implementation remains the contract for the shared historical
# page/result/Settings surface. Toolbar chrome is now validated against the
# current Mesurer-inspired compact contract instead of this old v0.0.11 shell.
failures = []
expected_general_metric_paths = {"settings.text"}
for state, result in report["states"].items():
    if result["contract_difference_count"] != 0:
        paths = [item["path"] for item in result["contract_differences"][:10]]
        failures.append(f"{state}: {result['contract_difference_count']} explicit UI contract differences: {paths}")

    metric_paths = {item["path"] for item in result["metric_differences"]}
    if state == "settings-general":
        if result["threshold_diff_pixels"] > 400:
            failures.append(
                f"{state}: {result['threshold_diff_pixels']} perceptible pixels exceed the 400-pixel version-text budget"
            )
        if not metric_paths.issubset(expected_general_metric_paths):
            failures.append(
                f"{state}: unexpected computed metric differences: {sorted(metric_paths - expected_general_metric_paths)}"
            )
        for item in result["metric_differences"]:
            if normalize_allowed_settings_text(item["react"]) != normalize_allowed_settings_text(item["solid"]):
                failures.append(
                    f"{state}: allowed text difference is not solely the version token plus the Typography product-label rename"
                )
    else:
        if result["threshold_diff_pixels"] != 0:
            failures.append(f"{state}: {result['threshold_diff_pixels']} perceptible pixels differ outside intentional toolbar chrome")
        if result["metric_difference_count"] != 0:
            failures.append(f"{state}: {result['metric_difference_count']} computed layout/style metrics differ outside intentional toolbar chrome")

if failures:
    raise SystemExit("React → Solid visual/UI contract parity gate failed:\n- " + "\n- ".join(failures))

print("React → Solid historical page/result/Settings parity gate: PASS")
