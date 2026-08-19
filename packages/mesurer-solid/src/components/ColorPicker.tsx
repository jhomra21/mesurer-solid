import { For, Show } from "solid-js";
import { formatColor } from "../core/colors";
import type { MeasurerModel } from "../model/create-measurer-model";

export function ColorPicker(props: { model: MeasurerModel; ownerWindow: Window }) {
  const copy = (value: string) => void props.ownerWindow.navigator.clipboard?.writeText(value).catch(() => undefined);
  return (
    <Show when={props.model.state.colorPickerActive}>
      <div class="msr-color-card" data-mesurer-inspector-ui="true">
        <header><strong>Color</strong><button type="button" onClick={() => props.model.setTransient({ colorPickerActive: false })}>×</button></header>
        <Show when={props.model.state.colorPickerUnsupported}>
          <p>EyeDropper is not available in this browser.</p>
        </Show>
        <Show when={props.model.state.colorPickerSample}>
          {(sample) => (
            <>
              <div class="msr-color-swatch" style={{ "background-color": formatColor(sample(), "rgb") }} />
              <For each={props.model.state.settings.colorPickerFormats}>
                {(format) => {
                  const value = () => formatColor(sample(), format);
                  return <button class="msr-color-value" type="button" onClick={() => copy(value())}><span>{format.toUpperCase()}</span><code>{value()}</code></button>;
                }}
              </For>
            </>
          )}
        </Show>
        <Show when={!props.model.state.colorPickerUnsupported && !props.model.state.colorPickerSample}><p>Pick a rendered color from the page.</p></Show>
      </div>
    </Show>
  );
}
