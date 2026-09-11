import { For, Show, createSignal, onSettled, type ComponentProps } from "solid-js";
import { Portal } from "@solidjs/web";
import { useMesurerPluginSettings } from "../plugins/settings-runtime";
import { SettingsPanel as SettingsPanelCore } from "./SettingsPanelCore";

type SettingsPanelProps = ComponentProps<typeof SettingsPanelCore>;

function PresentationSwitch(props: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={props.label}
      aria-checked={props.checked ? "true" : "false"}
      disabled={props.disabled}
      data-mesurer-presentation-setting={props.id}
      class="msr:col-span-2 msr:grid msr:h-6 msr:w-full msr:appearance-none msr:grid-cols-[78px_156px] msr:items-center msr:gap-3 msr:text-left msr:text-[12px] msr:leading-none msr:text-ink-700 msr:disabled:opacity-45"
      onClick={() => props.onChange(!props.checked)}
    >
      <span>{props.label}</span>
      <span
        aria-hidden="true"
        style={{ "justify-self": "end" }}
        data-checked={props.checked ? "true" : undefined}
        class={`mesurer-switch-track msr:flex msr:h-[14px] msr:w-[26px] msr:shrink-0 msr:items-center msr:rounded-full msr:border msr:p-px msr:transition-colors ${props.checked ? "msr:border-[#0d99ff] msr:bg-[#0d99ff]" : "msr:border-ink-200 msr:bg-ink-50"}`}
      >
        <span
          class="msr:block msr:size-[10px] msr:shrink-0 msr:rounded-full msr:bg-white msr:shadow-sm msr:transition-transform"
          style={{ transform: `translateX(${props.checked ? 12 : 0}px)` }}
        />
      </span>
    </button>
  );
}

/**
 * Preserve the source-faithful Settings panel and compose renderer-owned
 * presentation preferences into its General grid through a Solid Portal.
 *
 * The mount lookup runs only when the panel DOM changes (tab open/switch), not
 * during pointer or scroll interaction. The preference accessors stay reactive
 * through the existing plugin-settings context, and each toggle updates only
 * its O(1) policy bit; Text/Arrange own any resulting page mutation work.
 */
export function SettingsPanel(props: SettingsPanelProps) {
  const pluginSettings = useMesurerPluginSettings();
  const [generalMount, setGeneralMount] = createSignal<HTMLElement | null>(null);
  let hostElement: HTMLDivElement | undefined;

  onSettled(() => {
    const host = hostElement;
    const Observer = props.ownerWindow.document.defaultView?.MutationObserver;
    if (!host || !Observer) return;
    const syncMount = () => {
      setGeneralMount(host.querySelector<HTMLElement>("section[aria-label='General settings']"));
    };
    const observer = new Observer(syncMount);
    observer.observe(host, { childList: true, subtree: true });
    syncMount();
    return () => observer.disconnect();
  });

  return (
    <div ref={(element) => { hostElement = element; }} style={{ display: "contents" }}>
      <SettingsPanelCore {...props} />
      <Show when={generalMount()}>{(mount) => (
        <Portal mount={mount()}>
          <div
            data-mesurer-presentation-settings="true"
            class="msr:col-span-2 msr:grid msr:grid-cols-[78px_156px] msr:items-center msr:gap-x-3 msr:gap-y-1"
            style={{ order: "-1" }}
          >
            <For each={pluginSettings?.generalSections?.() ?? []}>{(section) => (
              <For each={section.controls ?? []}>{(control) => (
                <PresentationSwitch
                  id={control.id}
                  label={control.label}
                  checked={control.value()}
                  disabled={control.disabled?.() ?? false}
                  onChange={(value) => pluginSettings?.update(section.id, control, value)}
                />
              )}</For>
            )}</For>
          </div>
        </Portal>
      )}</Show>
    </div>
  );
}
