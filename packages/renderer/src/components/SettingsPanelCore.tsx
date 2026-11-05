import { For, Show, createSignal, onSettled } from "solid-js";
import type { ColorPickerFormat } from "../core/colors";
import { trySetPointerCapture } from "../core/events";
import type { GuideStyle, MesurerTheme, SelectionSpacingStyle } from "../core/persistence";
import type { MesurerModel } from "../model/create-mesurer-model";
import { useMesurerPluginSettings } from "../plugins/settings-runtime";
import { ColorField, ControlShell, SETTINGS_COLUMNS, SettingsSelectCaret, settingsSelectClassName } from "./ControlField";
import { CaretDownIcon, CheckIcon } from "./Icons";
import { Tooltip, createTooltip } from "./Tooltip";

const COLOR_FORMATS: ColorPickerFormat[] = ["hex", "rgb", "hsl", "oklch"];

const isColorPickerFormat = (value: string): value is ColorPickerFormat =>
  COLOR_FORMATS.some((format) => format === value);

const isMesurerTheme = (value: string): value is MesurerTheme =>
  value === "system" || value === "light" || value === "dark";

const isInfoCardMode = (value: string): value is "off" | "click" | "hover" =>
  value === "off" || value === "click" || value === "hover";

const GUIDE_PATTERNS: Array<{ value: GuideStyle["pattern"]; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const ROW = `msr:col-span-2 msr:grid msr:h-8 msr:w-full ${SETTINGS_COLUMNS} msr:items-center msr:gap-0 msr:text-[12px] msr:text-ink-700`;

const switchTrackClass = (checked: boolean) =>
  `mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${checked ? "msr:border-[var(--msr-accent)] msr:bg-[var(--msr-accent)]" : "msr:border-ink-200 msr:bg-ink-50"}`;

function SwitchThumb(props: { checked: boolean }) {
  return (
    <span
      class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:transition-transform"
      style={{ transform: `translateX(${props.checked ? 12 : 0}px)` }}
    />
  );
}

function SettingsSwitch(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  solidOnly?: string;
  presentationId?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="msr:col-span-2">
      <button
        type="button"
        role="switch"
        aria-checked={props.checked ? "true" : "false"}
        disabled={props.disabled}
        data-mesurer-current-only-extension={props.solidOnly}
        data-mesurer-presentation-setting={props.presentationId}
        class={`msr:grid msr:h-8 msr:w-full msr:appearance-none ${SETTINGS_COLUMNS} msr:items-center msr:gap-0 msr:text-left msr:text-[12px] msr:leading-none msr:text-ink-700 msr:disabled:opacity-45`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span>{props.label}</span>
        <span aria-hidden="true" style={{ "justify-self": "end" }} data-checked={props.checked ? "true" : "false"} class={switchTrackClass(props.checked)}>
          <SwitchThumb checked={props.checked} />
        </span>
      </button>
    </div>
  );
}

function PluginSettingsSwitch(props: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked ? "true" : "false"}
      disabled={props.disabled}
      class="msr:flex msr:h-8 msr:w-full msr:items-center msr:justify-between msr:gap-2 msr:pr-0 msr:text-left msr:text-[12px] msr:leading-none msr:text-ink-700 msr:disabled:opacity-45"
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="mesurer-plugin-setting-label msr:ml-6 msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap">{props.label}</span>
      <span aria-hidden="true" data-checked={props.checked ? "true" : "false"} class={switchTrackClass(props.checked)}>
        <SwitchThumb checked={props.checked} />
      </span>
    </button>
  );
}

function SettingsButton(props: { label: string; danger?: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      class={`msr:flex msr:h-6 msr:items-center msr:gap-1.5 msr:rounded-control msr:border msr:px-2 msr:text-[11px] msr:focus-visible:outline-none ${props.danger
        ? "msr:border-[var(--msr-danger-border)] msr:text-[var(--msr-danger-text)] msr:hover:bg-[var(--msr-danger-bg)] msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-danger-text)]"
        : "mesurer-settings-button-default msr:border-ink-200 msr:text-ink-700 msr:hover:bg-ink-50 msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-accent)]"}`}
      onClick={props.onClick}
    >
      <span>{props.children}</span>
    </button>
  );
}

