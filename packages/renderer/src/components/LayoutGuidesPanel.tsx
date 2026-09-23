import { For, Show, createMemo, createSignal } from "solid-js";
import type {
  LayoutGuide,
  LayoutGuideAlign,
  LayoutGuideKind,
} from "../core/layout-guides";
import { layoutGuideLabel } from "../core/layout-guides";
import { CaretDownIcon, CloseIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from "./Icons";

type LayoutGuidesPanelProps = {
  guides: LayoutGuide[];
  onAdd(): void;
  onUpdate(id: string, patch: Partial<Omit<LayoutGuide, "id">>): void;
  onRemove(id: string): void;
  onClose(): void;
};

const selectClass =
  "msr:h-7 msr:w-full msr:rounded-[5px] msr:border msr:border-ink-200 msr:bg-white msr:px-2 msr:text-[11px] msr:text-ink-700 msr:outline-none msr:focus:border-[#0d99ff]";

const inputClass =
  "msr:h-7 msr:w-full msr:min-w-0 msr:rounded-[5px] msr:border msr:border-ink-200 msr:bg-white msr:px-2 msr:font-mono msr:text-[11px] msr:tabular-nums msr:text-ink-700 msr:outline-none msr:focus:border-[#0d99ff]";

const LAYOUT_GUIDE_ALIGNS: readonly LayoutGuideAlign[] = ["stretch", "min", "center", "max"];

const parseLayoutGuideKind = (value: string): LayoutGuideKind =>
  value === "rows" || value === "grid" ? value : "columns";

const parseLayoutGuideAlign = (value: string): LayoutGuideAlign =>
  value === "min" || value === "center" || value === "max" ? value : "stretch";

const IconButton = (props: {
  label: string;
  pressed?: boolean;
  onClick(): void;
  children: any;
}) => (
  <button
    type="button"
    aria-label={props.label}
    aria-pressed={props.pressed === undefined ? undefined : props.pressed ? "true" : "false"}
    class="msr:flex msr:size-7 msr:shrink-0 msr:items-center msr:justify-center msr:rounded-[5px] msr:border-0 msr:bg-transparent msr:text-ink-500 msr:outline-none msr:hover:bg-ink-100 msr:hover:text-ink-900"
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

const Field = (props: { label: string; children: any }) => (
  <label class="msr:grid msr:grid-cols-[72px_minmax(0,1fr)] msr:items-center msr:gap-2 msr:text-[11px] msr:text-ink-700">
    <span>{props.label}</span>
    {props.children}
  </label>
);

const NumberField = (props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
}) => (
  <input
    aria-label={props.label}
    type="number"
    min={props.min}
    max={props.max}
    step={props.step ?? 1}
    value={props.value}
    class={inputClass}
    onPointerDown={(event) => event.stopPropagation()}
    onInput={(event) => {
      const value = Number(event.currentTarget.value);

      if (Number.isFinite(value)) props.onChange(Math.min(props.max, Math.max(props.min, value)));
    }}
  />
);

const LayoutGuideEditor = (props: {
  guide: LayoutGuide;
  onBack(): void;
  onUpdate(patch: Partial<Omit<LayoutGuide, "id">>): void;
}) => {
  const alignLabel = createMemo(() =>
    props.guide.kind === "rows"
      ? { stretch: "Stretch", min: "Top", center: "Center", max: "Bottom" }
      : { stretch: "Stretch", min: "Left", center: "Center", max: "Right" });

  const sizeLabel = createMemo(() =>
    props.guide.kind === "rows" ? "Height" : props.guide.kind === "grid" ? "Size" : "Width");

  return (
    <div class="msr:flex msr:min-h-0 msr:flex-1 msr:flex-col msr:gap-2 msr:overflow-y-auto msr:p-3">
      <div class="msr:flex msr:items-center msr:justify-between msr:gap-2">
        <strong class="msr:text-[11px] msr:font-semibold msr:text-ink-700">
          {layoutGuideLabel(props.guide)}
        </strong>
        <IconButton label="Back to layout guides" onClick={props.onBack}><CaretDownIcon size={10} class="msr:rotate-90" /></IconButton>
      </div>

      <Field label="Type">
        <select
          aria-label="Layout guide type"
          value={props.guide.kind}
          class={selectClass}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const kind = parseLayoutGuideKind(event.currentTarget.value);
            props.onUpdate({
              kind,
              align: kind === "grid" ? "min" : props.guide.kind === "grid" ? "stretch" : props.guide.align,
            });
          }}
        >
          <option value="columns">Columns</option>
          <option value="rows">Rows</option>
          <option value="grid">Grid</option>
        </select>
      </Field>

      <Show when={props.guide.kind !== "grid"}>
        <Field label="Count">
          <NumberField
            label="Count"
            value={props.guide.count}
            min={1}
            max={24}
            onChange={(count) => props.onUpdate({ count })}
          />
        </Field>
      </Show>

      <Field label="Color">
        <div class="msr:flex msr:items-center msr:gap-2">
          <input
            aria-label="Layout guide color"
            type="color"
            value={props.guide.color}
            class="msr:h-7 msr:w-9 msr:shrink-0 msr:cursor-pointer msr:rounded-[5px] msr:border msr:border-ink-200 msr:bg-transparent msr:p-0.5"
            onPointerDown={(event) => event.stopPropagation()}
            onInput={(event) => props.onUpdate({ color: event.currentTarget.value })}
          />
          <input
            aria-label="Layout guide color value"
            value={props.guide.color}
            class={inputClass}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => props.onUpdate({ color: event.currentTarget.value })}
          />
        </div>
      </Field>

      <Field label="Opacity">
        <div class="msr:flex msr:items-center msr:gap-2">
          <input
            aria-label="Layout guide opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={props.guide.opacity}
            class="msr:min-w-0 msr:flex-1"
            data-slider-container="true"
            onPointerDown={(event) => event.stopPropagation()}
            onInput={(event) => props.onUpdate({ opacity: Number(event.currentTarget.value) })}
          />
          <span class="msr:w-9 msr:text-right msr:font-mono msr:text-[10px] msr:tabular-nums msr:text-ink-500">
            {Math.round(props.guide.opacity * 100)}%
          </span>
        </div>
      </Field>

      <Show when={props.guide.kind !== "grid"}>
        <Field label="Align">
          <select
            aria-label="Layout guide alignment"
            value={props.guide.align}
            class={selectClass}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => props.onUpdate({ align: parseLayoutGuideAlign(event.currentTarget.value) })}
          >
            <For each={LAYOUT_GUIDE_ALIGNS}>{(align) => (
              <option value={align}>{alignLabel()[align]}</option>
            )}</For>
          </select>
        </Field>
      </Show>

      <Show when={props.guide.kind === "grid" || props.guide.align !== "stretch"}>
        <Field label={sizeLabel()}>
          <NumberField
            label={sizeLabel()}
            value={props.guide.size}
            min={1}
            max={4096}
            onChange={(size) => props.onUpdate({ size })}
          />
        </Field>
      </Show>

      <Show when={props.guide.kind !== "grid"}>
        <Field label="Gutter">
          <NumberField
            label="Gutter"
            value={props.guide.gutter}
            min={0}
            max={800}
            onChange={(gutter) => props.onUpdate({ gutter })}
          />
        </Field>
        <Field label="Offset">
          <NumberField
            label="Offset"
            value={props.guide.offset}
            min={0}
            max={4096}
            onChange={(offset) => props.onUpdate({ offset })}
          />
        </Field>
      </Show>
    </div>
  );
};

