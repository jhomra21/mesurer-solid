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
    '''                        <div class="msr:grid msr:h-7 msr:w-full msr:grid-cols-[minmax(0,1fr)_28px_34px] msr:items-center msr:hover:bg-ink-50">
                          <span class="msr:col-start-1 msr:min-w-0 msr:truncate msr:whitespace-nowrap msr:px-2 msr:text-[11px] msr:text-ink-600">{plugin.label}</span>
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
                          <button
                            type="button"
                            role="switch"
                            aria-label={plugin.label}
                            aria-checked={plugin.enabled ? "true" : "false"}
                            disabled={plugin.busy}
                            data-mesurer-plugin-toggle={plugin.id}
                            class="msr:col-start-3 msr:flex msr:h-full msr:w-full msr:items-center msr:justify-end msr:disabled:opacity-45 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff]"
                            onClick={() => setEnabled(!plugin.enabled)}
                          >
                            <span
                              aria-hidden="true"
                              data-checked={plugin.enabled ? "true" : undefined}
                              class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${plugin.enabled ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}
                            >
                              <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${plugin.enabled ? 12 : 0}px)` }} />
                            </span>
                          </button>
                        </div>''',
)

contract = "visual-parity/plugin-settings-contract.mjs"
replace_exact(
    contract,
    '''const expectToggleAlignment = async (dialog, ids, label) => {
  const positions = await Promise.all(ids.map((id) => pluginTrackX(dialog, id)));
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} plugin toggles are misaligned: ${JSON.stringify(positions)}`);
};''',
    '''const persistTrackX = async (dialog) => {
  const track = dialog.getByRole("switch", { name: "Persist", exact: true }).locator(".mesurer-switch-track");
  await track.waitFor({ state: "visible" });
  const box = await track.boundingBox();
  if (!box) throw new Error("Persist toggle track has no bounding box");
  return box.x;
};
const expectToggleAlignment = async (dialog, ids, label) => {
  const persist = await persistTrackX(dialog);
  const plugins = await Promise.all(ids.map((id) => pluginTrackX(dialog, id)));
  const positions = [persist, ...plugins];
  const spread = Math.max(...positions) - Math.min(...positions);
  if (spread > 0.5) throw new Error(`${label} Persist/plugin toggles are misaligned: ${JSON.stringify(positions)}`);
};''',
)

print("Aligned plugin lifecycle switches with Persist and kept disclosure in its own column.")
