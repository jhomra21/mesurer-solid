from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} occurrences, found {count}: {old!r}")
    target.write_text(source.replace(old, new))


arrange = "visual-parity/arrange-contract.mjs"
replace_exact(
    arrange,
    "[data-mesurer-plugin-settings-section='arrange']",
    "[data-mesurer-plugin-settings-section='mesurer.arrange']",
    expected=4,
)
replace_exact(
    arrange,
    "[data-mesurer-plugin-settings-disclosure='arrange']",
    "[data-mesurer-plugin-settings-disclosure='mesurer.arrange']",
)
replace_exact(
    arrange,
    "[data-mesurer-plugin-settings-controls='arrange']",
    "[data-mesurer-plugin-settings-controls='mesurer.arrange']",
)
replace_exact(
    arrange,
    '''  const settingLabels = (await arrangeSettings.getByRole("switch").allTextContents())
    .map((label) => label.trim());''',
    '''  const arrangeControls = arrangeSettings.locator("[data-mesurer-plugin-settings-controls='mesurer.arrange']");
  const settingLabels = (await arrangeControls.getByRole("switch").allTextContents())
    .map((label) => label.trim());''',
)
replace_exact(
    arrange,
    '''  const snappingSwitch = arrangeSettings.getByRole("switch", { name: "Snapping", exact: true });''',
    '''  const snappingSwitch = arrangeControls.getByRole("switch", { name: "Snapping", exact: true });''',
)
replace_exact(
    arrange,
    '''    const section = document.querySelector("[data-mesurer-plugin-settings-section='mesurer.arrange']");
    const control = section?.querySelector("button[role='switch']");''',
    '''    const controls = document.querySelector("[data-mesurer-plugin-settings-controls='mesurer.arrange']");
    const control = controls?.querySelector("button[role='switch']");''',
    expected=2,
)

capture = "visual-parity/capture.mjs"
replace_exact(
    capture,
    '''  const extension = page.locator('[role="dialog"][aria-label="Settings"] [data-mesurer-distance="true"]');
  if ((await extension.count()) === 0) return;
  await extension.evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await page.waitForTimeout(20);''',
    '''  const extensions = page.locator('[role="dialog"][aria-label="Settings"] [data-mesurer-distance="true"], [role="dialog"][aria-label="Settings"] [data-mesurer-plugin-settings="true"]');
  if ((await extensions.count()) === 0) return;
  await extensions.evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  // Removing Solid-only extensions changes panel layout. Give the shared surface
  // the same settle window used by interaction parity before a zero-tolerance capture.
  await page.waitForTimeout(240);''',
)

print("Applied PR #91 browser/parity contract fixes.")
