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
    '<span class="msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{props.label}</span>',
    '<span class="mesurer-plugin-setting-label msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap msr:pl-6">{props.label}</span>',
)
replace_exact(
    settings,
    '<span class="msr:col-start-1 msr:min-w-0 msr:truncate msr:whitespace-nowrap msr:px-2 msr:text-[11px] msr:text-ink-600">{plugin.label}</span>',
    '<span data-mesurer-plugin-label={plugin.id} class="msr:col-start-1 msr:min-w-0 msr:truncate msr:whitespace-nowrap msr:px-2 msr:text-[11px] msr:text-ink-600">{plugin.label}</span>',
)

contract = "visual-parity/plugin-settings-contract.mjs"
replace_exact(
    contract,
    '''const persistTrackX = async (dialog) => switchTrackX(
  dialog.getByRole("switch", { name: "Persist", exact: true }),
  "Persist",
);''',
    '''const persistTrackX = async (dialog) => switchTrackX(
  dialog.getByRole("switch", { name: "Persist", exact: true }),
  "Persist",
);
const leftX = async (locator, label) => {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box.x;
};
const expectNestedLabelHierarchy = async (dialog, pluginId, controlLabels, label) => {
  const pluginX = await leftX(dialog.locator(`[data-mesurer-plugin-label='${pluginId}']`), `${label} plugin label`);
  const controls = controlLabels.map((controlLabel) => dialog.getByRole("switch", { name: controlLabel, exact: true }).locator(".mesurer-plugin-setting-label"));
  const positions = await Promise.all(controls.map((control, index) => leftX(control, `${label} setting ${controlLabels[index]}`)));
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} nested labels are not aligned: ${JSON.stringify(positions)}`);
  const indent = positions[0] - pluginX;
  if (Math.abs(indent - 16) > 0.5) throw new Error(`${label} nested labels should be indented 16px from the plugin label: ${JSON.stringify({ pluginX, nestedX: positions[0], indent })}`);
};''',
)
replace_exact(
    contract,
    '''  await arrangeSnapping.waitFor({ state: "visible" });
  const persistX = await persistTrackX(dialog);''',
    '''  await arrangeSnapping.waitFor({ state: "visible" });
  await expectNestedLabelHierarchy(
    dialog,
    "mesurer.arrange",
    ["Snapping", "Element edges", "Element centers", "Guides", "Prefer X-ray edges", "Alignment rulers"],
    "Arrange",
  );
  const persistX = await persistTrackX(dialog);''',
)
replace_exact(
    contract,
    '''  const includeMeasurements = settingSwitch(dialog, "Include measurements");
  const autoCopyX = await switchTrackX(autoCopy, "Screenshot Auto-copy");''',
    '''  const includeMeasurements = settingSwitch(dialog, "Include measurements");
  await expectNestedLabelHierarchy(
    dialog,
    "mesurer.screenshot",
    ["Auto-copy", "Auto-download", "Include measurements"],
    "Screenshot",
  );
  const autoCopyX = await switchTrackX(autoCopy, "Screenshot Auto-copy");''',
)

print("Applied consistent plugin label hierarchy: plugin rows + 16px nested setting indent.")
