import { createSignal } from "solid-js";
import { colorToHex, parseCssColor } from "../core/colors";

export const SETTINGS_COLUMNS = "msr:grid-cols-[78px_150px]";

export const settingsSelectClassName =
  "mesurer-settings-select msr:h-6 msr:w-full msr:appearance-none msr:rounded-control msr:border msr:border-ink-200 msr:bg-white msr:px-1.5 msr:pr-6 msr:text-[11px] msr:outline-none msr:focus:shadow-[inset_0_0_0_1px_var(--msr-accent)]";

type ControlFieldVariant = "legacy" | "current";

export function SettingsSelectCaret() {
  return (
    <span
      aria-hidden="true"
      class="msr:pointer-events-none msr:absolute msr:right-2 msr:top-1/2 msr:size-1.5 msr:-translate-y-1/2 msr:rotate-45 msr:border-r msr:border-b msr:border-ink-500"
    />
  );
}

export function ControlShell(props: {
  left: any;
  right?: any;
  variant?: ControlFieldVariant;
}) {
  const current = () => props.variant !== "legacy";

  return (
    <div
      class={`mesurer-control-shell msr:group msr:flex msr:h-6 msr:w-full msr:min-w-0 msr:items-center msr:overflow-hidden msr:border msr:border-transparent msr:bg-ink-50 msr:hover:border-ink-200 ${current() ? "msr:rounded-control" : "msr:rounded-[5px]"}`}
    >
      <div
        class={`mesurer-control-focus msr:flex msr:h-full msr:min-w-0 msr:flex-1 msr:items-center msr:focus-within:rounded-l-[5px] msr:focus-within:outline msr:focus-within:outline-1 msr:focus-within:outline-offset-[-1px] ${current() ? "msr:focus-within:outline-[var(--msr-accent)]" : "msr:focus-within:outline-[#0d99ff]"}`}
      >
        {props.left}
      </div>
      {props.right ? (
        <div
          class={`mesurer-control-focus msr:box-border msr:flex msr:h-full msr:w-12 msr:shrink-0 msr:items-center msr:border-l msr:focus-within:rounded-r-[5px] msr:focus-within:outline msr:focus-within:outline-1 msr:focus-within:outline-offset-[-1px] ${current() ? "msr:border-ink-200 msr:focus-within:outline-[var(--msr-accent)]" : "msr:border-transparent msr:group-hover:border-ink-200 msr:focus-within:outline-[#0d99ff]"}`}
        >
          {props.right}
        </div>
      ) : null}
    </div>
  );
}

