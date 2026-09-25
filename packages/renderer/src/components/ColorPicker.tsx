import { For, Show, createSignal, onSettled, untrack } from "solid-js";
import { colorToHex, formatColor, type ColorPickerFormat } from "../core/colors";
import { hasHostScreenshotCapture } from "../core/screenshot";
import type { MesurerModel } from "../model/create-mesurer-model";
import { Tooltip, createTooltip } from "./Tooltip";

type ColorPickerPoint = { x: number; y: number };

export function ColorPicker(props: {
  model: MesurerModel;
  ownerWindow: Window;
  onHostPick?: (point: ColorPickerPoint) => void;
}) {
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const tooltip = createTooltip(untrack(() => props.ownerWindow));
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
    let observedToolbar: HTMLElement | null = null;
    const MutationObserverCtor = (props.ownerWindow as Window & typeof globalThis).MutationObserver;

    const positionPanel = () => {
      frame = 0;

      if (!props.model.current.colorPickerActive || !props.model.current.colorPickerSample || !panel) return;
      const toolbar = panel.closest("[data-mesurer-root='true']")?.querySelector<HTMLElement>("[data-mesurer-toolbar='true']") ?? null;

      if (toolbar !== observedToolbar) {
        toolbarObserver.disconnect();
        observedToolbar = toolbar;

        if (toolbar) {
          toolbarObserver.observe(toolbar, {
            attributes: true,
            attributeFilter: ["style", "class"],
          });
        }
      }

      if (!toolbar) return;
      const toolbarRect = toolbar.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const left = Math.min(Math.max(8, toolbarRect.left), props.ownerWindow.innerWidth - panelRect.width - 8);
      const belowTop = toolbarRect.bottom + 8;
      const aboveTop = toolbarRect.top - panelRect.height - 8;
      const top = belowTop + panelRect.height <= props.ownerWindow.innerHeight ? belowTop : Math.max(8, aboveTop);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const schedulePosition = () => {
      if (frame || !props.model.current.colorPickerActive || !props.model.current.colorPickerSample) return;
      frame = props.ownerWindow.requestAnimationFrame(positionPanel);
    };

    const toolbarObserver = new MutationObserverCtor(schedulePosition);
    const unsubscribe = props.model.subscribe(schedulePosition);

    props.ownerWindow.addEventListener("resize", schedulePosition);
    schedulePosition();

    return () => {
      if (frame) props.ownerWindow.cancelAnimationFrame(frame);
      toolbarObserver.disconnect();
      unsubscribe();
      props.ownerWindow.removeEventListener("resize", schedulePosition);

      if (copyTimeout !== null) props.ownerWindow.clearTimeout(copyTimeout);
    };
  });

  const formats = () => props.model.state.settings.colorPickerFormats;
  const favorite = () => props.model.state.settings.colorPickerClickFormat;
  const headerFormat = (): ColorPickerFormat | undefined => formats().includes(favorite()) ? favorite() : formats()[0];
  const secondaryFormats = () => headerFormat() ? formats().filter((format) => format !== headerFormat()) : [];
  const hostPicker = () => hasHostScreenshotCapture(props.ownerWindow);

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
    <>
      <Show when={hostPicker() && props.model.state.colorPickerActive && !props.model.state.colorPickerSample}>
        <div
          data-mesurer-color-picker-target="true"
          data-mesurer-inspector-ui="true"
          aria-hidden="true"
          class="msr:pointer-events-auto msr:fixed msr:inset-0 msr:z-[60] msr:cursor-crosshair"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            props.onHostPick?.({ x: event.clientX, y: event.clientY });
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
      </Show>
      <Show when={props.model.state.colorPickerActive && props.model.state.colorPickerSample}>{(sample) =>
        <div
          ref={(element) => { panel = element; }}
          class="mesurer-color-picker msr:pointer-events-auto msr:fixed msr:z-[80] msr:min-w-36 msr:rounded-lg msr:border msr:border-black/10 msr:bg-white msr:px-2 msr:py-2 msr:font-mono msr:text-[10px] msr:leading-4 msr:shadow-lg"
          role="dialog"
          aria-label="Selected color values"
          aria-description={hostPicker()
            ? "Sampled from the current application window."
            : "Sampled from the native browser EyeDropper."}
          data-mesurer-inspector-ui="true"
          data-mesurer-color-picker-mode={hostPicker() ? "host" : "native"}
          onMouseLeave={tooltip.onTooltipContainerLeave}
        >
          <Show
            when={headerFormat()}
            fallback={
              <div class="msr:flex msr:items-center">
                <span class="msr:size-3 msr:shrink-0 msr:rounded-full msr:border msr:border-black/15" style={{ "background-color": colorToHex(sample()) }} aria-hidden="true" />
              </div>
            }
          >{(format) => <div class={secondaryFormats().length > 0 ? "msr:mb-1 msr:flex msr:items-center msr:gap-1.5 msr:border-b msr:border-black/8 msr:pb-1" : "msr:flex msr:items-center msr:gap-1.5"}>
            <span class="msr:size-3 msr:shrink-0 msr:rounded-full msr:border msr:border-black/15" style={{ "background-color": colorToHex(sample()) }} aria-hidden="true" />
            <CopyValue id={format()} value={formatColor(sample(), format())} class="msr:font-medium msr:tabular-nums msr:text-black msr:hover:underline" />
          </div>}</Show>
          <For each={secondaryFormats()}>{(format) => <div class="msr:flex msr:items-center msr:gap-2"><span class="msr:w-9 msr:text-black/45">{format}</span><CopyValue id={format} value={formatColor(sample(), format)} class="msr:tabular-nums msr:text-black msr:hover:underline" /></div>}</For>
        </div>
      }</Show>
    </>
  );
}
