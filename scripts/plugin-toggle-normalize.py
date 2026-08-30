from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement, found {count}\n--- needle ---\n{old}")
    path.write_text(source.replace(old, new, 1))


composable = Path("packages/renderer/src/ComposableMesurer.tsx")
replace_once(
    composable,
    "  let resetManagedPluginAvailability = () => undefined;",
    "  let resetManagedPluginAvailability: () => Promise<void> = async () => undefined;",
)
replace_once(
    composable,
    '''  const updatePluginSetting = (\n    sectionId: string,\n    control: SettingsToggleContribution,\n    value: boolean,\n  ) => {\n    void Promise.resolve(control.set(value)).catch((error) => {\n      props.onPluginError?.(error, `${sectionId}.${control.id}`);\n    });\n  };\n\n  const resetPluginSettings = () => {\n    for (const section of host.settings()) {\n      const defaults = pluginDefaults.get(section.id);\n      if (!defaults) continue;\n      for (const control of section.controls ?? []) {\n        const value = defaults.get(control.id);\n        if (value !== undefined) updatePluginSetting(section.id, control, value);\n      }\n    }\n    resetManagedPluginAvailability();\n  };''',
    '''  const setPluginSetting = async (\n    sectionId: string,\n    control: SettingsToggleContribution,\n    value: boolean,\n  ) => {\n    try {\n      await control.set(value);\n    } catch (error) {\n      props.onPluginError?.(error, `${sectionId}.${control.id}`);\n    }\n  };\n\n  const updatePluginSetting = (\n    sectionId: string,\n    control: SettingsToggleContribution,\n    value: boolean,\n  ) => {\n    void setPluginSetting(sectionId, control, value);\n  };\n\n  const resetPluginSectionDefaults = async (sectionIds?: Set<string>) => {\n    for (const section of host.settings()) {\n      if (sectionIds && !sectionIds.has(section.id)) continue;\n      const defaults = pluginDefaults.get(section.id);\n      if (!defaults) continue;\n      for (const control of section.controls ?? []) {\n        const value = defaults.get(control.id);\n        if (value !== undefined) await setPluginSetting(section.id, control, value);\n      }\n    }\n  };\n\n  const resetPluginSettings = async () => {\n    await resetManagedPluginAvailability();\n  };''',
)
replace_once(
    composable,
    '''  onSettled(() => {\n    let active = true;\n    let persistTimer = 0;''',
    '''  onSettled(() => {\n    let active = true;\n    let persistTimer = 0;\n    let availabilityWriteSuspended = false;\n    let lifecycleQueue: Promise<void> = Promise.resolve();''',
)
replace_once(
    composable,
    '''      if (ready() && (event.reason === "load" || event.reason === "remove" || event.reason === "replace")) {\n        writeAvailablePluginState();\n      }''',
    '''      if (ready() && !availabilityWriteSuspended && (event.reason === "load" || event.reason === "remove" || event.reason === "replace")) {\n        writeAvailablePluginState();\n      }''',
)
replace_once(
    composable,
    '''        const retained = retainedPluginState.get(entry.id);\n        if (retained) runtimeHost.state.restore(retained, "persist");\n        return true;''',
    '''        const retained = retainedPluginState.get(entry.id);\n        if (retained) {\n          runtimeHost.state.restore(retained, "persist");\n          retainedPluginState.delete(entry.id);\n        }\n        return true;''',
)
replace_once(
    composable,
    '''        writeAvailablePluginState();\n      } finally {''',
    '''        if (!availabilityWriteSuspended) writeAvailablePluginState();\n      } finally {''',
)
replace_once(
    composable,
    '''    setManagedPluginEnabled = (pluginId, enabled) => {\n      void changeManagedPlugin(pluginId, enabled);\n    };\n    resetManagedPluginAvailability = () => {\n      retainedPluginState.clear();\n      try {\n        ownerWindow.localStorage.removeItem(availablePluginStorageKey);\n      } catch (error) {\n        input.onPluginError?.(error, "plugin-availability-persistence");\n      }\n      for (const entry of availablePlugins.values()) {\n        void changeManagedPlugin(entry.id, initialEnabledPluginIds.has(entry.id), false);\n      }\n    };''',
    '''    const enqueueLifecycle = (operation: () => Promise<void>) => {\n      const next = lifecycleQueue.then(operation, operation);\n      lifecycleQueue = next.catch(() => undefined);\n      return next;\n    };\n\n    setManagedPluginEnabled = (pluginId, enabled) => {\n      void enqueueLifecycle(async () => {\n        await changeManagedPlugin(pluginId, enabled);\n      });\n    };\n    resetManagedPluginAvailability = () => enqueueLifecycle(async () => {\n      availabilityWriteSuspended = true;\n      try {\n        await resetPluginSectionDefaults();\n        const entries = [...availablePlugins.values()]\n          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));\n        for (const entry of entries) {\n          if (!runtimeHost.has(entry.id) && !await loadManagedPlugin(entry)) continue;\n          await resetPluginSectionDefaults(managedSettingsIds.get(entry.id));\n          if (initialEnabledPluginIds.has(entry.id)) {\n            retainedPluginState.delete(entry.id);\n          } else {\n            captureManagedPluginState(entry.id);\n            runtimeHost.remove(entry.id);\n          }\n        }\n      } finally {\n        availabilityWriteSuspended = false;\n      }\n      if (persistTimer) ownerWindow.clearTimeout(persistTimer);\n      writePluginState();\n      writeAvailablePluginState();\n    });''',
)
replace_once(
    composable,
    '''      resetManagedPluginAvailability = () => undefined;''',
    '''      resetManagedPluginAvailability = async () => undefined;''',
)

