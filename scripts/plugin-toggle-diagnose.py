from pathlib import Path

path = Path("visual-parity/plugin-settings-contract.mjs")
source = path.read_text()
old = '''const waitForPlugin = async (id, loaded) => {
  await page.waitForFunction(({ id, loaded }) =>
    (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
    { id, loaded },
  );
};'''
new = '''const waitForPlugin = async (id, loaded) => {
  try {
    await page.waitForFunction(({ id, loaded }) =>
      (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
      { id, loaded },
      { timeout: 8_000 },
    );
  } catch (cause) {
    const snapshot = await page.evaluate(() => {
      const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
      return {
        plugins: harness?.subject.describe()?.plugins.map((plugin) => plugin.id) ?? [],
        services: harness?.subject.describe()?.services ?? [],
        availability: window.localStorage.getItem("mesurer-plugin-settings:availability"),
        pluginState: window.localStorage.getItem("mesurer-plugin-settings"),
      };
    });
    throw new Error(`Timed out waiting for ${id} to become ${loaded ? "loaded" : "unloaded"}: ${JSON.stringify(snapshot)}`, { cause });
  }
};'''
if source.count(old) != 1:
    raise RuntimeError("Expected waitForPlugin helper not found exactly once")
path.write_text(source.replace(old, new, 1))
print("Added plugin lifecycle browser diagnostics.")
