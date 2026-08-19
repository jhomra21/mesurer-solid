import { For, Show, createSignal } from "solid-js";
import type { ColorPickerFormat } from "../core/colors";
import type { ToolMode } from "../core/types";
import type { MeasurerModel, SettingsTab } from "../model/create-measurer-model";

export type ToolbarProps = {
  model: MeasurerModel;
  ownerWindow: Window;
  onColorPicker: () => void;
  onClearWorkspace: () => void;
  onResetSettings: () => void;
};

type Tool = { mode: ToolMode; label: string; shortcut: string; glyph: string };
const tools: Tool[] = [
  { mode: "select", label: "Select", shortcut: "S", glyph: "↖" },
  { mode: "text-inspector", label: "Text Inspector", shortcut: "A", glyph: "A" },
  { mode: "guides", label: "Guides", shortcut: "G", glyph: "+" },
];
const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "select", label: "Select" },
  { id: "guides", label: "Guides" },
  { id: "rulers", label: "Rulers" },
  { id: "color-picker", label: "Color" },
];

export function Toolbar(props: ToolbarProps) {
  const [position, setPosition] = createSignal({ x: 20, y: 20 });
  let dragging = false;
  let pointerId = -1;
  let startX = 0, startY = 0, originX = 0, originY = 0;

  const activate = (mode: ToolMode) => {
    props.model.setEnabled(true, !props.model.current.enabled);
    props.model.toggleToolMode(mode);
    props.model.setTransient({ toolbarActive: true });
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true; pointerId = event.pointerId;
    startX = event.clientX; startY = event.clientY;
    originX = position().x; originY = position().y;
    const move = (next: PointerEvent) => {
      if (!dragging || next.pointerId !== pointerId) return;
      const x = Math.max(8, Math.min(props.ownerWindow.innerWidth - 260, originX + next.clientX - startX));
      const y = Math.max(8, Math.min(props.ownerWindow.innerHeight - 48, originY + next.clientY - startY));
      setPosition({ x, y });
    };
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      dragging = false;
      props.ownerWindow.removeEventListener("pointermove", move);
      props.ownerWindow.removeEventListener("pointerup", end);
      props.ownerWindow.removeEventListener("pointercancel", end);
    };
    props.ownerWindow.addEventListener("pointermove", move);
    props.ownerWindow.addEventListener("pointerup", end);
    props.ownerWindow.addEventListener("pointercancel", end);
  };

  const openSettings = () => props.model.setTransient({
    settingsOpen: !props.model.current.settingsOpen,
    settingsTab: props.model.current.settingsOpen ? props.model.current.settingsTab :
      props.model.current.colorPickerActive ? "color-picker" :
      props.model.current.rulersVisible ? "rulers" :
      props.model.current.toolMode === "guides" ? "guides" :
      props.model.current.toolMode === "select" || props.model.current.toolMode === "text-inspector" ? "select" : "general",
  });

  return (
    <div class="msr-toolbar-wrap" style={{ left: `${position().x}px`, top: `${position().y}px` }}>
      <div class="msr-toolbar-surface" data-mesurer-inspector-ui="true" onPointerDown={(event) => event.stopPropagation()}>
        <button class="msr-grip" type="button" aria-label="Move toolbar" onPointerDown={down}>⋮⋮</button>
        <button
          type="button"
          class={["msr-tool", { "is-active": props.model.state.enabled }]}
          title="Toggle Mesurer (M)"
          onClick={() => props.model.toggleEnabled(true)}
        >M</button>
        <For each={tools}>
          {(tool) => (
            <button
              type="button"
              class={["msr-tool", { "is-active": props.model.state.enabled && props.model.state.toolMode === tool.mode }]}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={`${tool.label} (${tool.shortcut})`}
              onClick={() => activate(tool.mode)}
            >{tool.glyph}</button>
          )}
        </For>
        <div class="msr-toolbar-divider" />
        <button
          type="button"
          class={["msr-tool", { "is-active": props.model.state.rulersVisible }]}
          title="Rulers (R)"
          onClick={() => { props.model.setEnabled(true); props.model.toggleRulers(); }}
        >▰</button>
        <button
          type="button"
          class={["msr-tool", { "is-active": props.model.state.xrayVisible }]}
          title="X-ray (X)"
          onClick={() => { props.model.setEnabled(true); props.model.toggleXray(); }}
        >⌗</button>
        <button
          type="button"
          class={["msr-tool", { "is-active": props.model.state.colorPickerActive }]}
          title="Color picker (P)"
          onClick={props.onColorPicker}
        >◉</button>
        <Show when={props.model.state.toolMode === "guides"}>
          <div class="msr-toolbar-divider" />
          <button type="button" class={["msr-tool", { "is-active": props.model.state.guideOrientation === "horizontal" }]} title="Horizontal guide (H)" onClick={() => props.model.setGuideOrientation("horizontal", true)}>H</button>
          <button type="button" class={["msr-tool", { "is-active": props.model.state.guideOrientation === "vertical" }]} title="Vertical guide (V)" onClick={() => props.model.setGuideOrientation("vertical", true)}>V</button>
        </Show>
        <div class="msr-toolbar-divider" />
        <button type="button" class={["msr-tool", { "is-active": props.model.state.settingsOpen }]} title="Settings (Ctrl/Cmd + ,)" onClick={openSettings}>⚙</button>
      </div>

      <Show when={props.model.state.settingsOpen}>
        <div class="msr-settings" data-mesurer-inspector-ui="true" onPointerDown={(event) => event.stopPropagation()}>
          <header>
            <strong>Mesurer</strong>
            <button type="button" onClick={() => props.model.setTransient({ settingsOpen: false })}>×</button>
          </header>
          <nav>
            <For each={tabs}>{(tab) => (
              <button type="button" class={{ "is-active": props.model.state.settingsTab === tab.id }} onClick={() => props.model.setTransient({ settingsTab: tab.id })}>{tab.label}</button>
            )}</For>
          </nav>

          <section>
            <Show when={props.model.state.settingsTab === "general"}>
              <label class="msr-setting-row"><span>Persist workspace</span><input type="checkbox" checked={props.model.state.settings.persistOnReload} onChange={(event) => props.model.updateSettings({ persistOnReload: event.currentTarget.checked })} /></label>
              <p class="msr-help">When enabled, guides and measurement workspace restore after reload.</p>
            </Show>

            <Show when={props.model.state.settingsTab === "select"}>
              <label class="msr-setting-row"><span>Selection color</span><input type="color" value="#0d99ff" onInput={(event) => props.model.updateSettings({ highlightColor: event.currentTarget.value })} /></label>
              <label class="msr-setting-row"><span>Hover highlight</span><input type="checkbox" checked={props.model.state.settings.hoverHighlightEnabled} onChange={(event) => props.model.updateSettings({ hoverHighlightEnabled: event.currentTarget.checked })} /></label>
              <label class="msr-setting-row"><span>Snap selection</span><input type="checkbox" checked={props.model.state.settings.snapEnabled} onChange={(event) => props.model.updateSettings({ snapEnabled: event.currentTarget.checked })} /></label>
              <label class="msr-setting-row"><span>Keep measurements</span><input type="checkbox" checked={props.model.state.settings.multiMeasureEnabled} onChange={(event) => props.model.updateSettings({ multiMeasureEnabled: event.currentTarget.checked })} /></label>
            </Show>

            <Show when={props.model.state.settingsTab === "guides"}>
              <label class="msr-setting-row"><span>Guide color</span><input type="color" value="#ff453a" onInput={(event) => props.model.updateSettings({ guideColor: event.currentTarget.value })} /></label>
              <label class="msr-setting-row"><span>Snap guides</span><input type="checkbox" checked={props.model.state.settings.snapGuidesEnabled} onChange={(event) => props.model.updateSettings({ snapGuidesEnabled: event.currentTarget.checked })} /></label>
              <label class="msr-setting-row"><span>Select new guide</span><input type="checkbox" checked={props.model.state.settings.selectNewGuideEnabled} onChange={(event) => props.model.updateSettings({ selectNewGuideEnabled: event.currentTarget.checked })} /></label>
              <label class="msr-setting-row"><span>Opacity</span><input type="range" min="0.1" max="1" step="0.05" value={props.model.state.settings.guideStyle.opacity} onInput={(event) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, opacity: Number(event.currentTarget.value) } })} /></label>
              <label class="msr-setting-row"><span>Width</span><input type="range" min="1" max="4" step="1" value={props.model.state.settings.guideStyle.width} onInput={(event) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, width: Number(event.currentTarget.value) } })} /></label>
              <label class="msr-setting-row"><span>Pattern</span><select value={props.model.state.settings.guideStyle.pattern} onChange={(event) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, pattern: event.currentTarget.value as "solid" | "dashed" | "dotted" } })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
              <Show when={props.model.state.settings.guideStyle.pattern !== "solid"}>
                <label class="msr-setting-row"><span>Dash length</span><input type="range" min="2" max="24" step="1" value={props.model.state.settings.guideStyle.dashLength} onInput={(event) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, dashLength: Number(event.currentTarget.value) } })} /></label>
                <label class="msr-setting-row"><span>Gap</span><input type="range" min="0" max="24" step="1" value={props.model.state.settings.guideStyle.gap} onInput={(event) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, gap: Number(event.currentTarget.value) } })} /></label>
              </Show>
            </Show>

            <Show when={props.model.state.settingsTab === "rulers"}>
              <label class="msr-setting-row"><span>Ruler opacity</span><input type="range" min="0.2" max="1" step="0.05" value={props.model.state.settings.rulerSettings.opacity} onInput={(event) => props.model.updateSettings({ rulerSettings: { ...props.model.current.settings.rulerSettings, opacity: Number(event.currentTarget.value) } })} /></label>
              <label class="msr-setting-row"><span>Reveal at edge</span><input type="checkbox" checked={props.model.state.settings.rulerSettings.edgeReveal} onChange={(event) => props.model.updateSettings({ rulerSettings: { ...props.model.current.settings.rulerSettings, edgeReveal: event.currentTarget.checked } })} /></label>
            </Show>

            <Show when={props.model.state.settingsTab === "color-picker"}>
              <div class="msr-setting-stack">
                <span>Display formats</span>
                <For each={["hex", "rgb", "hsl", "oklch"] as ColorPickerFormat[]}>
                  {(format) => (
                    <label><input type="checkbox" checked={props.model.state.settings.colorPickerFormats.includes(format)} onChange={(event) => {
                      const next = event.currentTarget.checked
                        ? [...new Set([...props.model.current.settings.colorPickerFormats, format])]
                        : props.model.current.settings.colorPickerFormats.filter((item) => item !== format);
                      props.model.updateSettings({ colorPickerFormats: next.length ? next : ["hex"] });
                    }} /> {format.toUpperCase()}</label>
                  )}
                </For>
                <label class="msr-setting-row"><span>Copy on pick</span><select value={props.model.state.settings.colorPickerClickFormat} onChange={(event) => props.model.updateSettings({ colorPickerClickFormat: event.currentTarget.value as ColorPickerFormat })}><For each={props.model.state.settings.colorPickerFormats}>{(format) => <option value={format}>{format.toUpperCase()}</option>}</For></select></label>
              </div>
            </Show>
          </section>
          <footer>
            <button type="button" onClick={props.onResetSettings}>Use defaults</button>
            <button type="button" class="is-danger" onClick={props.onClearWorkspace}>Clear workspace</button>
          </footer>
        </div>
      </Show>
    </div>
  );
}
