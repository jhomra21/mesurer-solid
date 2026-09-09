from __future__ import annotations

import copy
import json
import math
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
selection_owner_metric_paths = {
    "selectedMeasurement.rect.right",
    "selectedMeasurement.rect.width",
    "selectedMeasurement.style.display",
    "selectedMeasurement.style.height",
    "selectedMeasurement.style.width",
}

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


def is_selection_owner_metric_difference(state, difference):
    # The Solid native-scroll path intentionally makes the zero-height framework
    # owner `display: contents` so its visible children participate directly in
    # the document anchor tree. Compare those children by pixels/measureTag and
    # ignore only the five non-painting owner metrics this implementation detail
    # changes. Any additional selectedMeasurement metric still fails.
    return state == "selection" and difference["path"] in selection_owner_metric_paths


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


def historical_shortcuts_delta(state, react_metrics, solid_metrics):
    """Describe only the adopted current-upstream Shortcuts row missing from v0.0.11."""
    if state != "settings-general":
        return None
    react_settings = react_metrics.get("settings", {})
    solid_settings = solid_metrics.get("settings", {})
    react_contract = react_metrics.get("settingsContract", {})
    solid_contract = solid_metrics.get("settingsContract", {})
    react_controls = react_contract.get("controls", [])
    solid_controls = solid_contract.get("controls", [])
    if any(control.get("name") == "Shortcuts" for control in react_controls):
        return None
    shortcuts = [control for control in solid_controls if control.get("name") == "Shortcuts"]
    if len(shortcuts) != 1:
        return None
    shortcuts = shortcuts[0]
    persist = next((control for control in solid_controls if control.get("name") == "Persist"), None)
    if persist is None or shortcuts.get("role") != "switch" or shortcuts.get("ariaChecked") != "true":
        return None
    shortcut_rect = shortcuts.get("rect", {})
    persist_rect = persist.get("rect", {})
    shift = shortcut_rect.get("y", 0) - persist_rect.get("y", 0)
    if shift <= 0 or shortcut_rect.get("height") != persist_rect.get("height"):
        return None
    if abs(shift - (shortcut_rect.get("height", 0) + 4)) > 0.01:
        return None
    if shortcut_rect.get("x") != persist_rect.get("x") or shortcut_rect.get("width") != persist_rect.get("width"):
        return None
    react_rect = react_settings.get("rect", {})
    solid_rect = solid_settings.get("rect", {})
    if abs((solid_rect.get("height", 0) - react_rect.get("height", 0)) - shift) > 0.01:
        return None
    return {
        "shift": shift,
        "panel_left": solid_rect.get("left", solid_rect.get("x", 0)),
        "panel_right": solid_rect.get("right", solid_rect.get("x", 0) + solid_rect.get("width", 0)),
        "react_bottom": react_rect.get("bottom", react_rect.get("y", 0) + react_rect.get("height", 0)),
        "solid_bottom": solid_rect.get("bottom", solid_rect.get("y", 0) + solid_rect.get("height", 0)),
        "persist_bottom": persist_rect.get("y", 0) + persist_rect.get("height", 0),
        "shortcut_y": shortcut_rect.get("y", 0),
    }


def normalize_historical_shortcuts_metrics(solid_metrics, feature):
    if feature is None:
        return solid_metrics
    normalized = copy.deepcopy(solid_metrics)
    shift = feature["shift"]
    settings = normalized.get("settings", {})
    settings["text"] = str(settings.get("text", "")).replace("Shortcuts", "", 1)
    settings_rect = settings.get("rect", {})
    if "height" in settings_rect:
        settings_rect["height"] -= shift
    if "bottom" in settings_rect:
        settings_rect["bottom"] -= shift
    style = settings.get("style", {})
    height = style.get("height")
    if isinstance(height, str) and height.endswith("px"):
        style["height"] = f"{float(height[:-2]) - shift:g}px"

    settings_contract = normalized.get("settingsContract", {})
    if "rect" in settings_contract and "height" in settings_contract["rect"]:
        settings_contract["rect"]["height"] -= shift
    controls = []
    for control in settings_contract.get("controls", []):
        if control.get("name") == "Shortcuts":
            continue
        control = copy.deepcopy(control)
        control["index"] = len(controls)
        if control.get("rect", {}).get("y", 0) > feature["shortcut_y"]:
            control["rect"]["y"] -= shift
        controls.append(control)
    settings_contract["controls"] = controls
    return normalized


