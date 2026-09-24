import { For, Show, createMemo, createSignal } from "solid-js";
import { colorToHex, parseCssColor } from "../core/colors";
import {
  DEFAULT_LAYOUT_GUIDE_COLOR,
  type LayoutGuide,
  type LayoutGuideAlign,
  type LayoutGuideKind,
} from "../core/layout-guides";
import { layoutGuideLabel } from "../core/layout-guides";
import {
  ColorField,
  ControlShell,
  SettingsSelectCaret,
  settingsSelectClassName,
} from "./ControlField";
import {
  CaretDownIcon,
  EyeIcon,
  EyeOffIcon,
  LayoutColumnsIcon,
  LayoutGridIcon,
  LayoutRowsIcon,
  MinusIcon,
  PlusIcon,
} from "./Icons";

type LayoutGuidesPanelProps = {
  guides: LayoutGuide[];
  ownerWindow: Window;
  onAdd(): void;
  onUpdate(id: string, patch: Partial<Omit<LayoutGuide, "id">>): void;
  onRemove(id: string): void;
};

const LayoutGuideCloseIcon = (props: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size ?? 14}
    height={props.size ?? 14}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    class="msr:block"
  >
    <path
      d="m6 6 12 12M18 6 6 18"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
);

const KindIcon = (props: { kind: LayoutGuideKind }) => {
  if (props.kind === "rows") return <LayoutRowsIcon size={14} />;

  if (props.kind === "grid") return <LayoutGridIcon size={14} />;

  return <LayoutColumnsIcon size={14} />;
};

const FIELD_COLUMNS = "msr:grid-cols-[78px_minmax(0,1fr)]";

const Field = (props: { label: string; children: any }) => (
  <label class={`msr:col-span-2 msr:grid msr:h-8 msr:w-full ${FIELD_COLUMNS} msr:items-center msr:gap-0 msr:text-[12px] msr:text-ink-700`}>
    <span>{props.label}</span>
    {props.children}
  </label>
);

const NativeSelect = (props: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: any;
}) => (
  <span class="msr:relative msr:block msr:w-full">
    <select
      aria-label={props.label}
      value={props.value}
      class={settingsSelectClassName}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.children}
    </select>
    <SettingsSelectCaret />
  </span>
);

const numberInputClassName =
  "msr:h-full msr:w-full msr:min-w-0 msr:border-0 msr:bg-transparent msr:px-2 msr:font-mono msr:text-[12px] msr:font-medium msr:tabular-nums msr:text-ink-700 msr:outline-none";

