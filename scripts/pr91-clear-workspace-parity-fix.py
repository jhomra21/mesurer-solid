from pathlib import Path

path = Path("visual-parity/interactions.mjs")
source = path.read_text()
old = '''  { name: "settings-general-clear-workspace", allowVersionDiff: true, run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 50); await p.mouse.click(620, 400); await sleep(p, 80); await openSettingsTab(p, "General"); await realClick(button(p, "Clear workspace")); } },'''
new = '''  { name: "settings-general-clear-workspace", allowVersionDiff: true, run: async (p) => { await realClick(button(p, /^Guides/)); await sleep(p, 50); await p.mouse.click(620, 400); await sleep(p, 80); await openSettingsTab(p, "General"); await realClick(button(p, "Clear workspace")); await p.evaluate(() => { const active = document.activeElement; if (active instanceof HTMLElement) active.blur(); }); await p.mouse.move(900, 700); } },'''
if source.count(old) != 1:
    raise RuntimeError("Expected exactly one clear-workspace interaction case")
path.write_text(source.replace(old, new, 1))
print("Normalized clear-workspace pointer/focus before parity capture.")