def selection_label_region(state, react_metrics, solid_metrics):
    """Return the verified label rectangle whose glyph AA may differ by engine."""
    if state != "selection":
        return None
    react_label = react_metrics.get("measureTag")
    solid_label = solid_metrics.get("measureTag")
    if not isinstance(react_label, dict) or not isinstance(solid_label, dict):
        return None
    # Do not mask the label unless every captured semantic/geometry/style metric
    # already matches. This confines the exception to text rasterization only.
    if metric_differences(react_label, solid_label):
        return None
    rect = react_label.get("rect")
    if not isinstance(rect, dict):
        return None
    left = rect.get("left", rect.get("x"))
    top = rect.get("top", rect.get("y"))
    right = rect.get("right")
    bottom = rect.get("bottom")
    if not all(isinstance(value, (int, float)) for value in (left, top, right, bottom)):
        return None
    return {
        "left": math.floor(left),
        "top": math.floor(top),
        "right": math.ceil(right),
        "bottom": math.ceil(bottom),
    }


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

    react_metrics = round_numbers(json.loads((out / f"react-{state}.json").read_text()))
    solid_metrics = round_numbers(json.loads((out / f"solid-{state}.json").read_text()))
    shortcuts_feature = historical_shortcuts_delta(state, react_metrics, solid_metrics)
    solid_metrics = normalize_historical_shortcuts_metrics(solid_metrics, shortcuts_feature)
    label_region = selection_label_region(state, react_metrics, solid_metrics)

    width, height = react.size
    rp = react.load()
    sp = solid.load()
    exact = 0
    thresholded = 0
    ignored_toolbar_exact = 0
    ignored_toolbar_thresholded = 0
    ignored_shortcuts_exact = 0
    ignored_shortcuts_thresholded = 0
    ignored_selection_label_exact = 0
    ignored_selection_label_thresholded = 0
    max_delta = 0
    for y in range(height):
        for x in range(width):
            solid_y = y
            ignore_shortcuts_pixel = False
            if shortcuts_feature is not None:
                # The current-upstream row adds exactly one 28px Settings row. Compare the
                # historical panel contents after that insertion at their shifted position,
                # then ignore only the extra panel/shadow tail that has no v0.0.11 counterpart.
                left = max(0, int(shortcuts_feature["panel_left"] - 16))
                right = min(width, int(shortcuts_feature["panel_right"] + 16))
                react_shadow_bottom = int(shortcuts_feature["react_bottom"] + 12)
                solid_shadow_bottom = int(shortcuts_feature["solid_bottom"] + 12)
                if left <= x < right and y >= shortcuts_feature["persist_bottom"]:
                    if y < react_shadow_bottom and y + shortcuts_feature["shift"] < height:
                        solid_y = int(y + shortcuts_feature["shift"])
                    elif y < solid_shadow_bottom:
                        ignore_shortcuts_pixel = True

            raw_delta = max(abs(rp[x, y][i] - sp[x, y][i]) for i in range(4))
            if ignore_shortcuts_pixel:
                if raw_delta:
                    ignored_shortcuts_exact += 1
                    if raw_delta > threshold:
                        ignored_shortcuts_thresholded += 1
                continue

            delta = max(abs(rp[x, y][i] - sp[x, solid_y][i]) for i in range(4))
            if not delta:
                continue
            if is_historical_toolbar_pixel(state, x, y):
                ignored_toolbar_exact += 1
                if delta > threshold:
                    ignored_toolbar_thresholded += 1
                continue
            if (
                label_region is not None
                and label_region["left"] <= x < label_region["right"]
                and label_region["top"] <= y < label_region["bottom"]
            ):
                ignored_selection_label_exact += 1
                if delta > threshold:
                    ignored_selection_label_thresholded += 1
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

    react_contract = {key: react_metrics.pop(key, None) for key in contract_keys}
    solid_contract = {key: solid_metrics.pop(key, None) for key in contract_keys}
    raw_metric_diffs = metric_differences(react_metrics, solid_metrics)
    metric_diffs = [
        difference
        for difference in raw_metric_diffs
        if not is_historical_toolbar_metric_difference(difference)
        and not is_intentional_typography_label_difference(difference)
        and not is_selection_owner_metric_difference(state, difference)
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
        "ignored_current_shortcuts_exact_pixels": ignored_shortcuts_exact,
        "ignored_current_shortcuts_threshold_pixels": ignored_shortcuts_thresholded,
        "ignored_selection_label_exact_pixels": ignored_selection_label_exact,
        "ignored_selection_label_threshold_pixels": ignored_selection_label_thresholded,
        "normalized_current_shortcuts_setting": shortcuts_feature is not None,
        "normalized_selection_label_rasterization": label_region is not None,
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
        "ignored_selection_owner_metric_difference_count": sum(
            is_selection_owner_metric_difference(state, item) for item in raw_metric_diffs
        ),
    }

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

# The pinned React implementation remains the contract for the shared historical
# page/result/Settings surface. Toolbar chrome and the current-upstream Shortcuts
# row are validated by dedicated current Chromium contracts instead of being
# vetoed by the older v0.0.11 fixture.
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