const NumberField = (props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange(value: number): void;
}) => {
  const [focused, setFocused] = createSignal(false);
  const [draft, setDraft] = createSignal(String(props.value));
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 9999;
  const clamp = (value: number) => Math.min(max(), Math.max(min(), value));

  const commit = (input: string) => {
    const next = Number(input.replace(/[^\d.-]/g, ""));

    if (!Number.isFinite(next)) {
      setDraft(String(props.value));

      return;
    }

    props.onChange(clamp(next));
  };

  return (
    <ControlShell
      left={
        <input
          aria-label={props.label}
          type="text"
          inputmode="numeric"
          value={focused() ? draft() : String(props.value)}
          class={numberInputClassName}
          onFocus={() => {
            setDraft(String(props.value));
            setFocused(true);
          }}
          onBlur={() => {
            commit(draft());
            setFocused(false);
          }}
          onInput={(event) => {
            const next = event.currentTarget.value.replace(/[^\d.-]/g, "");
            setDraft(next);
            const parsed = Number(next);

            if (Number.isFinite(parsed)) props.onChange(clamp(parsed));
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const current = Number(draft());
            const base = Number.isFinite(current) ? current : props.value;
            const next = clamp(base + (event.key === "ArrowUp" ? 1 : -1));
            setDraft(String(next));
            props.onChange(next);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      }
    />
  );
};

const parseLayoutGuideKind = (value: string): LayoutGuideKind =>
  value === "rows" || value === "grid" ? value : "columns";

const parseLayoutGuideAlign = (value: string): LayoutGuideAlign =>
  value === "min" || value === "center" || value === "max" ? value : "stretch";

const LayoutGuideEditor = (props: {
  guide: LayoutGuide;
  ownerWindow: Window;
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
    <div class="mesurer-thin-scrollbar msr:flex msr:min-h-0 msr:flex-1 msr:flex-col msr:gap-2 msr:overflow-y-auto msr:p-3">
      <div class="msr:flex msr:items-center msr:justify-between msr:gap-2">
        <NativeSelect
          label="Layout guide type"
          value={props.guide.kind}
          onChange={(value) => {
            const kind = parseLayoutGuideKind(value);
            props.onUpdate({
              kind,
              align: kind === "grid"
                ? "min"
                : props.guide.align === "stretch" || kind === props.guide.kind
                  ? props.guide.align
                  : "stretch",
            });
          }}
        >
          <option value="columns">Columns</option>
          <option value="rows">Rows</option>
          <option value="grid">Grid</option>
        </NativeSelect>
        <button
          type="button"
          aria-label="Back to layout guides"
          class="msr:flex msr:size-6 msr:items-center msr:justify-center msr:rounded-control msr:text-ink-500 msr:outline-none msr:hover:bg-ink-100 msr:hover:text-ink-900"
          onClick={props.onBack}
        >
          <LayoutGuideCloseIcon />
        </button>
      </div>

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

      <ColorField
        label="Color"
        columns={FIELD_COLUMNS}
        value={colorToHex({
          ...(parseCssColor(props.guide.color) ?? parseCssColor(DEFAULT_LAYOUT_GUIDE_COLOR)!),
          alpha: props.guide.opacity,
        })}
        fallback={DEFAULT_LAYOUT_GUIDE_COLOR}
        ownerWindow={props.ownerWindow}
        onChange={(next) => {
          const parsed = parseCssColor(next);
          props.onUpdate({
            color: parsed ? colorToHex({ ...parsed, alpha: 1 }).slice(0, 7) : next,
            opacity: parsed?.alpha ?? props.guide.opacity,
          });
        }}
      />

      <Show when={props.guide.kind !== "grid"}>
        <Field label="Type">
          <NativeSelect
            label="Alignment"
            value={props.guide.align}
            onChange={(value) => props.onUpdate({ align: parseLayoutGuideAlign(value) })}
          >
            <For each={["stretch", "min", "center", "max"] as const}>{(align) => (
              <option value={align}>{alignLabel()[align]}</option>
            )}</For>
          </NativeSelect>
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
        <Field label="Offset">
          <NumberField
            label="Offset"
            value={props.guide.offset}
            min={0}
            max={4096}
            onChange={(offset) => props.onUpdate({ offset })}
          />
        </Field>
        <Field label="Gutter">
          <NumberField
            label="Gutter"
            value={props.guide.gutter}
            min={0}
            max={800}
            onChange={(gutter) => props.onUpdate({ gutter })}
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
      class="mesurer-menu-surface msr:pointer-events-auto msr:flex msr:max-h-[min(320px,calc(100vh-16px))] msr:w-60 msr:flex-col msr:overflow-hidden msr:rounded-lg msr:bg-white msr:p-0 msr:text-[12px] msr:leading-[18px] msr:shadow-floating"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <Show
        when={editing()}
        fallback={
          <div class="msr:flex msr:min-h-0 msr:flex-1 msr:flex-col msr:gap-1 msr:p-2">
            <div class="msr:flex msr:h-7 msr:shrink-0 msr:items-center msr:justify-between msr:px-1">
              <h2 class="msr:text-[11px] msr:font-semibold msr:text-ink-700">Layout guides</h2>
              <button
                type="button"
                aria-label="Add layout guide"
                class="msr:flex msr:size-6 msr:items-center msr:justify-center msr:rounded-control msr:text-ink-500 msr:outline-none msr:hover:bg-ink-100 msr:hover:text-ink-900"
                onClick={props.onAdd}
              >
                <PlusIcon />
              </button>
            </div>

            <Show
              when={props.guides.length > 0}
              fallback={
                <p class="msr:px-1 msr:pb-2 msr:text-[11px] msr:text-ink-500">
                  Add columns, rows, or a pixel grid on the page.
                </p>
              }
            >
              <ul class="mesurer-thin-scrollbar msr:m-0 msr:flex msr:min-h-0 msr:flex-1 msr:list-none msr:flex-col msr:gap-0.5 msr:overflow-y-auto msr:p-0">
                <For each={props.guides}>{(guide) => (
                  <li class="msr:flex msr:items-center msr:gap-0.5">
                    <button
                      type="button"
                      class="msr:flex msr:h-[27px] msr:min-w-0 msr:flex-1 msr:items-center msr:gap-2 msr:rounded-control msr:px-1 msr:py-1 msr:text-left msr:text-[11px] msr:text-ink-700 msr:outline-none msr:hover:bg-ink-100"
                      onClick={() => setEditingId(guide.id)}
                    >
                      <span class="msr:text-ink-500">
                        <KindIcon kind={guide.kind} />
                      </span>
                      <span class="msr:min-w-0 msr:flex-1 msr:truncate">{layoutGuideLabel(guide)}</span>
                      <CaretDownIcon size={8} class="msr:block msr:-rotate-90 msr:text-ink-400" />
                    </button>
                    <button
                      type="button"
                      aria-label={guide.visible ? `Hide ${layoutGuideLabel(guide)}` : `Show ${layoutGuideLabel(guide)}`}
                      aria-pressed={guide.visible ? "true" : "false"}
                      class={`msr:flex msr:size-6 msr:items-center msr:justify-center msr:rounded-control msr:outline-none msr:hover:bg-ink-100 ${guide.visible ? "msr:text-ink-700" : "msr:text-ink-400"}`}
                      onClick={() => props.onUpdate(guide.id, { visible: !guide.visible })}
                    >
                      {guide.visible ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${layoutGuideLabel(guide)}`}
                      class="msr:flex msr:size-6 msr:items-center msr:justify-center msr:rounded-control msr:text-ink-400 msr:outline-none msr:hover:bg-ink-100 msr:hover:text-ink-900"
                      onClick={() => props.onRemove(guide.id)}
                    >
                      <MinusIcon size={10} class="msr:block" />
                    </button>
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
            ownerWindow={props.ownerWindow}
            onBack={() => setEditingId(null)}
            onUpdate={(patch) => props.onUpdate(guide().id, patch)}
          />
        )}
      </Show>
    </div>
  );
}
