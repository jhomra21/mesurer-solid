import { For, Show, createSignal, onSettled } from "solid-js";
import { colorToHex, parseCssColor, type ColorPickerFormat } from "../core/colors";
import { trySetPointerCapture } from "../core/events";
import type { GuideStyle, SelectionSpacingStyle } from "../core/persistence";
import type { MesurerModel, SettingsTab } from "../model/create-mesurer-model";
import { useMesurerPluginSettings } from "../plugins/settings-runtime";
import { CaretDownIcon } from "./Icons";
import { Tooltip, createTooltip } from "./Tooltip";

const COLOR_FORMATS: ColorPickerFormat[] = ["hex", "rgb", "hsl", "oklch"];
const isColorPickerFormat = (value: string): value is ColorPickerFormat =>
  COLOR_FORMATS.some((format) => format === value);
const GUIDE_PATTERNS: Array<{ value: GuideStyle["pattern"]; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

function ControlShell(props: { left: any; right: any }) {
  return (
    <div class="mesurer-control-shell msr:group msr:flex msr:h-6 msr:w-full msr:min-w-0 msr:items-center msr:overflow-hidden msr:rounded-[5px] msr:border msr:border-transparent msr:bg-ink-50 msr:hover:border-ink-200">
      <div class="mesurer-control-focus msr:flex msr:h-full msr:min-w-0 msr:flex-1 msr:items-center msr:focus-within:rounded-l-[5px] msr:focus-within:outline msr:focus-within:outline-1 msr:focus-within:outline-[#0d99ff] msr:focus-within:outline-offset-[-1px]">{props.left}</div>
      <div class="mesurer-control-focus msr:box-border msr:flex msr:h-full msr:w-12 msr:shrink-0 msr:items-center msr:border-l msr:border-transparent msr:group-hover:border-ink-200 msr:focus-within:rounded-r-[5px] msr:focus-within:outline msr:focus-within:outline-1 msr:focus-within:outline-[#0d99ff] msr:focus-within:outline-offset-[-1px]">{props.right}</div>
    </div>
  );
}

function SettingsSwitch(props: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={props.checked ? "true" : "false"} disabled={props.disabled} class="msr:col-span-2 msr:grid msr:h-6 msr:w-full msr:appearance-none msr:grid-cols-[78px_156px] msr:items-center msr:gap-3 msr:text-left msr:text-[12px] msr:leading-none msr:text-ink-700 msr:disabled:opacity-45" onClick={() => props.onChange(!props.checked)}>
      <span>{props.label}</span>
      <span aria-hidden="true" style={{ "justify-self": "end" }} data-checked={props.checked ? "true" : undefined} class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${props.checked ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}>
        <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${props.checked ? 12 : 0}px)` }} />
      </span>
    </button>
  );
}

function PluginSettingsSwitch(props: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked ? "true" : "false"}
      disabled={props.disabled}
      class="msr:flex msr:h-6 msr:w-full msr:items-center msr:justify-between msr:gap-2 msr:text-left msr:text-[12px] msr:leading-none msr:text-ink-700 msr:disabled:opacity-45"
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{props.label}</span>
      <span aria-hidden="true" data-checked={props.checked ? "true" : undefined} class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${props.checked ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}>
        <span class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform" style={{ transform: `translateX(${props.checked ? 12 : 0}px)` }} />
      </span>
    </button>
  );
}

function SliderControl(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  parseInput?: (input: string) => number;
}) {
  const formatValue = (value: number) => props.formatValue?.(value) ?? String(value);
  const parseInput = (value: string) => props.parseInput?.(value) ?? Number(value);
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  let sliderElement: HTMLDivElement | undefined;
  const percentage = () => ((props.value - props.min) / (props.max - props.min)) * 100;
  const setClamped = (value: number) => props.onChange(Number(Math.min(props.max, Math.max(props.min, value)).toFixed(4)));
  const updateFromPointer = (event: PointerEvent, element: HTMLDivElement) => {
    event.stopPropagation();
    const rect = element.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 16);
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - 8) / usable));
    const raw = props.min + ratio * (props.max - props.min);
    setClamped(Math.round((raw - props.min) / props.step) * props.step + props.min);
  };

  onSettled(() => {
    const element = sliderElement;
    if (!element) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (element.hasPointerCapture(event.pointerId)) updateFromPointer(event, element);
    };
    element.addEventListener("pointermove", handlePointerMove);
    return () => element.removeEventListener("pointermove", handlePointerMove);
  });

  return (
    <div class="msr:col-span-2 msr:grid msr:w-full msr:grid-cols-[78px_156px] msr:items-center msr:gap-3">
      <span class="msr:text-[11px] msr:font-medium msr:text-ink-700">{props.label}</span>
      <ControlShell
        left={
          <div
            ref={(element) => { sliderElement = element; }}
            class="msr:relative msr:min-w-0 msr:flex-1 msr:touch-none msr:select-none msr:px-2"
            style={{ height: "20px" }}
            data-slider-container="true"
            onPointerDown={(event) => { event.stopPropagation(); trySetPointerCapture(event.currentTarget, event.pointerId); updateFromPointer(event, event.currentTarget); }}
            onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          >
            <div class="msr:absolute msr:left-[8px] msr:right-[8px] msr:rounded-full" style={{ top: "8px", height: "4px", "background-color": "rgba(15, 23, 42, 0.16)" }} />
            <div class="msr:absolute msr:left-[8px] msr:rounded-full" style={{ top: "8px", width: `calc(${percentage()}% - ${percentage() * 0.16}px)`, height: "4px", "background-color": "#0d99ff" }} />
            <div
              class="msr:absolute msr:rounded-[5px] msr:bg-white msr:shadow-sm msr:outline-none msr:focus-visible:ring-1 msr:focus-visible:ring-[#0d99ff]/25"
              style={{ left: `calc(8px + (100% - 16px) * ${percentage() / 100})`, top: "4px", width: "12px", height: "12px", transform: "translateX(-50%)" }}
              role="slider"
              tabindex={0}
              aria-label={props.label}
              aria-valuemin={props.min}
              aria-valuemax={props.max}
              aria-valuenow={props.value}
              onKeyDown={(event) => {
                const direction = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
                if (event.key === "Home") setClamped(props.min);
                else if (event.key === "End") setClamped(props.max);
                else if (direction) setClamped(props.value + direction * props.step);
                else return;
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          </div>
        }
        right={
          <input
            type="text"
            aria-label={`${props.label} value`}
            class="msr:h-full msr:w-full msr:border-0 msr:bg-transparent msr:px-2 msr:text-center msr:font-mono msr:text-[12px] msr:font-medium msr:tabular-nums msr:text-ink-700 msr:outline-none"
            style={{ "box-sizing": "border-box", "border-radius": "0 5px 5px 0", "line-height": "1rem" }}
            value={editing() ? draft() : formatValue(props.value)}
            onFocus={() => { setDraft(formatValue(props.value)); setEditing(true); }}
            onInput={(event) => { setDraft(event.currentTarget.value); const next = parseInput(event.currentTarget.value); if (Number.isFinite(next)) setClamped(next); }}
            onBlur={() => { const next = parseInput(draft()); if (Number.isFinite(next)) setClamped(next); setEditing(false); }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        }
      />
    </div>
  );
}

function ColorField(props: { label: string; value: string; fallback: string; ownerWindow: Window; onChange: (value: string) => void }) {
  const sample = () => {
    const parsed = parseCssColor(props.value);
    if (parsed) return parsed;
    const canvas = props.ownerWindow.document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = props.value;
    return parseCssColor(String(context.fillStyle));
  };
  const hex = () => {
    const color = sample();
    return color ? colorToHex({ ...color, alpha: 1 }).slice(1).toUpperCase() : props.fallback.slice(1).toUpperCase();
  };
  const alpha = () => {
    const color = sample();
    return color ? Math.round(color.alpha * 100) : 100;
  };
  const inputValue = () => `#${hex().slice(0, 6)}`;
  const supportsColor = () => props.ownerWindow.document.defaultView?.CSS?.supports("color", props.value) === true;
  const swatch = () => supportsColor() ? props.value : props.fallback;
  const [hexDraft, setHexDraft] = createSignal("");
  const [alphaDraft, setAlphaDraft] = createSignal("");
  const [hexFocused, setHexFocused] = createSignal(false);
  const [alphaFocused, setAlphaFocused] = createSignal(false);
  const updateColor = (nextHex: string, nextAlpha: number) => {
    if (!/^[\da-f]{6}$/i.test(nextHex)) return;
    const parsed = parseCssColor(`#${nextHex}`);
    if (!parsed) return;
    props.onChange(colorToHex({ ...parsed, alpha: Math.min(100, Math.max(0, nextAlpha)) / 100 }));
  };

  return (
    <div class="msr:col-span-2 msr:grid msr:w-full msr:grid-cols-[78px_156px] msr:items-center msr:gap-3 msr:text-[12px] msr:text-ink-700">
      <span>{props.label}</span>
      <ControlShell
        left={
          <>
            <span class="msr:relative msr:ml-1 msr:block msr:size-4 msr:shrink-0 msr:overflow-hidden msr:rounded-[3px] msr:border msr:border-black/10" style={{ "background-color": swatch() }}>
              <input type="color" aria-label={`${props.label} color picker`} value={inputValue()} class="msr:absolute msr:inset-0 msr:size-full msr:cursor-pointer msr:opacity-0" onInput={(event) => props.onChange(event.currentTarget.value)} />
            </span>
            <input
              aria-label={`${props.label} hex value`}
              type="text"
              value={hexFocused() ? hexDraft() : hex()}
              maxlength={6}
              class="msr:min-w-0 msr:flex-1 msr:bg-transparent msr:px-2 msr:font-mono msr:text-[12px] msr:tabular-nums msr:text-ink-700 msr:outline-none"
              onFocus={() => { setHexDraft(hex()); setHexFocused(true); }}
              onBlur={() => { setHexFocused(false); }}
              onInput={(event) => { const next = event.currentTarget.value.replace(/[^\da-f]/gi, "").slice(0, 6).toUpperCase(); setHexDraft(next); updateColor(next, alphaFocused() ? Number(alphaDraft()) : alpha()); }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          </>
        }
        right={
          <input
            aria-label={`${props.label} opacity value`}
            type="text"
            inputmode="numeric"
            value={alphaFocused() ? `${alphaDraft()}%` : `${alpha()}%`}
            maxlength={4}
            class="msr:h-full msr:w-full msr:bg-transparent msr:px-1 msr:text-center msr:font-mono msr:text-[12px] msr:tabular-nums msr:text-ink-700 msr:outline-none"
            onFocus={() => { setAlphaDraft(String(alpha())); setAlphaFocused(true); }}
            onBlur={() => { setAlphaFocused(false); }}
            onInput={(event) => { const next = event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3); setAlphaDraft(next); const numeric = Number(next); if (Number.isFinite(numeric)) updateColor(hexFocused() ? hexDraft() : hex(), numeric); }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        }
      />
    </div>
  );
}

export function SettingsPanel(props: { model: MesurerModel; ownerWindow: Window; onResetSettings: () => void; onClearWorkspace: () => void; selectionSpacingStyle: SelectionSpacingStyle; onSelectionSpacingStyleChange: (patch: Partial<SelectionSpacingStyle>) => void }) {
  const patternTooltip = createTooltip(props.ownerWindow);
  const [pluginsExpanded, setPluginsExpanded] = createSignal(false);
  const [expandedPluginSections, setExpandedPluginSections] = createSignal<string[]>([]);
  const pluginSettings = useMesurerPluginSettings();
  const pluginEntries = () => pluginSettings?.plugins() ?? [];
  const version = () => pluginSettings?.version() ?? "0.1.0";
  const resetSettings = () => {
    props.onResetSettings();
    void pluginSettings?.reset();
  };
  const setTab = (tab: SettingsTab) => props.model.setTransient({ settingsTab: tab });
  const settings = () => props.model.state.settings;
  const updateGuide = (patch: Partial<GuideStyle>) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, ...patch } });
  const updateSpacing = (patch: Partial<SelectionSpacingStyle>) => props.onSelectionSpacingStyleChange(patch);
  const toggleFormat = (format: ColorPickerFormat) => {
    const current = props.model.current.settings.colorPickerFormats;
    const next = current.includes(format) ? current.filter((item) => item !== format) : [...current, format];
    props.model.updateSettings({ colorPickerFormats: next.length ? next : ["hex"] });
  };
  const tabs: Array<[SettingsTab, string]> = [
    ["guides", "Guides"],
    ["select", "Select"],
    ["color-picker", "Color"],
    ["rulers", "Rulers"],
    ["general", "General"],
  ];

  return (
    <div class="msr:flex msr:max-h-[min(70vh,34rem)] msr:flex-col msr:gap-2 msr:overflow-y-auto" onPointerDown={(event) => event.stopPropagation()}>
      <div class="mesurer-settings-tabs msr:flex msr:h-6 msr:shrink-0 msr:select-none msr:items-stretch msr:gap-0 msr:rounded-[5px] msr:bg-ink-50 msr:p-px" role="tablist" aria-label="Settings sections">
        <For each={tabs}>{([value, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.model.state.settingsTab === value ? "true" : "false"}
            class={`mesurer-settings-tab msr:relative msr:flex msr:min-w-0 msr:flex-1 msr:appearance-none msr:items-center msr:justify-center msr:whitespace-nowrap msr:px-1.5 msr:py-0 msr:text-[10px] msr:font-medium msr:transition-colors msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff] msr:rounded-[5px] ${props.model.state.settingsTab === value ? "msr:bg-white msr:text-ink-900" : "msr:text-ink-500 msr:hover:text-ink-700"}`}
            onClick={() => setTab(value)}
          >{label}</button>
        )}</For>
      </div>

      <Show when={props.model.state.settingsTab === "guides"}>
        <section class="msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1" aria-label="Guide settings">
          <ColorField label="Color" value={settings().guideColor} fallback="#f97316" ownerWindow={props.ownerWindow} onChange={(guideColor) => props.model.updateSettings({ guideColor })} />
          <SliderControl label="Weight" min={1} max={4} step={1} value={settings().guideStyle.width} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(width) => updateGuide({ width })} />
          <div class="msr:col-span-2 msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-3">
            <span class="msr:text-[12px] msr:text-ink-700">Pattern</span>
            <div class="msr:flex msr:gap-1" role="radiogroup" aria-label="Guide pattern" onMouseLeave={patternTooltip.onTooltipContainerLeave}>
              <For each={GUIDE_PATTERNS}>{({ value, label }) => {
                const selected = () => settings().guideStyle.pattern === value;
                const tooltipId = `guide-pattern-${value}`;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-label={`${label} guide pattern`}
                    aria-checked={selected() ? "true" : "false"}
                    class={`msr:relative msr:flex msr:h-6 msr:min-w-0 msr:flex-1 msr:items-center msr:justify-center msr:rounded-[5px] msr:border msr:px-1 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff] ${selected() ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]/10" : "msr:border-ink-200 msr:bg-ink-50 msr:hover:bg-ink-100"}`}
                    onClick={() => updateGuide({ pattern: value })}
                    onMouseEnter={() => patternTooltip.onTooltipEnter(tooltipId)}
                    onFocus={() => patternTooltip.onTooltipEnter(tooltipId)}
                    onBlur={patternTooltip.onTooltipLeave}
                  >
                    <span aria-hidden="true" class={`msr:block msr:w-full msr:border-t-2 msr:border-ink-700 ${value === "dashed" ? "msr:border-dashed" : value === "dotted" ? "msr:border-dotted" : "msr:border-solid"}`} />
                    <Tooltip label={label} visible={patternTooltip.visibleTooltipId() === tooltipId} instant={patternTooltip.tooltipInstant()} class="msr:z-10" />
                  </button>
                );
              }}</For>
            </div>
          </div>
          <Show when={settings().guideStyle.pattern !== "solid"}>
            <SliderControl label="Length" min={2} max={24} step={1} value={settings().guideStyle.dashLength} formatValue={(value) => `${value}px`} onChange={(dashLength) => updateGuide({ dashLength })} />
            <SliderControl label="Gap" min={0} max={24} step={1} value={settings().guideStyle.gap} formatValue={(value) => `${value}px`} onChange={(gap) => updateGuide({ gap })} />
          </Show>
          <SettingsSwitch label="Snap" checked={settings().snapGuidesEnabled} onChange={(snapGuidesEnabled) => props.model.updateSettings({ snapGuidesEnabled })} />
          <SettingsSwitch label="Highlight" checked={settings().selectNewGuideEnabled} onChange={(selectNewGuideEnabled) => props.model.updateSettings({ selectNewGuideEnabled })} />
        </section>
      </Show>

      <Show when={props.model.state.settingsTab === "select"}>
        <section class="msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1" aria-label="Selection settings">
          <ColorField label="Color" value={settings().highlightColor} fallback="#0d99ff" ownerWindow={props.ownerWindow} onChange={(highlightColor) => props.model.updateSettings({ highlightColor })} />
          <SettingsSwitch label="Hover" checked={settings().hoverHighlightEnabled} onChange={(hoverHighlightEnabled) => props.model.updateSettings({ hoverHighlightEnabled })} />
          <SettingsSwitch label="Element snap" checked={settings().snapEnabled} onChange={(snapEnabled) => props.model.updateSettings({ snapEnabled })} />
          <SettingsSwitch label="Stack" checked={settings().multiMeasureEnabled} onChange={(multiMeasureEnabled) => props.model.updateSettings({ multiMeasureEnabled })} />
        <div data-mesurer-distance="true" class="msr:col-span-2 msr:mt-1 msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1 msr:border-t msr:border-ink-100 msr:pt-2">
          <div class="msr:col-span-2 msr:text-[10px] msr:font-semibold msr:text-ink-500">Selection spacing</div>
          <SettingsSwitch label="Show" checked={props.selectionSpacingStyle.enabled} onChange={(enabled) => updateSpacing({ enabled })} />
          <SettingsSwitch label="Diagonals" checked={props.selectionSpacingStyle.diagonals} onChange={(diagonals) => updateSpacing({ diagonals })} />
          <ColorField label="Line color" value={props.selectionSpacingStyle.color} fallback="#2563eb" ownerWindow={props.ownerWindow} onChange={(color) => updateSpacing({ color })} />
          <SliderControl label="Weight" min={1} max={4} step={1} value={props.selectionSpacingStyle.width} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(width) => updateSpacing({ width })} />
          <div class="msr:col-span-2 msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-3">
            <span class="msr:text-[12px] msr:text-ink-700">Pattern</span>
            <div class="msr:flex msr:gap-1" role="radiogroup" aria-label="Selection spacing pattern" onMouseLeave={patternTooltip.onTooltipContainerLeave}>
              <For each={GUIDE_PATTERNS}>{({ value, label }) => {
                const selected = () => props.selectionSpacingStyle.pattern === value;
                const tooltipId = `spacing-pattern-${value}`;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-label={`${label} spacing pattern`}
                    aria-checked={selected() ? "true" : "false"}
                    class={`msr:relative msr:flex msr:h-6 msr:min-w-0 msr:flex-1 msr:items-center msr:justify-center msr:rounded-[5px] msr:border msr:px-1 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff] ${selected() ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]/10" : "msr:border-ink-200 msr:bg-ink-50 msr:hover:bg-ink-100"}`}
                    onClick={() => updateSpacing({ pattern: value })}
                    onMouseEnter={() => patternTooltip.onTooltipEnter(tooltipId)}
                    onFocus={() => patternTooltip.onTooltipEnter(tooltipId)}
                    onBlur={patternTooltip.onTooltipLeave}
                  >
                    <span aria-hidden="true" class={`msr:block msr:w-full msr:border-t-2 msr:border-ink-700 ${value === "dashed" ? "msr:border-dashed" : value === "dotted" ? "msr:border-dotted" : "msr:border-solid"}`} />
                    <Tooltip label={label} visible={patternTooltip.visibleTooltipId() === tooltipId} instant={patternTooltip.tooltipInstant()} class="msr:z-10" />
                  </button>
                );
              }}</For>
            </div>
          </div>
          <Show when={props.selectionSpacingStyle.pattern !== "solid"}>
            <SliderControl label="Length" min={2} max={24} step={1} value={props.selectionSpacingStyle.dashLength} formatValue={(value) => `${value}px`} onChange={(dashLength) => updateSpacing({ dashLength })} />
            <SliderControl label="Gap" min={0} max={24} step={1} value={props.selectionSpacingStyle.gap} formatValue={(value) => `${value}px`} onChange={(gap) => updateSpacing({ gap })} />
          </Show>
        </div>
      </section>
      </Show>

      <Show when={props.model.state.settingsTab === "color-picker"}>
        <section class="msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1" aria-label="Color settings">
          <div class="msr:col-span-2 msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-3">
            <span class="msr:text-[12px] msr:text-ink-700">Format</span>
            <div class="msr:flex msr:min-w-0 msr:gap-1">
              <For each={COLOR_FORMATS}>{(format) => (
                <button
                  type="button"
                  aria-pressed={settings().colorPickerFormats.includes(format) ? "true" : "false"}
                  class={`msr:h-6 msr:min-w-0 msr:flex-1 msr:rounded-[5px] msr:border msr:px-1 msr:text-[11px] msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff] ${settings().colorPickerFormats.includes(format) ? "msr:border-[#0d99ff] msr:bg-[#0d99ff] msr:text-white" : "msr:border-ink-200 msr:text-ink-500 msr:hover:bg-ink-50"}`}
                  onClick={() => toggleFormat(format)}
                >{format}</button>
              )}</For>
            </div>
          </div>
          <label class="msr:col-span-2 msr:flex msr:items-center msr:justify-between msr:gap-3 msr:text-[12px] msr:text-ink-700">
            Copy
            <select value={settings().colorPickerClickFormat} class="msr:rounded-[5px] msr:border msr:border-ink-200 msr:bg-white msr:px-1.5 msr:py-1 msr:text-[11px] msr:outline-none msr:focus:shadow-[inset_0_0_0_1px_#0d99ff]" onChange={(event) => {
              const value = event.currentTarget.value;
              if (isColorPickerFormat(value)) props.model.updateSettings({ colorPickerClickFormat: value });
            }}>
              <For each={COLOR_FORMATS}>{(format) => <option value={format}>{format}</option>}</For>
            </select>
          </label>
        </section>
      </Show>

      <Show when={props.model.state.settingsTab === "rulers"}>
        <section class="msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1" aria-label="Ruler settings">
          <SliderControl label="Opacity" min={0.2} max={1} step={0.05} value={settings().rulerSettings.opacity} formatValue={(value) => `${Math.round(value * 100)}%`} parseInput={(input) => Number.parseFloat(input) / 100} onChange={(opacity) => props.model.updateSettings({ rulerSettings: { ...props.model.current.settings.rulerSettings, opacity } })} />
          <SettingsSwitch label="Edge reveal" checked={settings().rulerSettings.edgeReveal} onChange={(edgeReveal) => props.model.updateSettings({ rulerSettings: { ...props.model.current.settings.rulerSettings, edgeReveal } })} />
        </section>
      </Show>

      <Show when={props.model.state.settingsTab === "general"}>
        <section class="msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1" aria-label="General settings">
          <SettingsSwitch label="Persist" checked={settings().persistOnReload} onChange={(persistOnReload) => props.model.updateSettings({ persistOnReload })} />
          <Show when={pluginEntries().length > 0}>
            <div
              class="msr:col-span-2 msr:mt-1 msr:overflow-hidden msr:rounded-[6px] msr:bg-ink-50/40"
              data-mesurer-plugin-settings="true"
            >
              <button
                type="button"
                data-mesurer-plugin-settings-disclosure="plugins"
                aria-expanded={pluginsExpanded() ? "true" : "false"}
                class="msr:flex msr:h-7 msr:w-full msr:items-center msr:gap-2 msr:px-2 msr:text-left msr:text-[11px] msr:font-medium msr:text-ink-700 msr:hover:bg-ink-50"
                onClick={() => setPluginsExpanded((value) => !value)}
              >
                <span class="msr:flex-1">Plugins</span>
                <span class="msr:text-[10px] msr:font-normal msr:text-ink-400">{pluginEntries().length}</span>
                <CaretDownIcon size={10} class={pluginsExpanded() ? "msr:rotate-180" : ""} />
              </button>
              <Show when={pluginsExpanded()}>
                <div class="msr:flex msr:flex-col" data-mesurer-plugin-settings-list="true">
                  <For each={pluginEntries()}>{(plugin) => {
                    const expanded = () => expandedPluginSections().includes(plugin.id);
                    const canExpand = () => plugin.enabled && plugin.sections.length > 0;
                    const toggleExpanded = () => {
                      if (!canExpand()) return;
                      setExpandedPluginSections((current) =>
                        current.includes(plugin.id)
                          ? current.filter((id) => id !== plugin.id)
                          : [...current, plugin.id]);
                    };
                    const setEnabled = (enabled: boolean) => {
                      pluginSettings?.setEnabled(plugin.id, enabled);
                    };
                    return (
                      <div data-mesurer-plugin-settings-section={plugin.id} class="msr:relative">
                        <div class="msr:grid msr:h-7 msr:w-full msr:grid-cols-[minmax(0,1fr)_28px_34px] msr:items-center msr:hover:bg-ink-50">
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
                        </div>
                        <Show when={canExpand() && expanded()}>
                          <div class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:px-2 msr:py-1" data-mesurer-plugin-settings-controls={plugin.id}>
                            <For each={plugin.sections}>{(section) => (
                              <For each={section.controls ?? []}>{(control) => (
                                <PluginSettingsSwitch
                                  label={control.label}
                                  checked={control.value()}
                                  disabled={control.disabled?.() ?? false}
                                  onChange={(value) => pluginSettings?.update(section.id, control, value)}
                                />
                              )}</For>
                            )}</For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}</For>
                </div>
              </Show>
            </div>
          </Show>
          <div class="msr:col-span-2 msr:grid msr:h-6 msr:grid-cols-[78px_156px] msr:items-center msr:gap-3 msr:text-[12px] msr:text-ink-700">
            <span>Version</span>
            <span class="msr:justify-self-end msr:font-mono msr:text-[11px] msr:tabular-nums msr:text-ink-700">{version()}</span>
          </div>
          <div class="msr:col-span-2 msr:flex msr:justify-end msr:gap-1">
            <button type="button" aria-label="Reset settings to defaults" class="msr:rounded-[5px] msr:border msr:border-ink-200 msr:px-2 msr:py-1 msr:text-[11px] msr:text-ink-700 msr:hover:bg-ink-50 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#0d99ff]" onClick={resetSettings}>Use defaults</button>
            <button type="button" aria-label="Clear workspace" class="msr:rounded-[5px] msr:border msr:border-red-200 msr:px-2 msr:py-1 msr:text-[11px] msr:text-red-600 msr:hover:bg-red-50 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_#ef4444]" onClick={() => props.onClearWorkspace()}>Clear workspace</button>
          </div>
        </section>
      </Show>
    </div>
  );
}