function SettingsSection(props: { id: string; title: string; ariaLabel: string; children: any }) {
  return (
    <section
      data-mesurer-settings-section={props.id}
      class={`msr:grid msr:w-full ${SETTINGS_COLUMNS} msr:items-center msr:gap-0 msr:px-3 msr:py-2 msr:outline-none`}
      aria-label={props.ariaLabel}
    >
      <h2 class="msr:col-span-2 msr:flex msr:h-8 msr:items-center msr:text-[11px] msr:font-semibold msr:text-ink-500">{props.title}</h2>
      {props.children}
    </section>
  );
}

function SectionDivider() {
  return <div aria-hidden="true" class="msr:h-px msr:w-full msr:shrink-0 msr:bg-ink-200" />;
}

function SelectRow(props: {
  label: string;
  ariaLabel?: string;
  value: string;
  caret?: boolean;
  solidOnly?: string;
  onChange: (value: string) => void;
  children: any;
}) {
  return (
    <label data-mesurer-current-only-extension={props.solidOnly} class={ROW}>
      <span>{props.label}</span>
      <Show
        when={props.caret}
        fallback={
          <select
            aria-label={props.ariaLabel}
            value={props.value}
            class={settingsSelectClassName.replace("msr:pr-6 ", "")}
            onChange={(event) => props.onChange(event.currentTarget.value)}
          >
            {props.children}
          </select>
        }
      >
        <span class="msr:relative msr:block msr:w-full">
          <select
            aria-label={props.ariaLabel}
            value={props.value}
            class={settingsSelectClassName}
            onChange={(event) => props.onChange(event.currentTarget.value)}
          >
            {props.children}
          </select>
          <SettingsSelectCaret />
        </span>
      </Show>
    </label>
  );
}

