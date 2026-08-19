import { For, Show, createSignal, onSettled } from "solid-js";
import { colorToHex, formatColor, type ColorPickerFormat } from "../core/colors";
import type { MeasurerModel } from "../model/create-measurer-model";
import { Tooltip, createTooltip } from "./Tooltip";

export function ColorPicker(props: { model: MeasurerModel; ownerWindow: Window }) {
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const tooltip = createTooltip(props.ownerWindow);
  let panel: HTMLDivElement | undefined;
  let copyTimeout: number | null = null;

  const copyValue = (id: string, value: string) => {
    void props.ownerWindow.navigator.clipboard?.writeText(value).catch(() => undefined);
    tooltip.onTooltipLeave();
    setCopiedId(id);
    if (copyTimeout !== null) props.ownerWindow.clearTimeout(copyTimeout);
    copyTimeout = props.ownerWindow.setTimeout(() => { copyTimeout = null; setCopiedId(null); }, 1500);
  };
  const tooltipEnter = (id: string) => {
    if (copiedId() !== null && copiedId() !== id) {
      if (copyTimeout !== null) props.ownerWindow.clearTimeout(copyTimeout);
      copyTimeout = null;
      setCopiedId(null);
    }
    tooltip.onTooltipEnter(id);
  };

  onSettled(() => {
    let frame = 0;
    const update = () => {
      if (props.model.current.colorPickerActive && panel) {
        const toolbar = props.ownerWindow.document.querySelector<HTMLElement>("[data-mesurer-toolbar='true']");
        if (toolbar) {
          const toolbarRect = toolbar.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const left = Math.min(Math.max(8, toolbarRect.left), props.ownerWindow.innerWidth - panelRect.width - 8);
          const belowTop = toolbarRect.bottom + 8;
          const aboveTop = toolbarRect.top - panelRect.height - 8;
          const top = belowTop + panelRect.height <= props.ownerWindow.innerHeight ? belowTop : Math.max(8, aboveTop);
          panel.style.left = `${left}px`;
          panel.style.top = `${top}px`;
        }
      }
      frame = props.ownerWindow.requestAnimationFrame(update);
    };
    frame = props.ownerWindow.requestAnimationFrame(update);
    return () => {
      props.ownerWindow.cancelAnimationFrame(frame);
      if (copyTimeout !== null) props.ownerWindow.clearTimeout(copyTimeout);
    };
  });

  const formats = () => props.model.state.settings.colorPickerFormats;
  const favorite = () => props.model.state.settings.colorPickerClickFormat;
  const headerFormat = (): ColorPickerFormat | undefined => formats().includes(favorite()) ? favorite() : formats()[0];
  const secondaryFormats = () => headerFormat() ? formats().filter((format) => format !== headerFormat()) : [];

  const CopyValue = (input: { id: string; value: string; class: string }) => {
    const copied = () => copiedId() === input.id;
    const showTooltip = () => tooltip.visibleTooltipId() === input.id || (copied() && tooltip.visibleTooltipId() === null);
    return (
      <span class="msr:relative msr:inline-flex" onMouseLeave={tooltip.onTooltipLeave}>
        <button type="button" class={input.class} onMouseEnter={() => tooltipEnter(input.id)} onFocus={() => tooltipEnter(input.id)} onBlur={tooltip.onTooltipLeave} onClick={() => copyValue(input.id, input.value)}>{input.value}</button>
        <Tooltip label={copied() ? "Copied!" : "Click to copy"} visible={showTooltip()} instant={copied() || tooltip.tooltipInstant()} side="bottom" class="msr:z-10" />
      </span>
    );
  };

  return (
    <Show when={props.model.state.colorPickerActive && (props.model.state.colorPickerSample || props.model.state.colorPickerUnsupported)}>
      <div ref={(element) => { panel = element; }} class="mesurer-color-picker msr:pointer-events-auto msr:fixed msr:z-[80] msr:min-w-36 msr:rounded-lg msr:border msr:border-black/10 msr:bg-white msr:px-2 msr:py-2 msr:font-mono msr:text-[10px] msr:leading-4 msr:shadow-lg" role="dialog" aria-label="Selected color values" data-mesurer-inspector-ui="true" onMouseLeave={tooltip.onTooltipContainerLeave}>
        <Show when={props.model.state.colorPickerUnsupported} fallback={
          <Show when={props.model.state.colorPickerSample}>{(sample) => <>
            <Show when={headerFormat()}>{(format) => <div class={secondaryFormats().length > 0 ? "msr:mb-1 msr:flex msr:items-center msr:gap-1.5 msr:border-b msr:border-black/8 msr:pb-1" : "msr:flex msr:items-center msr:gap-1.5"}>
              <span class="msr:size-3 msr:shrink-0 msr:rounded-full msr:border msr:border-black/15" style={{ "background-color": colorToHex(sample()) }} aria-hidden="true" />
              <CopyValue id={format()} value={formatColor(sample(), format())} class="msr:font-medium msr:tabular-nums msr:text-black msr:hover:underline" />
            </div>}</Show>
            <For each={secondaryFormats()}>{(format) => <div class="msr:flex msr:items-center msr:gap-2"><span class="msr:w-9 msr:text-black/45">{format}</span><CopyValue id={format} value={formatColor(sample(), format)} class="msr:tabular-nums msr:text-black msr:hover:underline" /></div>}</For>
          </>}</Show>
        }>
          <div class="msr:flex msr:items-start msr:gap-2"><span class="msr:text-black/60">Color picker is not supported in this browser.</span><button type="button" class="msr:text-black/45 msr:hover:text-black" aria-label="Close color picker message" onClick={() => props.model.setTransient({ colorPickerActive: false })}>x</button></div>
        </Show>
      </div>
    </Show>
  );
}