settings_runtime = Path("packages/renderer/src/plugins/settings-runtime.tsx")
replace_once(
    settings_runtime,
    "  reset(): void;",
    "  reset(): Promise<void>;",
)

settings_panel = Path("packages/renderer/src/components/SettingsPanel.tsx")
replace_once(
    settings_panel,
    '''  const resetSettings = () => {\n    props.onResetSettings();\n    pluginSettings?.reset();\n  };''',
    '''  const resetSettings = () => {\n    props.onResetSettings();\n    void pluginSettings?.reset();\n  };''',
)

contract = Path("visual-parity/plugin-settings-contract.mjs")
source = contract.read_text()
source = source.replace(
    'const expandPlugin = async (dialog, id, _label) => {',
    'const expandPlugin = async (dialog, id) => {',
    1,
)
source = source.replace(
    '  await settingSwitch(dialog, "Snapping").waitFor({ state: "visible" });\n\n  // Disabling unloads',
    '  const arrangeSnapping = settingSwitch(dialog, "Snapping");\n  await arrangeSnapping.waitFor({ state: "visible" });\n  await expectChecked(arrangeSnapping, true, "Arrange snapping default");\n  await arrangeSnapping.click();\n  await expectChecked(arrangeSnapping, false, "Arrange snapping before unload");\n\n  // Disabling unloads',
    1,
)
source = source.replace(
    '''  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");\n  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Default Auto-copy");\n\n  // The reloaded Screenshot plugin still uses the caller-provided capture provider.''',
    '''  await expandPlugin(dialog, "mesurer.screenshot", "Screenshot");\n  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Default Auto-copy");\n\n  const resetAvailability = await page.evaluate(() => {\n    const stored = window.localStorage.getItem("mesurer-plugin-settings:availability");\n    return stored ? JSON.parse(stored) : null;\n  });\n  const expectedAvailability = {\n    "mesurer.context": true,\n    "mesurer.arrange": false,\n    "mesurer.screenshot": true,\n  };\n  if (JSON.stringify(resetAvailability?.enabled) !== JSON.stringify(expectedAvailability)) {\n    throw new Error(`Use defaults persisted the wrong plugin availability: ${JSON.stringify(resetAvailability)}`);\n  }\n  if (resetAvailability?.state?.["mesurer.screenshot"]) {\n    throw new Error("Enabled Screenshot kept a stale retained-state snapshot after defaults reset");\n  }\n\n  // Reload immediately after the reset and prove the final availability/settings snapshot is durable.\n  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });\n  await page.waitForFunction(() => Boolean(window.__MESURER_PLUGIN_SETTINGS_TEST__));\n  dialog = await openSettings();\n  await expectChecked(pluginToggle(dialog, "Context"), true, "Reloaded default Context plugin");\n  await expectChecked(pluginToggle(dialog, "Arrange"), false, "Reloaded default Arrange plugin");\n  await expectChecked(pluginToggle(dialog, "Screenshot"), true, "Reloaded default Screenshot plugin");\n  await expandPlugin(dialog, "mesurer.screenshot");\n  await expectChecked(settingSwitch(dialog, "Auto-copy"), false, "Reloaded default Auto-copy");\n\n  // A plugin that defaults off also gets its settings reset while preserving the off state.\n  const reloadedArrangeToggle = pluginToggle(dialog, "Arrange");\n  await reloadedArrangeToggle.click();\n  await waitForPlugin("mesurer.arrange", true);\n  await expandPlugin(dialog, "mesurer.arrange");\n  await expectChecked(settingSwitch(dialog, "Snapping"), true, "Arrange snapping after defaults reset");\n  await reloadedArrangeToggle.click();\n  await waitForPlugin("mesurer.arrange", false);\n\n  // The reloaded Screenshot plugin still uses the caller-provided capture provider.''',
    1,
)
contract.write_text(source)

browser_workflow = Path(".github/workflows/browser-contracts.yml")
source = browser_workflow.read_text()
old_summary = '''          print("### Plugin settings")\n          print("- Context and Screenshot Settings controls exercised in Chromium")\n          print("- Context service survives human UI disable")\n          print("- Screenshot tool visibility, outputs, measurement inclusion, and persistence exercised")'''
new_summary = '''          print("### Plugin settings")\n          print("- Available-but-unloaded first-party plugins are discoverable and loadable from Settings")\n          print("- Context, Arrange, and Screenshot lifecycle toggles remove and restore real tools/services")\n          print("- Plugin availability, per-plugin settings persistence, and deterministic defaults reset are exercised")'''
if old_summary not in source:
    raise RuntimeError("Expected browser-contract plugin summary not found")
browser_workflow.write_text(source.replace(old_summary, new_summary, 1))

changelog = Path("CHANGELOG.md")
source = changelog.read_text()
old_note = "- General → Plugins now treats each plugin row as its lifecycle toggle. First-party Context, Arrange, and Screenshot remain discoverable even when initially disabled; enabled plugins show a settings chevron only when they have additional controls, and redundant Context/Screenshot visibility rows are hidden."
new_note = "- General → Plugins now treats each plugin row as its lifecycle toggle. First-party Context, Arrange, and Screenshot remain discoverable even when initially disabled; enabled plugins show a settings chevron only when they have additional controls, redundant Context/Screenshot visibility rows are hidden, lifecycle choices and plugin preferences persist across reloads, and Use defaults deterministically restores mount-time availability without discarding plugin-owned workspace state."
if old_note not in source:
    raise RuntimeError("Expected plugin lifecycle changelog note not found")
changelog.write_text(source.replace(old_note, new_note, 1))

print("Applied deterministic plugin lifecycle reset follow-up.")
