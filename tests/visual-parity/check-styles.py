from pathlib import Path

upstream = Path("upstream/packages/mesurer/styles.css").read_text()
solid = Path("packages/renderer/src/styles.css").read_text()

normalized_upstream = upstream.rstrip() + "\n"
if not solid.startswith(normalized_upstream):
    raise SystemExit(
        "Solid styles.css no longer contains the pinned upstream Mesurer stylesheet verbatim as its base"
    )

suffix = solid[len(normalized_upstream):]
allowed_markers = (
    ".mesurer-solid-root",
    "body.mesurer-solid-xray",
)
if suffix.strip() and not all(marker in suffix for marker in allowed_markers):
    raise SystemExit("Unexpected Solid-only stylesheet suffix; review visual parity intentionally")

print(f"Upstream stylesheet prefix: exact ({len(normalized_upstream.encode())} bytes)")
print(f"Solid compatibility suffix: {len(suffix.encode())} bytes")
