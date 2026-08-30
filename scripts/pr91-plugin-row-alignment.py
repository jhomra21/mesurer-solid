from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    target = Path(path)
    source = target.read_text()
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} occurrences, found {count}")
    target.write_text(source.replace(old, new, expected))


settings = "packages/renderer/src/components/SettingsPanel.tsx"
replace_exact(
    settings,
    '''                    const setEnabled = (enabled: boolean) => {
                      if (!enabled) {
                        setExpandedPluginSections((current) => current.filter((id) => id !== plugin.id));
                      }
                      pluginSettings?.setEnabled(plugin.id, enabled);
                    };''',
    '''                    const setEnabled = (enabled: boolean) => {
                      pluginSettings?.setEnabled(plugin.id, enabled);
                    };''',
)
replace_exact(
    settings,
    '''                        <div class="msr:flex msr:h-7 msr:w-full msr:items-center msr:hover:bg-ink-50">
                          <button
                            type="button"
                            role="switch"
                            aria-label={plugin.label}
                            aria-checked={plugin.enabled ? "true" : "false"}
                            disabled={plugin.busy}
                            data-mesurer-plugin-toggle={plugin.id}
                            class="msr:flex msr:h-full msr:min-w-0 msr:flex-1 msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:text-ink-600 msr:disabled:opacity-45"
                            onClick={() => setEnabled(!plugin.enabled)}
                          >
                            <span class="msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{plugin.label}</span>
                            <span
                              aria-hidden="true"
                              data-checked={plugin.enabled ? "true" : undefined}
                              class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${plugin.enabled ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}
                            >
                              <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${plugin.enabled ? 12 : 0}px)` }} />
                            </span>
                          </button>
                          <Show when={canExpand()}>
                            <button
                              type="button"
                              aria-label={`${plugin.label} settings`}
                              data-mesurer-plugin-settings-disclosure={plugin.id}
                              aria-expanded={expanded() ? "true" : "false"}
                              class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:text-ink-500 msr:hover:text-ink-700 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff]"
                              onClick={toggleExpanded}
                            >
                              <CaretDownIcon size={9} class={expanded() ? "msr:rotate-180" : ""} />
                            </button>
                          </Show>
                        </div>''',
    '''                        <div class="msr:grid msr:h-7 msr:w-full msr:grid-cols-[minmax(0,1fr)_28px] msr:items-center msr:hover:bg-ink-50">
                          <button
                            type="button"
                            role="switch"
                            aria-label={plugin.label}
                            aria-checked={plugin.enabled ? "true" : "false"}
                            disabled={plugin.busy}
                            data-mesurer-plugin-toggle={plugin.id}
                            class="msr:col-start-1 msr:flex msr:h-full msr:min-w-0 msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:text-ink-600 msr:disabled:opacity-45"
                            onClick={() => setEnabled(!plugin.enabled)}
                          >
                            <span class="msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{plugin.label}</span>
                            <span
                              aria-hidden="true"
                              data-checked={plugin.enabled ? "true" : undefined}
                              class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${plugin.enabled ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}
                            >
                              <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${plugin.enabled ? 12 : 0}px)` }} />
                            </span>
                          </button>
                          <Show when={canExpand()}>
                            <button
                              type="button"
                              aria-label={`${plugin.label} settings`}
                              data-mesurer-plugin-settings-disclosure={plugin.id}
                              aria-expanded={expanded() ? "true" : "false"}
                              class="msr:col-start-2 msr:flex msr:size-7 msr:items-center msr:justify-center msr:text-ink-500 msr:hover:text-ink-700 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff]"
                              onClick={toggleExpanded}
                            >
                              <CaretDownIcon size={9} class={expanded() ? "msr:rotate-180" : ""} />
                            </button>
                          </Show>
                        </div>''',
)

contract = "visual-parity/plugin-settings-contract.mjs"
replace_exact(
    contract,
    '''const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";''',
    '''const checked = async (control) => (await control.getAttribute("aria-checked")) === "true";
const pluginTrackX = async (dialog, id) => {
  const track = dialog.locator(`[data-mesurer-plugin-toggle='${id}'] .mesurer-switch-track`);
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error(`Plugin toggle track ${id} has no bounding box`);
  return box.x;
};
const expectToggleAlignment = async (dialog, ids, label) => {
  const positions = await Promise.all(ids.map((id) => pluginTrackX(dialog, id)));
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} plugin toggles are misaligned: ${JSON.stringify(positions)}`);
};''',
)
replace_exact(
    contract,
    '''  await expectChecked(contextToggle, true, "Context plugin");
  await expectChecked(arrangeToggle, false, "Arrange plugin");
  await expectChecked(screenshotToggle, true, "Screenshot plugin");''',
    '''  await expectChecked(contextToggle, true, "Context plugin");
  await expectChecked(arrangeToggle, false, "Arrange plugin");
  await expectChecked(screenshotToggle, true, "Screenshot plugin");
  await expectToggleAlignment(dialog, ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"], "Initial");''',
)
replace_exact(
    contract,
    '''  await expectChecked(arrangeToggle, true, "Arrange plugin after Settings enable");
  await expandPlugin(dialog, "mesurer.arrange", "Arrange");''',
    '''  await expectChecked(arrangeToggle, true, "Arrange plugin after Settings enable");
  await expectToggleAlignment(dialog, ["mesurer.context", "mesurer.arrange", "mesurer.screenshot"], "Arrange enabled");
  await expandPlugin(dialog, "mesurer.arrange", "Arrange");''',
)
replace_exact(
    contract,
    '''  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  await screenshotToggle.click();''',
    '''  await arrangeToggle.click();
  await waitForPlugin("mesurer.arrange", true);
  const restoredArrangeDisclosure = dialog.locator("[data-mesurer-plugin-settings-disclosure='mesurer.arrange']");
  await restoredArrangeDisclosure.waitFor({ state: "visible" });
  if ((await restoredArrangeDisclosure.getAttribute("aria-expanded")) !== "true") {
    throw new Error("Arrange disclosure state did not survive plugin disable/re-enable");
  }
  await dialog.locator("[data-mesurer-plugin-settings-controls='mesurer.arrange']").waitFor({ state: "visible" });
  await screenshotToggle.click();''',
)

print("Applied fixed plugin-row geometry and independent disclosure-state polish.")
