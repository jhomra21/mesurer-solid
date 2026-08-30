from pathlib import Path

path = Path("packages/renderer/src/ComposableMesurer.tsx")
source = path.read_text()
old = '''    <MesurerPluginSettingsProvider runtime={{ plugins: managedPluginSettings, version: () => version, setEnabled: setManagedPluginEnabled, update: updatePluginSetting, reset: resetPluginSettings }}>'''
new = '''    <MesurerPluginSettingsProvider runtime={{ plugins: managedPluginSettings, version: () => version, setEnabled: (pluginId, enabled) => setManagedPluginEnabled(pluginId, enabled), update: updatePluginSetting, reset: resetPluginSettings }}>'''
if source.count(old) != 1:
    raise RuntimeError("Expected plugin settings provider runtime binding not found exactly once")
path.write_text(source.replace(old, new, 1))
print("Fixed plugin lifecycle callback binding.")
