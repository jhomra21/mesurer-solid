import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { getElementSelector } from "@jhomra21/mesurer-solid-dom";
import { formatInspectCssParts, visibleInspectCssParts } from "../core/inspect-css";
import type { InspectMeasurement, Rect } from "../core/types";
import { placeInspectInfoCard } from "../runtime/inspect-info";
import { CheckIcon } from "./Icons";
import { InspectDetailRow } from "./InspectDetailRow";

export type InspectInfoCardProps = {
  element: Element;
  measurement: InspectMeasurement;
  rect: Rect;
  ownerWindow: Window;
  theme: string;
  documentMounted?: boolean;
  layoutDetailsEnabled: boolean;
  passThrough?: boolean;
  embedded?: boolean;
};

const rounded = (value: number) => Math.round(value);

export function InspectInfoCard(props: InspectInfoCardProps) {
  const [expanded, setExpanded] = createSignal(false);
  const [copiedSelector, setCopiedSelector] = createSignal(false);
  const [copyError, setCopyError] = createSignal(false);
  const [cardElement, setCardElement] = createSignal<HTMLDivElement>();
  const [cardHeight, setCardHeight] = createSignal(96);
  const [cardWidth, setCardWidth] = createSignal(240);
  const sourceDocument = () => props.element.ownerDocument;
  const sourceWindow = () => sourceDocument().defaultView;
  const style = createMemo(() => sourceWindow()?.getComputedStyle(props.element) ?? null);

  const parts = createMemo(() => props.layoutDetailsEnabled && style()
    ? formatInspectCssParts(props.measurement, style()!)
    : []);

  const visible = () => props.embedded
    ? { visible: parts(), hiddenCount: 0 }
    : visibleInspectCssParts(parts(), expanded());

  const rect = () => props.measurement.cssRect ?? props.measurement.rect;
  const selector = () => getElementSelector(props.element);
  const dimensions = () => `${rounded(rect().width)} x ${rounded(rect().height)}`;

  const contextRects = () => {
    const root = props.ownerWindow.document
      .querySelector<HTMLElement>("[data-mesurer-island='true']")
      ?.shadowRoot;

    return [...(root?.querySelectorAll<HTMLElement>(
      "[data-mesurer-annotation-trigger='true'], [data-mesurer-annotation-composer='true'], [data-mesurer-annotation-panel='true']",
    ) ?? [])]
      .flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();

        return width > 0 && height > 0 ? [{ left, top, width, height }] : [];
      });
  };

  const position = () => {
    const placed = placeInspectInfoCard(
      props.rect,
      { width: cardWidth(), height: cardHeight() },
      { width: props.ownerWindow.innerWidth, height: props.ownerWindow.innerHeight },
      props.passThrough === true,
      contextRects(),
    );

    return { left: `${placed.left}px`, top: `${placed.top}px` };
  };

  const baseStyle = () => ({
    // Keep the card's painted surface out of the page hit-test. Its explicit
    // controls opt back in below, so hover/selection and Context affordances
    // underneath the card continue to receive input.
    "pointer-events": "none" as const,
    "user-select": "text" as const,
    // Keep Context's protected trigger/composer and annotation panel above the
    // inspector even when both are source-linked in the same document.
    "z-index": props.embedded ? "auto" : props.documentMounted ? "2147483644" : "2147482701",
    color: "var(--msr-content)",
    background: props.embedded ? "transparent" : "var(--msr-surface)",
    "box-shadow": props.embedded ? "none" : "var(--msr-shadow-floating)",
  });

  const cardStyle = () => props.embedded
    ? { position: "static" as const, ...baseStyle() }
    : { ...position(), ...baseStyle() };

  createEffect(() => cardElement(), (node) => {
    // Expansion and source retargeting can change the card height; the ResizeObserver
    // below keeps placement geometry current without polling during pointer movement.
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setCardWidth(rect.width);
      setCardHeight(rect.height);
    };

    // SAFETY: ownerWindow is the browser realm that owns this card's DOM node.
    const Observer = (props.ownerWindow as Window & typeof globalThis).ResizeObserver;

    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(node);
    measure();
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => `${selector()}|${props.measurement.id}`, () => {
    setExpanded(false);
    setCopiedSelector(false);
  });

  const copy = async (value: string) => {
    try {
      const clipboard = sourceWindow()?.navigator.clipboard;

      if (!clipboard) throw new Error("Clipboard unavailable");
      await clipboard.writeText(value);
      setCopyError(false);

      return true;
    } catch {
      setCopyError(true);

      return false;
    }
  };

  const copySelector = async () => {
    const success = await copy(selector());
    setCopiedSelector(success);
  };

  const isHtmlElement = createMemo(() => {
    const HTMLElementConstructor = sourceWindow()?.HTMLElement;

    return Boolean(HTMLElementConstructor && props.element instanceof HTMLElementConstructor);
  });

  const typographyRows = createMemo(() => {
    if (!isHtmlElement() || !style()) return [];
    const current = style()!;

    const text = Array.from(props.element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");

    const rows = [];

    if (text) rows.push({ label: "Text", value: text.length > 40 ? `${text.slice(0, 40)}…` : text });
    rows.push(
      { label: "Family", value: current.fontFamily.split(",")[0]!.replaceAll('"', "").trim() },
      { label: "Size", value: current.fontSize },
      { label: "Weight", value: current.fontWeight },
      { label: "Line", value: current.lineHeight },
      { label: "Tracking", value: current.letterSpacing },
    );

    return rows;
  });

  return (
    <div
      ref={setCardElement}
      data-mesurer-inspect-info-card="true"
      data-mesurer-inspector-ui="true"
      data-theme={props.theme}
      class={`${props.embedded ? "msr:static msr:w-full msr:max-w-none msr:rounded-none msr:py-0" : `${props.documentMounted ? "msr:fixed" : "msr:absolute"} msr:z-[2147483644] msr:w-60 msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:py-2`} msr:flex msr:flex-col msr:overflow-visible msr:text-[10px]`}
      style={cardStyle()}
      onPointerDown={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onPointerMove={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onPointerUp={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onClick={(event) => { if (!props.passThrough) event.stopPropagation(); }}
    >
      <div class="msr:flex msr:items-center msr:justify-between msr:gap-2 msr:px-2">
        <button
          type="button"
          data-mesurer-inspect-selector="true"
          aria-label={`Copy selector ${selector()}`}
          title={copiedSelector() ? "Copied!" : "Click to copy"}
          class="msr:pointer-events-auto msr:min-w-0 msr:flex-1 msr:truncate msr:text-left msr:font-mono msr:font-medium msr:hover:underline"
          style={{ "pointer-events": props.passThrough ? "none" : "auto" }}
          onPointerUp={(event) => {
            event.stopPropagation();

            if (event.button === 0) void copySelector();
          }}
          onClick={(event) => {
            event.stopPropagation();

            if (event.detail === 0) void copySelector();
          }}
        >{selector()}</button>
        <Show when={copiedSelector()}><span aria-label="Selector copied"><CheckIcon size={10} /></span></Show>
        <button
          type="button"
          aria-label="Copy dimensions"
          title={copyError() ? "Copy failed" : "Click to copy"}
          class="msr:pointer-events-auto msr:shrink-0 msr:whitespace-nowrap msr:tabular-nums msr:hover:underline"
          style={{ "pointer-events": props.passThrough ? "none" : "auto" }}
          onPointerUp={(event) => {
            event.stopPropagation();

            if (event.button === 0) void copy(dimensions());
          }}
          onClick={(event) => {
            event.stopPropagation();

            if (event.detail === 0) void copy(dimensions());
          }}
        >{dimensions()}</button>
      </div>
      <div class={`msr:mt-2 msr:min-h-0 msr:px-2 ${expanded() ? "mesurer-thin-scrollbar msr:max-h-[min(70vh,32rem)] msr:overflow-y-auto" : ""}`}>
        <div data-mesurer-inspect-details="true" class="msr:flex msr:flex-col msr:gap-0.5">
          <For each={typographyRows()}>{(row) => <InspectDetailRow row={row} copy={copy} passThrough={props.passThrough} />}</For>
          <Show when={props.layoutDetailsEnabled}>
            <For each={visible().visible}>{(row) => <InspectDetailRow row={row} copy={copy} passThrough={props.passThrough} />}</For>
          </Show>
        </div>
      </div>
      <Show when={visible().hiddenCount > 0 || expanded()}>
        <div class="msr:mt-2 msr:px-2">
          <button
            type="button"
            aria-expanded={expanded() ? "true" : "false"}
            aria-label={expanded() ? "Show less CSS details" : `Show ${visible().hiddenCount} more CSS details`}
            class="msr:pointer-events-auto msr:rounded-[5px] msr:text-[10px] msr:text-ink-500 msr:hover:text-ink-900"
            style={{ "pointer-events": props.passThrough ? "none" : "auto" }}
            onClick={() => { setExpanded((value) => !value); }}
          >{expanded() ? "Show less" : `Show ${visible().hiddenCount} more`}</button>
        </div>
      </Show>
    </div>
  );
}
