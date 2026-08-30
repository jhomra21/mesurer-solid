from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} occurrences, found {count}: {old!r}")
    target.write_text(source.replace(old, new, expected))


settings = "packages/renderer/src/components/SettingsPanel.tsx"
replace_exact(
    settings,
    'class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:px-2 msr:py-1" data-mesurer-plugin-settings-controls={plugin.id}',
    'class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:py-1 msr:pl-2" data-mesurer-plugin-settings-controls={plugin.id}',
)

contract = "visual-parity/plugin-settings-contract.mjs"
replace_exact(
    contract,
    '''const persistTrackX = async (dialog) => {
  const track = dialog.getByRole("switch", { name: "Persist", exact: true }).locator(".mesurer-switch-track");
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error("Persist toggle track has no bounding box");
  return box.x;
};''',
    '''const switchTrackX = async (control, label) => {
  const track = control.locator(".mesurer-switch-track");
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error(`${label} toggle track has no bounding box`);
  return box.x;
};
const persistTrackX = async (dialog) => switchTrackX(
  dialog.getByRole("switch", { name: "Persist", exact: true }),
  "Persist",
);''',
)
replace_exact(
    contract,
    '''  await arrangeSnapping.waitFor({ state: "visible" });
  await expectChecked(arrangeSnapping, true, "Arrange snapping default");''',
    '''  await arrangeSnapping.waitFor({ state: "visible" });
  const persistX = await persistTrackX(dialog);
  const snappingX = await switchTrackX(arrangeSnapping, "Arrange snapping");
  if (Math.abs(persistX - snappingX) > 0.5) {
    throw new Error(`Expanded Arrange setting is not aligned with Persist: ${JSON.stringify({ persistX, snappingX })}`);
  }
  await expectChecked(arrangeSnapping, true, "Arrange snapping default");''',
)
replace_exact(
    contract,
    '''  await expectChecked(autoCopy, false, "Auto-copy default");
  await expectChecked(autoDownload, false, "Auto-download default");''',
    '''  const autoCopyX = await switchTrackX(autoCopy, "Screenshot Auto-copy");
  const screenshotPersistX = await persistTrackX(dialog);
  if (Math.abs(screenshotPersistX - autoCopyX) > 0.5) {
    throw new Error(`Expanded Screenshot setting is not aligned with Persist: ${JSON.stringify({ persistX: screenshotPersistX, autoCopyX })}`);
  }
  await expectChecked(autoCopy, false, "Auto-copy default");
  await expectChecked(autoDownload, false, "Auto-download default");''',
)

print("Aligned expanded plugin setting switches with Persist and plugin lifecycle switches.")
