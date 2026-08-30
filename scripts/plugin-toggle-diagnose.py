from pathlib import Path

path = Path("visual-parity/plugin-settings-contract.mjs")
source = path.read_text()

old_tool = '''const waitForTool = async (id, visible) => {
  await page.waitForFunction(({ id, visible }) => {
    const islandElement = document.querySelector("[data-mesurer-island='true']");
    const root = islandElement?.shadowRoot ?? islandElement;
    const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
    const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
    return isVisible === visible;
  }, { id, visible });
};'''
new_tool = '''const browserSnapshot = async () => page.evaluate(() => {
  const harness = window.__MESURER_PLUGIN_SETTINGS_TEST__;
  const islandElement = document.querySelector("[data-mesurer-island='true']");
  const root = islandElement?.shadowRoot ?? islandElement;
  return {
    href: window.location.href,
    harness: Boolean(harness),
    plugins: harness?.subject.describe()?.plugins.map((plugin) => plugin.id) ?? [],
    services: harness?.subject.describe()?.services ?? [],
    visibleTools: [...(root?.querySelectorAll("[data-mesurer-tool-id]") ?? [])]
      .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0)
      .map((element) => element.getAttribute("data-mesurer-tool-id")),
    availability: window.localStorage.getItem("mesurer-plugin-settings:availability"),
    pluginState: window.localStorage.getItem("mesurer-plugin-settings"),
  };
});
const waitForHarness = async (label) => {
  try {
    await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__), undefined, { timeout: 8_000 });
  } catch (cause) {
    throw new Error(`Timed out waiting for plugin settings harness (${label}): ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
};
const waitForTool = async (id, visible) => {
  try {
    await page.waitForFunction(({ id, visible }) => {
      const islandElement = document.querySelector("[data-mesurer-island='true']");
      const root = islandElement?.shadowRoot ?? islandElement;
      const button = root?.querySelector(`[data-mesurer-tool-id='${id}'] button`);
      const isVisible = button instanceof HTMLElement && button.getClientRects().length > 0;
      return isVisible === visible;
    }, { id, visible }, { timeout: 8_000 });
  } catch (cause) {
    throw new Error(`Timed out waiting for tool ${id} to become ${visible ? "visible" : "hidden"}: ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
};'''
if source.count(old_tool) != 1:
    raise RuntimeError("Expected waitForTool helper not found exactly once")
source = source.replace(old_tool, new_tool, 1)

old_plugin = '''const waitForPlugin = async (id, loaded) => {
  await page.waitForFunction(({ id, loaded }) =>
    (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
    { id, loaded },
  );
};'''
new_plugin = '''const waitForPlugin = async (id, loaded) => {
  try {
    await page.waitForFunction(({ id, loaded }) =>
      (window.__MESURER_PLUGIN_SETTINGS_TEST__?.subject.describe()?.plugins.some((plugin) => plugin.id === id) ?? false) === loaded,
      { id, loaded },
      { timeout: 8_000 },
    );
  } catch (cause) {
    throw new Error(`Timed out waiting for ${id} to become ${loaded ? "loaded" : "unloaded"}: ${JSON.stringify(await browserSnapshot())}`, { cause });
  }
};'''
if source.count(old_plugin) != 1:
    raise RuntimeError("Expected waitForPlugin helper not found exactly once")
source = source.replace(old_plugin, new_plugin, 1)

harness_wait = 'await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));'
if source.count(harness_wait) != 3:
    raise RuntimeError(f"Expected three harness waits after lifecycle patch, found {source.count(harness_wait)}")
source = source.replace(harness_wait, 'await waitForHarness("initial mount");', 1)
source = source.replace(harness_wait, 'await waitForHarness("availability reload");', 1)
source = source.replace(harness_wait, 'await waitForHarness("defaults reload");', 1)

path.write_text(source)
print("Added detailed plugin lifecycle browser diagnostics.")
