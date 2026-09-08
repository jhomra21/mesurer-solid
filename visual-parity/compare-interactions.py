from __future__ import annotations

import json
import math
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


def normalize_current_shortcuts_state(react_state, solid_state):
    """Normalize only the exact current-upstream Shortcuts switch missing from v0.0.11."""
    react_switches = react_state.get("switches")
    solid_switches = solid_state.get("switches")
    if not isinstance(react_switches, list) or not isinstance(solid_switches, list):
        return False
    if any(item.get("text") == "Shortcuts" for item in react_switches):
        return False
    shortcuts = [item for item in solid_switches if item.get("text") == "Shortcuts"]
    if shortcuts != [{"text": "Shortcuts", "checked": "true"}]:
        return False
    without_shortcuts = [item for item in solid_switches if item.get("text") != "Shortcuts"]
    if without_shortcuts != react_switches:
        return False
    solid_state["switches"] = without_shortcuts
    return True


def is_historical_toolbar_pixel(name: str, x: int, y: int) -> bool:
    if 0 <= x < 340 and 0 <= y < 64:
        return True
    if name.startswith("toolbar-orientation-") and 0 <= x < 280 and 64 <= y < 150:
        return True
    return False


def current_shortcuts_pixel(name: str, x: int, y: int, enabled: bool, height: int):
    if not enabled:
        return y, False
    # The shared parity fixture's General panel is x=16..288. Current upstream
    # inserts one 24px Shortcuts row plus the existing 4px row gap after Persist,
    # shifting the historical remainder by exactly 28px. Include only the known
    # 16px horizontal / 12px vertical shadow fringe already measured by this
    # fixture. The feature-specific Chromium contract owns the inserted row.
    if not (
        name in {
            "toolbar-settings-open",
            "settings-tab-general",
            "settings-general-persist-toggle",
            "settings-general-use-defaults",
            "settings-general-clear-workspace",
        }
        and 0 <= x < 304
        and y >= 129
    ):
        return y, False
    shift = 28
    historical_shadow_bottom = 244
    current_shadow_bottom = 272
    if y < historical_shadow_bottom and y + shift < height:
        return y + shift, False
    if y < current_shadow_bottom:
        return y, True
    return y, False


def verified_selection_label_region(name, react_label, solid_label):
    """Return the selection-label box only after its visible contract matches."""
    if name != "action-select-target":
        return None
    if not isinstance(react_label, dict) or not isinstance(solid_label, dict):
        return None
    if react_label.get("tag") != solid_label.get("tag"):
        return None
    if react_label.get("text") != solid_label.get("text"):
        return None
    if react_label.get("style") != solid_label.get("style"):
        return None

    react_rect = react_label.get("rect")
    solid_rect = solid_label.get("rect")
    if not isinstance(react_rect, dict) or not isinstance(solid_rect, dict):
        return None
    for key in ("x", "y", "width", "height", "top", "right", "bottom", "left"):
        left = react_rect.get(key)
        right = solid_rect.get(key)
        if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
            return None
        if abs(float(left) - float(right)) > 0.25:
            return None

    return {
        "left": math.floor(react_rect["left"]),
        "top": math.floor(react_rect["top"]),
        "right": math.ceil(react_rect["right"]),
        "bottom": math.ceil(react_rect["bottom"]),
    }


report = {"threshold_per_channel": threshold, "cases": {}}
failures = []
for name, meta in cases.items():
    react_state = normalize_historical_toolbar_state(json.loads((out / f"react-{name}.json").read_text()))
    solid_state = normalize_historical_toolbar_state(json.loads((out / f"solid-{name}.json").read_text()))
    react_selection_label = react_state.pop("selectionLabel", None)
    solid_selection_label = solid_state.pop("selectionLabel", None)
    selection_label_region = verified_selection_label_region(
        name,
        react_selection_label,
        solid_selection_label,
    )
    normalized_shortcuts = normalize_current_shortcuts_state(react_state, solid_state)
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
    ignored_shortcuts_exact = ignored_shortcuts_thresholded = 0
    ignored_selection_label_exact = ignored_selection_label_thresholded = 0
    for y in range(height):
        for x in range(width):
            solid_y, ignore_shortcuts = current_shortcuts_pixel(name, x, y, normalized_shortcuts, height)
            raw_delta = max(abs(rp[x, y][i] - sp[x, y][i]) for i in range(4))
            if ignore_shortcuts:
                if raw_delta:
                    ignored_shortcuts_exact += 1
                    if raw_delta > threshold:
                        ignored_shortcuts_thresholded += 1
                continue
            delta = max(abs(rp[x, y][i] - sp[x, solid_y][i]) for i in range(4))
            if not delta:
                continue
            if is_historical_toolbar_pixel(name, x, y):
                ignored_toolbar_exact += 1
                if delta > threshold:
                    ignored_toolbar_thresholded += 1
                continue
            if (
                selection_label_region is not None
                and selection_label_region["left"] <= x < selection_label_region["right"]
                and selection_label_region["top"] <= y < selection_label_region["bottom"]
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
    if name == "action-select-target" and selection_label_region is None:
        failures.append(f"{name}: selected measurement label contract did not match")
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
        "ignored_current_shortcuts_exact_pixels": ignored_shortcuts_exact,
        "ignored_current_shortcuts_threshold_pixels": ignored_shortcuts_thresholded,
        "ignored_selection_label_exact_pixels": ignored_selection_label_exact,
        "ignored_selection_label_threshold_pixels": ignored_selection_label_thresholded,
        "normalized_current_shortcuts_setting": normalized_shortcuts,
        "verified_selection_label_contract": selection_label_region is not None,
        "max_channel_delta": max_delta,
        "state_difference_count": len(state_diffs),
        "state_differences": state_diffs[:100],
        "pixel_budget": pixel_budget,
        "passed": (
            not state_diffs
            and thresholded <= pixel_budget
            and (name != "action-select-target" or selection_label_region is not None)
        ),
    }

(out / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))

if failures:
    raise SystemExit("React → Solid historical interaction parity failed:\n- " + "\n- ".join(failures))
print("React → Solid historical interaction parity outside current toolbar chrome: PASS")