export function LayoutGuidesPanel(props: LayoutGuidesPanelProps) {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const editing = createMemo(() => props.guides.find((guide) => guide.id === editingId()) ?? null);

  return (
    <div
      data-mesurer-layout-guides-panel="true"
      role="dialog"
      aria-label="Layout guides"
      class="mesurer-menu-surface msr:pointer-events-auto msr:flex msr:max-h-[min(480px,calc(100vh-16px))] msr:w-[280px] msr:flex-col msr:overflow-hidden msr:rounded-lg msr:border msr:border-ink-200 msr:bg-white msr:text-ink-700"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Show
        when={editing()}
        fallback={
          <div class="msr:flex msr:min-h-0 msr:flex-1 msr:flex-col">
            <div class="msr:flex msr:h-10 msr:shrink-0 msr:items-center msr:justify-between msr:border-b msr:border-ink-100 msr:px-3">
              <strong class="msr:text-[11px] msr:font-semibold">Layout guides</strong>
              <div class="msr:flex msr:items-center msr:gap-0.5">
                <IconButton label="Add layout guide" onClick={props.onAdd}><PlusIcon size={12} /></IconButton>
                <IconButton label="Close layout guides" onClick={props.onClose}><CloseIcon size={12} /></IconButton>
              </div>
            </div>

            <Show
              when={props.guides.length > 0}
              fallback={
                <p class="msr:m-0 msr:px-3 msr:py-4 msr:text-[11px] msr:text-ink-500">
                  No layout guides
                </p>
              }
            >
              <ul class="mesurer-thin-scrollbar msr:m-0 msr:min-h-0 msr:list-none msr:overflow-y-auto msr:p-2">
                <For each={props.guides}>{(guide) => (
                  <li class="msr:flex msr:items-center msr:gap-0.5">
                    <button
                      type="button"
                      class="msr:flex msr:min-w-0 msr:flex-1 msr:items-center msr:gap-2 msr:rounded-[5px] msr:border-0 msr:bg-transparent msr:px-2 msr:py-1.5 msr:text-left msr:text-[11px] msr:text-ink-700 msr:outline-none msr:hover:bg-ink-100"
                      onClick={() => setEditingId(guide.id)}
                    >
                      <span
                        aria-hidden="true"
                        class="msr:size-2.5 msr:shrink-0 msr:rounded-[2px]"
                        style={{ "background-color": guide.color, opacity: String(Math.max(0.35, guide.opacity)) }}
                      />
                      <span class="msr:min-w-0 msr:flex-1 msr:truncate">{layoutGuideLabel(guide)}</span>
                    </button>
                    <IconButton
                      label={guide.visible ? `Hide ${layoutGuideLabel(guide)}` : `Show ${layoutGuideLabel(guide)}`}
                      pressed={guide.visible}
                      onClick={() => props.onUpdate(guide.id, { visible: !guide.visible })}
                    >
                      {guide.visible ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                    </IconButton>
                    <IconButton
                      label={`Remove ${layoutGuideLabel(guide)}`}
                      onClick={() => props.onRemove(guide.id)}
                    >
                      <TrashIcon size={14} />
                    </IconButton>
                  </li>
                )}</For>
              </ul>
            </Show>
          </div>
        }
      >
        {(guide) => (
          <LayoutGuideEditor
            guide={guide()}
            onBack={() => setEditingId(null)}
            onUpdate={(patch) => props.onUpdate(guide().id, patch)}
          />
        )}
      </Show>
    </div>
  );
}