function PatternRadios(props: {
  name: string;
  tooltipPrefix: string;
  value: GuideStyle["pattern"];
  tooltip: ReturnType<typeof createTooltip>;
  onChange: (pattern: GuideStyle["pattern"]) => void;
}) {
  return (
    <div class="msr:col-span-2 msr:grid msr:grid-cols-[78px_minmax(0,1fr)] msr:items-center msr:gap-0">
      <span class="msr:text-[12px] msr:text-ink-700">Pattern</span>
      <div class="msr:flex msr:gap-1" role="radiogroup" aria-label={`${props.name} pattern`} onMouseLeave={props.tooltip.onTooltipContainerLeave}>
        <For each={GUIDE_PATTERNS}>{({ value, label }) => {
          const selected = () => props.value === value;
          const tooltipId = `${props.tooltipPrefix}-pattern-${value}`;

          return (
            <button
              type="button"
              role="radio"
              aria-label={`${label} ${props.name.toLowerCase()} pattern`}
              aria-checked={selected() ? "true" : "false"}
              class={`msr:relative msr:flex msr:h-6 msr:min-w-0 msr:flex-1 msr:items-center msr:justify-center msr:rounded-control msr:border msr:px-1 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-accent)] ${selected() ? "msr:border-[var(--msr-accent)] msr:bg-[#0d99ff]/10" : "msr:border-ink-200 msr:bg-ink-50 msr:hover:bg-ink-100"}`}
              onClick={() => props.onChange(value)}
              onMouseEnter={() => props.tooltip.onTooltipEnter(tooltipId)}
              onFocus={() => props.tooltip.onTooltipEnter(tooltipId)}
              onBlur={props.tooltip.onTooltipLeave}
            >
              <span aria-hidden="true" class={`msr:block msr:w-full msr:border-t-2 msr:border-ink-700 ${value === "dashed" ? "msr:border-dashed" : value === "dotted" ? "msr:border-dotted" : "msr:border-solid"}`} />
              <Tooltip label={label} visible={props.tooltip.visibleTooltipId() === tooltipId} instant={props.tooltip.tooltipInstant()} class="msr:z-10" />
            </button>
          );
        }}</For>
      </div>
    </div>
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
  const clamp = (value: number) => Number(Math.min(props.max, Math.max(props.min, value)).toFixed(4));
  const setClamped = (value: number) => props.onChange(clamp(value));

  const updateValue = (value: number) => {
    const next = clamp(value);

    setDraft(formatValue(next));
    props.onChange(next);
  };

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
    <div class={`msr:col-span-2 msr:grid msr:h-8 msr:w-full msr:min-w-0 ${SETTINGS_COLUMNS} msr:items-center msr:gap-0`}>
      <span class="msr:text-[11px] msr:font-medium msr:text-ink-700">{props.label}</span>
      <ControlShell
        left={
          <div
            ref={(element) => { sliderElement = element; }}
            class="msr:relative msr:min-w-0 msr:flex-1 msr:touch-none msr:select-none msr:px-2"
            style={{ height: "20px" }}
            data-slider-container="true"
            onPointerDown={(event) => { event.stopPropagation(); trySetPointerCapture(event.currentTarget, event.pointerId); updateFromPointer(event, event.currentTarget); }}
            onPointerUp={(event) => {
              event.stopPropagation();

              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              event.stopPropagation();

              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div class="msr:absolute msr:left-[8px] msr:right-[8px] msr:rounded-full" style={{ top: "8px", height: "4px", "background-color": "var(--msr-slider-track, rgba(15, 23, 42, 0.16))" }} />
            <div class="msr:absolute msr:left-[8px] msr:rounded-full" style={{ top: "8px", width: `calc(${percentage()}% - ${percentage() * 0.16}px)`, height: "4px", "background-color": "var(--msr-accent, #0d99ff)" }} />
            <div
              class="mesurer-control-thumb msr:absolute msr:rounded-control msr:bg-white msr:shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] msr:outline-none msr:focus-visible:ring-1 msr:focus-visible:ring-[#0d99ff]/25"
              data-slider-thumb="true"
              style={{ left: `calc(8px + (100% - 16px) * ${percentage() / 100})`, top: "4px", width: "12px", height: "12px", transform: "translateX(-50%)" }}
              role="slider"
              tabindex={0}
              aria-label={props.label}
              aria-valuemin={props.min}
              aria-valuemax={props.max}
              aria-valuenow={props.value}
              aria-valuetext={formatValue(props.value)}
              aria-orientation="horizontal"
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
            class="msr:h-full msr:w-full msr:shrink-0 msr:border-0 msr:bg-transparent msr:px-1 msr:text-left msr:font-mono msr:text-[12px] msr:font-medium msr:tabular-nums msr:text-ink-700 msr:outline-none"
            style={{ "box-sizing": "border-box", "border-radius": "0 5px 5px 0", "line-height": "1rem" }}
            value={editing() ? draft() : formatValue(props.value)}
            onFocus={() => { setDraft(formatValue(props.value)); setEditing(true); }}
            onInput={(event) => {
              setDraft(event.currentTarget.value);

              const next = parseInput(event.currentTarget.value);

              if (Number.isFinite(next)) setClamped(next);
            }}
            onBlur={() => {
              const next = parseInput(draft());

              if (Number.isFinite(next)) setClamped(next);

              setEditing(false);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.stopPropagation();
                event.preventDefault();
                updateValue(props.value + (event.key === "ArrowUp" ? 1 : -1) * props.step);
              } else if (event.key === "Enter") {
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.blur();
              } else event.stopPropagation();
            }}
          />
        }
      />
    </div>
  );
}

function FormatMultiSelect(props: {
  ownerWindow: Window;
  formats: ColorPickerFormat[];
  selected: ColorPickerFormat[];
  onChange: (formats: ColorPickerFormat[]) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [menuSide, setMenuSide] = createSignal<"top" | "bottom">("bottom");
  const [activeIndex, setActiveIndex] = createSignal(0);
  const listboxId = `mesurer-color-formats-${Math.random().toString(36).slice(2)}`;
  let container: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let listbox: HTMLDivElement | undefined;
  const options: Array<HTMLButtonElement | undefined> = [];

  onSettled(() => {
    const doc = props.ownerWindow.document;

    const dismiss = (event: Event) => {
      if (container && !event.composedPath().includes(container)) setOpen(false);
    };

    doc.addEventListener("pointerdown", dismiss, true);
    doc.addEventListener("click", dismiss, true);

    return () => {
      doc.removeEventListener("pointerdown", dismiss, true);
      doc.removeEventListener("click", dismiss, true);
    };
  });

  const place = () => {
    if (!trigger || !listbox) return;
    const rect = trigger.getBoundingClientRect();
    const height = listbox.getBoundingClientRect().height;
    const below = rect.bottom + 4 + height <= props.ownerWindow.innerHeight - 8;
    const above = rect.top - 4 - height >= 8;
    setMenuSide(below || !above ? "bottom" : "top");
  };

  const toggle = (format: ColorPickerFormat) => {
    if (!props.selected.includes(format)) return props.onChange([...props.selected, format]);

    if (props.selected.length > 1) props.onChange(props.selected.filter((item) => item !== format));
  };

  const openMenu = () => {
    const first = Math.max(0, props.formats.findIndex((format) => props.selected.includes(format)));
    setActiveIndex(first);
    setOpen(true);
    props.ownerWindow.requestAnimationFrame(place);

    return first;
  };

  const focusOption = (index: number) => {
    setActiveIndex(index);
    options[index]?.focus();
  };

  return (
    <div ref={(element) => { container = element; }} data-mesurer-format-select="true" class="msr:relative msr:w-full">
      <button
        ref={(element) => { trigger = element; }}
        type="button"
        role="combobox"
        aria-label="Color formats"
        aria-expanded={open() ? "true" : "false"}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        class="mesurer-settings-select msr:relative msr:h-6 msr:w-full msr:rounded-control msr:border msr:border-ink-200 msr:bg-white msr:px-1.5 msr:pr-6 msr:text-left msr:text-[11px] msr:text-ink-700 msr:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-accent)]"
        onBlur={(event) => {
          const next = event.relatedTarget;

          if (!(next instanceof Node) || !container?.contains(next)) setOpen(false);
        }}
        onClick={() => (open() ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            const index = open() ? activeIndex() : openMenu();
            props.ownerWindow.requestAnimationFrame(() => options[index]?.focus());
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {props.selected.join(", ")}
        <span aria-hidden="true" class="msr:pointer-events-none msr:absolute msr:right-2 msr:top-1/2 msr:size-1.5 msr:-translate-y-1/2 msr:rotate-45 msr:border-r msr:border-b msr:border-ink-500" />
      </button>
      <Show when={open()}>
        <div
          ref={(element) => { listbox = element; queueMicrotask(place); }}
          role="listbox"
          id={listboxId}
          aria-label="Color formats"
          aria-multiselectable="true"
          class={`mesurer-settings-select-menu msr:absolute msr:left-0 msr:right-0 msr:z-10 msr:rounded-control msr:bg-white msr:p-1 ${menuSide() === "bottom" ? "msr:top-full msr:mt-1" : "msr:bottom-full msr:mb-1"}`}
          style={{ "box-shadow": "var(--msr-shadow-select-menu, var(--msr-shadow-floating))" }}
        >
          <For each={props.formats}>{(format, index) => {
            const selected = () => props.selected.includes(format);

            return (
              <button
                ref={(element) => { options[index()] = element; }}
                type="button"
                role="option"
                aria-selected={selected() ? "true" : "false"}
                tabindex={index() === activeIndex() ? 0 : -1}
                class="msr:flex msr:h-6 msr:w-full msr:items-center msr:justify-between msr:rounded-[3px] msr:px-1.5 msr:text-left msr:text-[11px] msr:text-ink-700 msr:outline-none msr:hover:bg-ink-100 msr:focus-visible:bg-ink-100"
                onClick={() => toggle(format)}
                onFocus={() => setActiveIndex(index())}
                onKeyDown={(event) => {
                  const last = props.formats.length - 1;

                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    focusOption(Math.min(last, Math.max(0, index() + (event.key === "ArrowDown" ? 1 : -1))));
                  } else if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    focusOption(event.key === "Home" ? 0 : last);
                  } else if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    toggle(format);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    trigger?.focus();
                  }
                }}
              >
                <span>{format}</span>
                <Show when={selected()}><CheckIcon size={10} class="msr:ml-auto msr:shrink-0 msr:text-ink-700" /></Show>
              </button>
            );
          }}</For>
        </div>
      </Show>
    </div>
  );
}

function PluginSettings() {
  const pluginSettings = useMesurerPluginSettings();
  const [expanded, setExpanded] = createSignal(false);
  const [expandedPlugins, setExpandedPlugins] = createSignal<string[]>([]);
  const entries = () => pluginSettings?.plugins() ?? [];

  return (
    <Show when={entries().length > 0}>
      <div
        class="msr:col-span-2 msr:mt-1 msr:rounded-[6px] msr:bg-ink-50/40"
        data-mesurer-plugin-settings="true"
        data-mesurer-current-only-extension="plugins"
        style={{ overflow: "clip" }}
      >
        <button
          type="button"
          data-mesurer-plugin-settings-disclosure="plugins"
          aria-expanded={expanded() ? "true" : "false"}
          class="msr:flex msr:h-7 msr:w-full msr:items-center msr:gap-1 msr:px-2 msr:text-left msr:text-[11px] msr:font-medium msr:text-ink-700 msr:hover:bg-ink-50"
          onClick={() => setExpanded((value) => !value)}
        >
          <span class="msr:flex-1">Plugins</span>
          <span class="msr:text-[10px] msr:font-normal msr:text-ink-500">{entries().length}</span>
          <CaretDownIcon size={10} class={expanded() ? "msr:rotate-180" : ""} />
        </button>
        <Show when={expanded()}>
          <div class="msr:flex msr:flex-col" data-mesurer-plugin-settings-list="true">
            <For each={entries()}>{(plugin) => {
              const open = () => expandedPlugins().includes(plugin.id);
              const canExpand = () => plugin.enabled && plugin.sections.length > 0;

              const toggleOpen = () => {
                if (!canExpand()) return;
                setExpandedPlugins((current) => current.includes(plugin.id) ? current.filter((id) => id !== plugin.id) : [...current, plugin.id]);
              };

              return (
                <div data-mesurer-plugin-settings-section={plugin.id} class="msr:relative">
                  <div class="msr:grid msr:h-7 msr:w-full msr:grid-cols-[minmax(0,1fr)_28px_34px] msr:items-center msr:hover:bg-ink-50">
                    <Show
                      when={canExpand()}
                      fallback={(
                        <span data-mesurer-plugin-label={plugin.id} class="msr:col-start-1 msr:col-end-3 msr:ml-2 msr:min-w-0 msr:truncate msr:whitespace-nowrap msr:pr-2 msr:text-[11px] msr:text-ink-700">
                          {plugin.label}
                        </span>
                      )}
                    >
                      <button
                        type="button"
                        aria-label={`${plugin.label} settings`}
                        data-mesurer-plugin-settings-disclosure={plugin.id}
                        aria-expanded={open() ? "true" : "false"}
                        class="msr:col-start-1 msr:col-end-3 msr:flex msr:h-full msr:min-w-0 msr:items-center msr:text-left msr:text-ink-700 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-accent)]"
                        onClick={toggleOpen}
                      >
                        <span data-mesurer-plugin-label={plugin.id} class="msr:ml-2 msr:min-w-0 msr:flex-1 msr:truncate msr:whitespace-nowrap msr:pr-2 msr:text-[11px]">{plugin.label}</span>
                        <span class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:text-ink-500">
                          <CaretDownIcon size={9} class={open() ? "msr:rotate-180" : ""} />
                        </span>
                      </button>
                    </Show>
                    <button
                      type="button"
                      role="switch"
                      aria-label={plugin.label}
                      aria-checked={plugin.enabled ? "true" : "false"}
                      disabled={plugin.busy}
                      data-mesurer-plugin-toggle={plugin.id}
                      class="msr:col-start-3 msr:flex msr:h-full msr:w-full msr:items-center msr:justify-end msr:disabled:opacity-45 msr:focus-visible:outline-none msr:focus-visible:shadow-[inset_0_0_0_1px_var(--msr-accent)]"
                      onClick={() => pluginSettings?.setEnabled(plugin.id, !plugin.enabled)}
                    >
                      <span aria-hidden="true" data-checked={plugin.enabled ? "true" : undefined} class={switchTrackClass(plugin.enabled)}>
                        <SwitchThumb checked={plugin.enabled} />
                      </span>
                    </button>
                  </div>
                  <Show when={plugin.description || plugin.error}>
                    <div class="msr:bg-white/60 msr:px-2 msr:pb-1.5 msr:pt-0.5">
                      <Show when={plugin.description}>
                        <p class="msr:m-0 msr:text-[10px] msr:leading-4 msr:text-ink-500" data-mesurer-plugin-description={plugin.id}>{plugin.description}</p>
                      </Show>
                      <Show when={plugin.error}>
                        <p class="msr:m-0 msr:text-[10px] msr:leading-4 msr:text-ink-700" data-mesurer-plugin-error={plugin.id} role="status">{plugin.error}</p>
                      </Show>
                    </div>
                  </Show>
                  <Show when={canExpand() && open()}>
                    <div class="msr:flex msr:flex-col msr:gap-0.5 msr:bg-white/60 msr:py-1" data-mesurer-plugin-settings-controls={plugin.id}>
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
  );
}

export function SettingsPanel(props: { model: MesurerModel; ownerWindow: Window; onResetSettings: () => void; onClearWorkspace: () => void; selectionSpacingStyle: SelectionSpacingStyle; onSelectionSpacingStyleChange: (patch: Partial<SelectionSpacingStyle>) => void }) {
  const patternTooltip = createTooltip(props.ownerWindow);
  const pluginSettings = useMesurerPluginSettings();
  const version = () => pluginSettings?.version() ?? "0.1.0";
  let panelElement: HTMLDivElement | undefined;

  const resetSettings = () => {
    props.onResetSettings();
    void pluginSettings?.reset();
  };

  const settings = () => props.model.state.settings;
  const updateGuide = (patch: Partial<GuideStyle>) => props.model.updateSettings({ guideStyle: { ...props.model.current.settings.guideStyle, ...patch } });
  const updateSpacing = (patch: Partial<SelectionSpacingStyle>) => props.onSelectionSpacingStyleChange(patch);
  const updateRulers = (patch: Partial<ReturnType<typeof settings>["rulerSettings"]>) => props.model.updateSettings({ rulerSettings: { ...props.model.current.settings.rulerSettings, ...patch } });

  // Scroll the section that belongs to the active tool to the top. When it is too near the end to
  // reach the top, pad the panel so it still can.
  onSettled(() => {
    const panel = panelElement;
    const focus = props.model.current.settingsFocus;

    if (!panel) return;
    // SAFETY: ownerWindow is the browsing-context global that owns the observer constructor.
    const realm = (panel.ownerDocument.defaultView ?? props.ownerWindow) as Window & typeof globalThis;

    const align = () => {
      panel.style.paddingBottom = "0px";
      const section = focus ? panel.querySelector<HTMLElement>(`[data-mesurer-settings-section="${focus}"]`) : null;

      if (!section) {
        panel.scrollTop = 0;

        return;
      }

      const top = section.offsetTop;
      const extra = Math.max(0, top - Math.max(0, panel.scrollHeight - panel.clientHeight));

      if (extra > 0) panel.style.paddingBottom = `${extra}px`;
      panel.scrollTop = Math.min(top, Math.max(0, panel.scrollHeight - panel.clientHeight));
    };

    align();
    const frame = realm.requestAnimationFrame(() => align());
    const observer = new realm.ResizeObserver(align);
    observer.observe(panel);

    return () => {
      realm.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  return (
    <div
      ref={(element) => { panelElement = element; }}
      class="mesurer-settings-panel mesurer-thin-scrollbar msr:relative msr:flex msr:max-h-[min(70vh,34rem)] msr:w-full msr:min-w-0 msr:flex-col msr:gap-0 msr:overflow-y-auto msr:text-[12px] msr:leading-[1.5] msr:text-[color:var(--msr-content)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <SettingsSection id="guides" title="Guides" ariaLabel="Guide settings">
        <ColorField label="Color" value={settings().guideColor} fallback="#f97316" ownerWindow={props.ownerWindow} onChange={(guideColor) => props.model.updateSettings({ guideColor })} />
        <SliderControl label="Weight" min={1} max={4} step={1} value={settings().guideStyle.width} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(width) => updateGuide({ width })} />
        <PatternRadios name="Guide" tooltipPrefix="guide" value={settings().guideStyle.pattern} tooltip={patternTooltip} onChange={(pattern) => updateGuide({ pattern })} />
        <Show when={settings().guideStyle.pattern !== "solid"}>
          <SliderControl label="Length" min={2} max={24} step={1} value={settings().guideStyle.dashLength} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(dashLength) => updateGuide({ dashLength })} />
          <SliderControl label="Gap" min={0} max={24} step={1} value={settings().guideStyle.gap} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(gap) => updateGuide({ gap })} />
        </Show>
        <SettingsSwitch label="Snap" checked={settings().snapGuidesEnabled} onChange={(snapGuidesEnabled) => props.model.updateSettings({ snapGuidesEnabled })} />
        <SettingsSwitch label="Highlight" checked={settings().selectNewGuideEnabled} onChange={(selectNewGuideEnabled) => props.model.updateSettings({ selectNewGuideEnabled })} />
      </SettingsSection>

      <SectionDivider />
      <SettingsSection id="inspect" title="Inspect" ariaLabel="Inspect settings">
        <ColorField label="Color" value={settings().highlightColor} fallback="#0d99ff" ownerWindow={props.ownerWindow} onChange={(highlightColor) => props.model.updateSettings({ highlightColor })} />
        <SettingsSwitch label="Hover" checked={settings().hoverHighlightEnabled} onChange={(hoverHighlightEnabled) => props.model.updateSettings({ hoverHighlightEnabled })} />
        <SettingsSwitch label="Element snap" checked={settings().snapEnabled} onChange={(snapEnabled) => props.model.updateSettings({ snapEnabled })} />
        <SettingsSwitch label="Stack" checked={settings().multiMeasureEnabled} onChange={(multiMeasureEnabled) => props.model.updateSettings({ multiMeasureEnabled })} />
        <SelectRow
          label="Info card"
          ariaLabel="Info card mode"
          solidOnly="inspect-info-mode"
          value={settings().infoCardMode}
          onChange={(value) => { if (isInfoCardMode(value)) props.model.updateSettings({ infoCardMode: value }); }}
        >
          <option value="off">Off</option>
          <option value="click">Click</option>
          <option value="hover">Hover</option>
        </SelectRow>
        <SettingsSwitch solidOnly="inspect-info-layout" label="Layout details" checked={settings().layoutDetailsEnabled} onChange={(layoutDetailsEnabled) => props.model.updateSettings({ layoutDetailsEnabled })} />
        <div data-mesurer-distance="true" data-mesurer-current-only-extension="selection-spacing" class={`msr:col-span-2 msr:mt-1 msr:grid ${SETTINGS_COLUMNS} msr:items-center msr:gap-0 msr:border-t msr:border-ink-200 msr:pt-2`}>
          <div class="msr:col-span-2 msr:flex msr:h-8 msr:items-center msr:text-[11px] msr:font-semibold msr:text-ink-500">Selection spacing</div>
          <SettingsSwitch label="Show" checked={props.selectionSpacingStyle.enabled} onChange={(enabled) => updateSpacing({ enabled })} />
          <SettingsSwitch label="Diagonals" checked={props.selectionSpacingStyle.diagonals} onChange={(diagonals) => updateSpacing({ diagonals })} />
          <ColorField label="Line color" value={props.selectionSpacingStyle.color} fallback="#2563eb" ownerWindow={props.ownerWindow} onChange={(color) => updateSpacing({ color })} />
          <SliderControl label="Weight" min={1} max={4} step={1} value={props.selectionSpacingStyle.width} formatValue={(value) => `${value}px`} parseInput={(input) => Number.parseFloat(input)} onChange={(width) => updateSpacing({ width })} />
          <PatternRadios name="Selection spacing" tooltipPrefix="spacing" value={props.selectionSpacingStyle.pattern} tooltip={patternTooltip} onChange={(pattern) => updateSpacing({ pattern })} />
          <Show when={props.selectionSpacingStyle.pattern !== "solid"}>
            <SliderControl label="Length" min={2} max={24} step={1} value={props.selectionSpacingStyle.dashLength} formatValue={(value) => `${value}px`} onChange={(dashLength) => updateSpacing({ dashLength })} />
            <SliderControl label="Gap" min={0} max={24} step={1} value={props.selectionSpacingStyle.gap} formatValue={(value) => `${value}px`} onChange={(gap) => updateSpacing({ gap })} />
          </Show>
        </div>
      </SettingsSection>

      <SectionDivider />
      <SettingsSection id="color" title="Color picker" ariaLabel="Color settings">
        <div class={`msr:col-span-2 msr:grid msr:min-h-8 ${SETTINGS_COLUMNS} msr:items-start msr:gap-0`}>
          <span class="msr:flex msr:h-8 msr:items-center msr:text-[12px] msr:text-ink-700">Format</span>
          <FormatMultiSelect ownerWindow={props.ownerWindow} formats={COLOR_FORMATS} selected={settings().colorPickerFormats} onChange={(colorPickerFormats) => props.model.updateSettings({ colorPickerFormats })} />
        </div>
        <SelectRow
          label="Copy"
          caret
          value={settings().colorPickerClickFormat}
          onChange={(value) => { if (isColorPickerFormat(value)) props.model.updateSettings({ colorPickerClickFormat: value }); }}
        >
          <For each={COLOR_FORMATS}>{(format) => <option value={format}>{format}</option>}</For>
        </SelectRow>
      </SettingsSection>

      <SectionDivider />
      <SettingsSection id="rulers" title="Rulers" ariaLabel="Ruler settings">
        <SliderControl label="Opacity" min={0.2} max={1} step={0.05} value={settings().rulerSettings.opacity} formatValue={(value) => `${Math.round(value * 100)}%`} parseInput={(input) => Number.parseFloat(input) / 100} onChange={(opacity) => updateRulers({ opacity })} />
        <SettingsSwitch label="Edge reveal" checked={settings().rulerSettings.edgeReveal} onChange={(edgeReveal) => updateRulers({ edgeReveal })} />
      </SettingsSection>

      <SectionDivider />
      <SettingsSection id="general" title="General" ariaLabel="General settings">
        <SettingsSwitch label="Persist" checked={settings().persistOnReload} onChange={(persistOnReload) => props.model.updateSettings({ persistOnReload })} />
        <SettingsSwitch label="Shortcuts" checked={settings().shortcutsEnabled} onChange={(shortcutsEnabled) => props.model.updateSettings({ shortcutsEnabled })} />
        <SelectRow
          label="Appearance"
          ariaLabel="Appearance"
          value={settings().theme}
          onChange={(theme) => { if (isMesurerTheme(theme)) props.model.updateSettings({ theme }); }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </SelectRow>
        <SelectRow
          label="Dock"
          ariaLabel="Toolbar dock"
          value={settings().toolbarDock}
          onChange={(dock) => props.model.updateSettings({ toolbarDock: dock === "snap" ? "snap" : "free" })}
        >
          <option value="free">Free</option>
          <option value="snap">Snap to edges</option>
        </SelectRow>
        <Show when={settings().toolbarDock === "snap"}>
          <SettingsSwitch label="Auto-hide" presentationId="toolbar-auto-hide" checked={settings().toolbarAutoHide} onChange={(toolbarAutoHide) => props.model.updateSettings({ toolbarAutoHide })} />
        </Show>
        <For each={pluginSettings?.generalSections?.() ?? []}>{(section) => (
          <For each={section.controls ?? []}>{(control) => (
            <SettingsSwitch
              label={control.label}
              solidOnly="presentation"
              presentationId={control.id}
              checked={control.value()}
              disabled={control.disabled?.() ?? false}
              onChange={(value) => pluginSettings?.update(section.id, control, value)}
            />
          )}</For>
        )}</For>
        <PluginSettings />
        <div class={ROW}>
          <span>Version</span>
          <span class="msr:justify-self-end msr:font-mono msr:text-[11px] msr:tabular-nums msr:text-ink-700">{version()}</span>
        </div>
        <div class="msr:col-span-2 msr:flex msr:h-8 msr:w-full msr:items-center msr:justify-end msr:gap-1">
          <SettingsButton label="Reset settings to defaults" onClick={resetSettings}>Use defaults</SettingsButton>
          <SettingsButton label="Clear workspace" danger onClick={() => props.onClearWorkspace()}>Clear workspace</SettingsButton>
        </div>
      </SettingsSection>
    </div>
  );
}
