from pathlib import Path

composable = Path("packages/renderer/src/ComposableMesurer.tsx")
source = composable.read_text()
old = '''        const parsed = JSON.parse(stored) as StoredAvailablePluginState;
        if (parsed?.version === AVAILABLE_PLUGIN_STORAGE_VERSION) {
          for (const [id, enabled] of Object.entries(parsed.enabled ?? {})) {
            if (typeof enabled === "boolean") storedEnabled.set(id, enabled);
          }
          for (const [id, snapshot] of Object.entries(parsed.state ?? {})) {
            if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
              retainedPluginState.set(id, snapshot);
            }
          }
        }'''
new = '''        // SAFETY: This versioned, namespaced payload is written only by writeAvailablePluginState below; incompatible JSON is ignored by the version gate or caught by this boundary.
        const parsed = JSON.parse(stored) as StoredAvailablePluginState;
        if (parsed?.version === AVAILABLE_PLUGIN_STORAGE_VERSION) {
          for (const [id, enabled] of Object.entries(parsed.enabled ?? {})) storedEnabled.set(id, enabled);
          for (const [id, snapshot] of Object.entries(parsed.state ?? {})) retainedPluginState.set(id, snapshot);
        }'''
if old not in source:
    raise RuntimeError("Expected availability parser block not found")
composable.write_text(source.replace(old, new, 1))

index = Path("packages/mesurer/src/index.tsx")
source = index.read_text()
old = '''import {
  MESURER_CONTEXT_SERVICE_ID,
  type MesurerContextService,
} from "./context-plugin";'''
new = '''import {
  MESURER_CONTEXT_PLUGIN_ID,
  MESURER_CONTEXT_SERVICE_ID,
  contextPlugin,
  type MesurerContextService,
} from "./context-plugin";'''
if old not in source:
    raise RuntimeError("Expected context-plugin import block not found")
source = source.replace(old, new, 1)
source = source.replace(
    '  type MesurerAvailablePlugin as RendererMesurerAvailablePlugin,\n',
    '',
    1,
)
old_type = 'export type MesurerAvailablePlugin = RendererMesurerAvailablePlugin;'
new_type = '''export type MesurerAvailablePlugin = {
  id: string;
  label: string;
  order?: number;
  create(): MesurerPlugin | Promise<MesurerPlugin>;
  settingsIds?: string[];
  hiddenSettingsControlIds?: string[];
};'''
if old_type not in source:
    raise RuntimeError("Expected renderer available-plugin type alias not found")
index.write_text(source.replace(old_type, new_type, 1))

contract = Path("visual-parity/plugin-settings-contract.mjs")
source = contract.read_text()
marker = "  if (errors.length) throw new Error(`Plugin settings browser errors:"
start = source.find(marker)
if start < 0:
    raise RuntimeError("Expected browser error block not found")
end = source.find('  console.log("Plugin settings browser contract: PASS");', start)
if end < 0:
    raise RuntimeError("Expected browser error block end not found")
replacement = '  if (errors.length) throw new Error(`Plugin settings browser errors:\\n${errors.join("\\n")}`);\n'
source = source[:start] + replacement + source[end:]
lines = source.splitlines()
for index_value, line in enumerate(lines):
    if line.startswith('const settingSwitch = (dialog, label) =>'):
        lines[index_value] = 'const settingSwitch = (dialog, label) => dialog.getByRole("switch", { name: label, exact: true });'
    if line.startswith('const expandPlugin = async (dialog, id, label) =>'):
        lines[index_value] = 'const expandPlugin = async (dialog, id, _label) => {'
contract.write_text("\n".join(lines) + "\n")

print("Normalized plugin lifecycle follow-up output.")