export function ColorField(props: {
  label: string;
  value: string;
  fallback: string;
  ownerWindow: Window;
  columns?: string;
  variant?: ControlFieldVariant;
  onChange: (value: string) => void;
}) {
  const current = () => props.variant !== "legacy";

  const sample = () => {
    const parsed = parseCssColor(props.value);

    if (parsed) return parsed;

    const canvas = props.ownerWindow.document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) return parseCssColor(props.fallback);

    context.fillStyle = props.value;

    return parseCssColor(String(context.fillStyle)) ?? parseCssColor(props.fallback);
  };

  const hexValue = () => {
    const color = sample();

    return color ? colorToHex({ ...color, alpha: 1 }).slice(1).toUpperCase() : "000000";
  };

  const alphaValue = () => {
    const color = sample();

    return color ? Math.round(color.alpha * 100) : 100;
  };

  const inputValue = () => `#${hexValue().slice(0, 6)}`;
  const supportsColor = () => props.ownerWindow.CSS?.supports("color", props.value) === true;
  const swatchColor = () => supportsColor() ? props.value : props.fallback;
  const [hexDraft, setHexDraft] = createSignal("");
  const [alphaDraft, setAlphaDraft] = createSignal("");
  const [hexFocused, setHexFocused] = createSignal(false);
  const [alphaFocused, setAlphaFocused] = createSignal(false);

  const updateColor = (nextHex: string, nextAlpha: number) => {
    if (!/^[\da-f]{6}$/i.test(nextHex)) return;

    const nextSample = parseCssColor(`#${nextHex}`);

    if (!nextSample) return;

    props.onChange(colorToHex({
      ...nextSample,
      alpha: Math.min(100, Math.max(0, nextAlpha)) / 100,
    }));
  };

  const onNativeColor = (value: string) => {
    if (current()) {
      updateColor(value.slice(1), alphaValue());

      return;
    }

    props.onChange(value);
  };

  const rootClass = () => current()
    ? `msr:col-span-2 msr:grid msr:h-8 msr:w-full ${props.columns ?? SETTINGS_COLUMNS} msr:items-center msr:gap-0 msr:text-[12px] msr:text-ink-700`
    : "msr:col-span-2 msr:grid msr:w-full msr:grid-cols-[78px_156px] msr:items-center msr:gap-3 msr:text-[12px] msr:text-ink-700";

  return (
    <div class={rootClass()}>
      <span>{props.label}</span>
      <ControlShell
        variant={props.variant}
        left={
          <>
            <span
              class="msr:relative msr:ml-1 msr:block msr:size-4 msr:shrink-0 msr:overflow-hidden msr:rounded-[3px] msr:border msr:border-black/10"
              style={{ "background-color": swatchColor() }}
            >
              <input
                type="color"
                aria-label={`${props.label} color picker`}
                value={inputValue()}
                class="msr:absolute msr:inset-0 msr:size-full msr:cursor-pointer msr:opacity-0"
                onInput={(event) => onNativeColor(event.currentTarget.value)}
                onChange={(event) => onNativeColor(event.currentTarget.value)}
              />
            </span>
            <input
              aria-label={`${props.label} hex value`}
              type="text"
              value={hexFocused() ? hexDraft() : hexValue()}
              maxlength={current() ? 7 : 6}
              class="msr:min-w-0 msr:flex-1 msr:bg-transparent msr:px-2 msr:font-mono msr:text-[12px] msr:tabular-nums msr:text-ink-700 msr:outline-none"
              onFocus={() => {
                setHexDraft(hexValue());
                setHexFocused(true);
              }}
              onBlur={() => setHexFocused(false)}
              onInput={(event) => {
                const next = event.currentTarget.value.replace(/[^\da-f]/gi, "").slice(0, 6).toUpperCase();
                setHexDraft(next);
                updateColor(next, alphaFocused() ? Number(alphaDraft()) : alphaValue());
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (current()) event.stopPropagation();
              }}
            />
          </>
        }
        right={
          <input
            aria-label={`${props.label} opacity value`}
            type="text"
            inputmode="numeric"
            value={alphaFocused()
              ? current()
                ? (alphaDraft() ? `${alphaDraft()}%` : "")
                : `${alphaDraft()}%`
              : `${alphaValue()}%`}
            maxlength={4}
            class={`msr:h-full msr:w-full msr:bg-transparent msr:px-1 msr:font-mono msr:text-[12px] msr:tabular-nums msr:text-ink-700 msr:outline-none ${current() ? "msr:rounded-none msr:border-0 msr:text-left" : "msr:text-center"}`}
            onFocus={() => {
              setAlphaDraft(String(alphaValue()));
              setAlphaFocused(true);
            }}
            onBlur={() => setAlphaFocused(false)}
            onInput={(event) => {
              const nextValue = event.currentTarget.value.replace(/\D/g, "").slice(0, 3);
              setAlphaDraft(nextValue);

              const numeric = Number(nextValue);

              if (Number.isFinite(numeric)) {
                updateColor(hexFocused() ? hexDraft() : hexValue(), numeric);
              }
            }}
            onKeyDown={(event) => {
              if (!current() || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;

              event.preventDefault();
              event.stopPropagation();

              const parsed = Number.parseInt(
                alphaFocused() ? alphaDraft() : String(alphaValue()),
                10,
              );

              const direction = event.key === "ArrowUp" ? 1 : -1;

              const nextValue = Math.min(
                100,
                Math.max(0, (Number.isFinite(parsed) ? parsed : 0) + direction),
              );

              setAlphaDraft(String(nextValue));
              updateColor(hexFocused() ? hexDraft() : hexValue(), nextValue);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              if (current()) event.stopPropagation();
            }}
          />
        }
      />
    </div>
  );
}
