import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { getElementSelector } from "@jhomra21/mesurer-solid-dom";
import { formatInspectCssParts, visibleInspectCssParts } from "../core/inspect-css";
import { getRectFromDom } from "../core/dom";
import type { InspectMeasurement, Rect } from "../core/types";
import { installNestedScrollCompensation } from "../runtime/nested-scroll-compensation";
import {
  placeInspectInfoCard,
  placeInspectInfoCardAboveOrBelow,
  placeInspectInfoCardBesidePreview,
} from "../runtime/inspect-info";
import {
  intersectRect,
  responsivePreviewStageArea,
  responsivePreviewVisibleRect,
} from "../runtime/responsive-preview-geometry";
import { TypographyInspector } from "../runtime/typography/typography";
import { CheckIcon } from "./Icons";
import { InspectDetailRow } from "./InspectDetailRow";

// Matches the card's msr:w-60 class.
const INSPECT_INFO_CARD_WIDTH = 240;

export type InspectInfoCardProps = {
  element: Element;
  measurement: InspectMeasurement;
  rect: Rect;
  ownerWindow: Window;
  theme: string;
  documentMounted?: boolean;
  layoutDetailsEnabled: boolean;
  singleSelection?: boolean;
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
  const [evidenceRevision, setEvidenceRevision] = createSignal(0);
  const [copyFeedback, setCopyFeedback] = createSignal("");
  const [shiftHeld, setShiftHeld] = createSignal(false);
  const sourceDocument = () => props.element.ownerDocument;
  const sourceWindow = () => sourceDocument().defaultView;

  createEffect(
    () => [props.ownerWindow, props.element, sourceWindow()] as const,
    ([rootWindow, , source]) => {
      if (!source || responsivePreviewVisibleRect(source.document) === undefined) return;

      const keyDown = (event: KeyboardEvent) => {
        if (event.key === "Shift") setShiftHeld(true);
      };

      const keyUp = (event: KeyboardEvent) => {
        if (event.key === "Shift") setShiftHeld(false);
      };

      // A card can mount while Shift is already held (first selection, or a
      // Shift-marquee that unmounted it), so pointer modifiers also sync it
      // before the covered click's pointerdown is hit-tested.
      const syncPointerShift = (event: PointerEvent) => {
        if (event.shiftKey) setShiftHeld(true);
      };

      const reset = () => setShiftHeld(false);

      const windows = source === rootWindow ? [rootWindow] : [rootWindow, source];

      for (const owner of windows) {
        owner.addEventListener("keydown", keyDown, true);
        owner.addEventListener("keyup", keyUp, true);
        owner.addEventListener("pointermove", syncPointerShift, true);
        owner.addEventListener("pointerover", syncPointerShift, true);
        owner.addEventListener("blur", reset);
      }

      return () => {
        for (const owner of windows) {
          owner.removeEventListener("keydown", keyDown, true);
          owner.removeEventListener("keyup", keyUp, true);
          owner.removeEventListener("pointermove", syncPointerShift, true);
          owner.removeEventListener("pointerover", syncPointerShift, true);
          owner.removeEventListener("blur", reset);
        }
      };
    },
  );

  const style = createMemo(() => {
    evidenceRevision();
    // Geometry settle notifications also refresh stylesheet/media-query evidence.
    void props.measurement;

    return sourceWindow()?.getComputedStyle(props.element) ?? null;
  });

  const sourceColor = () => {
    const currentWindow = sourceWindow();

    if (!currentWindow) return undefined;

    // SAFETY: currentWindow owns the element and supplies its HTMLElement constructor.
    const realm = currentWindow as Window & typeof globalThis;
    const element = props.element;

    return element instanceof realm.HTMLElement
      && element.getAttribute("data-mesurer-source-selection-paint") === "true"
      ? element.style.getPropertyValue("--mesurer-selected-source-text") || undefined
      : undefined;
  };

  const parts = createMemo(() => {
    const currentStyle = style();

    return props.layoutDetailsEnabled && currentStyle
      ? formatInspectCssParts(props.measurement, currentStyle, sourceColor())
      : [];
  });

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
      "[data-mesurer-annotation-trigger='true'], [data-mesurer-annotation-composer='true'], [data-mesurer-annotation-panel='true'], [data-mesurer-annotation-marker='true']",
    ) ?? [])]
      .flatMap((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();

        return width > 0 && height > 0 ? [{ left, top, width, height }] : [];
      });
  };

  const placementViewport = () => {
    const visible = responsivePreviewVisibleRect(sourceDocument());

    return visible === undefined
      ? { width: props.ownerWindow.innerWidth, height: props.ownerWindow.innerHeight }
      : visible ?? { left: 0, top: 0, width: 0, height: 0 };
  };

  const position = () => {
    const previewVisible = responsivePreviewVisibleRect(sourceDocument());
    const stageArea = responsivePreviewStageArea(sourceDocument());

    if (previewVisible === undefined) {
      const placed = placeInspectInfoCard(
        props.rect,
        { width: cardWidth(), height: cardHeight() },
        { width: props.ownerWindow.innerWidth, height: props.ownerWindow.innerHeight },
        props.passThrough === true,
        contextRects(),
      );

      return placed ? { left: `${placed.left}px`, top: `${placed.top}px` } : {};
    }

    evidenceRevision();
    const currentRect = intersectRect(getRectFromDom(props.element), previewVisible);

    if (currentRect.width <= 0 || currentRect.height <= 0) return { display: "none" };

    if (stageArea && previewVisible) {
      const centerX = previewVisible.left + previewVisible.width / 2;
      const centerY = previewVisible.top + previewVisible.height / 2;

      // Anchor to the whole preview card (header and device frame), not only
      // its visible content, so the Inspect card never overlaps preview chrome.
      const preview = stageArea.previews.find((rect) =>
        centerX >= rect.left && centerX <= rect.left + rect.width
        && centerY >= rect.top && centerY <= rect.top + rect.height) ?? previewVisible;

      // Use the natural card width; the measured width shrinks once this
      // placement narrows the card and would otherwise feed back into it.
      const beside = placeInspectInfoCardBesidePreview(
        currentRect,
        { width: INSPECT_INFO_CARD_WIDTH, height: cardHeight() },
        preview,
        stageArea.bounds,
        [...stageArea.previews, ...contextRects()],
      );

      if (beside) {
        return {
          left: `${beside.left}px`,
          top: `${beside.top}px`,
          "max-width": `${beside.width}px`,
          "max-height": `${Math.max(0, stageArea.bounds.height - 16)}px`,
        };
      }
    }

    if (stageArea) {
      const placed = placeInspectInfoCardAboveOrBelow(
        currentRect,
        { width: cardWidth(), height: cardHeight() },
        stageArea.bounds,
        contextRects(),
      );

      return {
        left: `${placed.left}px`,
        top: `${placed.top}px`,
        "max-width": `${Math.max(0, stageArea.bounds.width - 16)}px`,
        "max-height": `${Math.max(0, stageArea.bounds.height - 16)}px`,
      };
    }

    const viewport = placementViewport();

    const placed = placeInspectInfoCard(
      currentRect,
      { width: cardWidth(), height: cardHeight() },
      viewport,
      true,
      contextRects(),
    );

    return placed
      ? {
        left: `${placed.left}px`,
        top: `${placed.top}px`,
        "max-width": `${Math.max(0, viewport.width - 16)}px`,
        "max-height": `${Math.max(0, viewport.height - 16)}px`,
      }
      : { display: "none" };
  };

  const baseStyle = () => ({
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
    : responsivePreviewVisibleRect(sourceDocument()) === undefined
      ? { position: "fixed" as const, ...position(), ...baseStyle() }
      : {
        position: "fixed" as const,
        ...position(),
        overflow: "auto",
        ...baseStyle(),
      };

  createEffect(() => [cardElement(), props.ownerWindow] as const, ([node, ownerWindow]) => {
    // Expansion and source retargeting can change the card height; the ResizeObserver
    // below keeps placement geometry current without polling during pointer movement.
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setCardWidth(rect.width);
      setCardHeight(rect.height);
    };

    // SAFETY: ownerWindow is the browser realm that owns this card's DOM node.
    const Observer = (ownerWindow as Window & typeof globalThis).ResizeObserver;

    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(node);
    measure();
    onCleanup(() => observer.disconnect());
  });
  let expandedElement: Element | undefined;
  let expandedMeasurementId: string | undefined;
  createEffect(() => [props.element, props.measurement.id] as const, ([element, id]) => {
    if (element === expandedElement && id === expandedMeasurementId) return;
    expandedElement = element;
    expandedMeasurementId = id;
    setExpanded(false);
  });

  let copiedTarget: Element | undefined;
  createEffect(() => props.element, (element) => {
    if (element === copiedTarget) return;
    copiedTarget = element;
    setCopiedSelector(false);
    setCopyError(false);
    setCopyFeedback("");
  });

  createEffect(
    () => [props.element, props.passThrough, props.embedded, sourceWindow()] as const,
    ([element, passThrough, embedded, source]) => {

    if (!source || passThrough || embedded) return;

    // SAFETY: sourceWindow() is the global for the selected element's owning document.
    const owner = source as Window & typeof globalThis;
    const inPreview = responsivePreviewVisibleRect(element.ownerDocument) !== undefined;
    let pending = 0;

    const invalidate = () => {
      if (pending) return;
      pending = owner.requestAnimationFrame(() => {
        pending = 0;
        setEvidenceRevision((revision) => revision + 1);
      });
    };

    const observer = new owner.MutationObserver((records) => {
      if (records.some((record) =>
        record.type === "attributes"
        || record.type === "characterData"
        || (record.type === "childList" && element.contains(record.target)),
      )) invalidate();
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ["class", "style"],
      characterData: true,
      childList: true,
      subtree: true,
    });

    let ancestor: Element | null = element.parentElement;

    while (ancestor) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["class", "style"] });
      const root = ancestor.getRootNode();
      ancestor = ancestor.parentElement ?? (root instanceof owner.ShadowRoot ? root.host : null);
    }

    // Root-page cards follow scroll through nested scroll compensation; re-placing
    // them on scroll as well would apply the scroll offset twice.
    if (inPreview) {
      owner.addEventListener("scroll", invalidate, { capture: true, passive: true });
      props.ownerWindow.addEventListener("mesurer:responsive-preview-geometry-change", invalidate);
    }

    return () => {
      observer.disconnect();

      if (inPreview) {
        owner.removeEventListener("scroll", invalidate, true);
        props.ownerWindow.removeEventListener("mesurer:responsive-preview-geometry-change", invalidate);
      }

      if (pending) owner.cancelAnimationFrame(pending);
    };
  });

  let nestedScroll: ReturnType<typeof installNestedScrollCompensation> | null = null;

  createEffect(
    () => [cardElement(), props.element, props.passThrough, props.embedded, props.documentMounted, props.ownerWindow] as const,
    ([card, target, passThrough, embedded, documentMounted, ownerWindow]) => {
      // SAFETY: ownerWindow is the root runtime realm that owns the mounted card DOM.
      const owner = ownerWindow as Window & typeof globalThis;

      const rootDocumentSource = target.ownerDocument === owner.document
        && documentMounted
        && !passThrough
        && !embedded;

      if (!card || !rootDocumentSource) return;

      nestedScroll = installNestedScrollCompensation(owner, target, () => [card], { trackWindow: true });
      card.style.translate = "var(--mesurer-nested-scroll-x, 0px) var(--mesurer-nested-scroll-y, 0px)";

      onCleanup(() => {
        nestedScroll?.release();
        nestedScroll = null;
        card.style.removeProperty("translate");
      });
    },
  );

  createEffect(
    () => props.measurement,
    () => nestedScroll?.rebase(),
  );

  const copy = async (value: string) => {
    try {
      const clipboard = cardElement()?.ownerDocument.defaultView?.navigator.clipboard;

      if (!clipboard) throw new Error("Clipboard unavailable");
      await clipboard.writeText(value);
      setCopyError(false);
      setCopyFeedback("Copied!");

      return true;
    } catch {
      setCopyError(true);
      setCopyFeedback("Copy failed");

      return false;
    }
  };

  const copySelector = async () => {
    const success = await copy(selector());
    setCopiedSelector(success);
  };

  const htmlElement = createMemo(() => {
    const currentWindow = sourceWindow();

    if (!currentWindow) return null;

    // SAFETY: currentWindow is the global that owns props.element.
    const realm = currentWindow as Window & typeof globalThis;

    return props.element instanceof realm.HTMLElement ? props.element : null;
  });

  const typographyRows = createMemo(() => {
    const element = htmlElement();

    if (!props.singleSelection || !element || !sourceWindow()) return [];

    evidenceRevision();
    style();

    const info = new TypographyInspector(sourceDocument(), sourceWindow()!).getFast(element);

    return [
      ...(info.textSnippet ? [{ label: "Text", value: info.textSnippet }] : []),
      ...info.rows.map(({ label, value }) => ({ label, value })),
    ];
  });

  return (
    <div
      ref={setCardElement}
      data-mesurer-inspect-info-card="true"
      data-mesurer-pass-through={props.passThrough ? "true" : undefined}
      data-mesurer-shift-pass-through={shiftHeld() && responsivePreviewVisibleRect(sourceDocument()) !== undefined && !props.passThrough ? "true" : undefined}
      data-mesurer-inspector-ui="true"
      data-theme={props.theme}
      class={`${props.embedded ? "msr:static msr:w-full msr:max-w-none msr:rounded-none msr:py-0" : `${props.documentMounted ? "msr:fixed" : "msr:absolute"} msr:z-[2147483644] msr:w-60 msr:max-w-[calc(100vw-16px)] msr:rounded-lg msr:py-2`} msr:flex msr:flex-col msr:overflow-visible msr:text-[10px]`}
      style={cardStyle()}
      onPointerDown={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onPointerMove={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onPointerUp={(event) => { if (!props.passThrough) event.stopPropagation(); }}
      onClick={(event) => { if (!props.passThrough) event.stopPropagation(); }}
    >
      <style>{`[data-mesurer-inspect-info-card]:not([data-mesurer-pass-through="true"]):not([data-mesurer-shift-pass-through="true"]) { pointer-events: auto; } [data-mesurer-inspect-info-card][data-mesurer-pass-through="true"], [data-mesurer-inspect-info-card][data-mesurer-pass-through="true"] *, [data-mesurer-inspect-info-card][data-mesurer-shift-pass-through="true"], [data-mesurer-inspect-info-card][data-mesurer-shift-pass-through="true"] * { pointer-events: none !important; }`}</style>
      <div class="msr:flex msr:items-center msr:justify-between msr:gap-2 msr:px-2">
        {props.passThrough
          ? <span data-mesurer-inspect-selector="true" class="msr:min-w-0 msr:flex-1 msr:truncate msr:font-mono msr:font-medium">{selector()}</span>
          : <button
            type="button"
            data-mesurer-inspect-selector="true"
            aria-label={`Copy selector ${selector()}`}
            title={copiedSelector() ? "Copied!" : "Click to copy"}
            class="msr:pointer-events-auto msr:min-w-0 msr:flex-1 msr:truncate msr:text-left msr:font-mono msr:font-medium msr:hover:underline"
            onPointerUp={(event) => {
              event.stopPropagation();

              if (event.button === 0) void copySelector();
            }}
            onClick={(event) => {
              event.stopPropagation();

              if (event.detail === 0) void copySelector();
            }}
          >{selector()}</button>}
        <Show when={copiedSelector()}><span aria-label="Selector copied"><CheckIcon size={10} /></span></Show>
        {props.passThrough
          ? <span class="msr:shrink-0 msr:whitespace-nowrap msr:tabular-nums">{dimensions()}</span>
          : <button
            type="button"
            aria-label="Copy dimensions"
            title={copyError() ? "Copy failed" : "Click to copy"}
            class="msr:pointer-events-auto msr:shrink-0 msr:whitespace-nowrap msr:tabular-nums msr:hover:underline"
            onPointerUp={(event) => {
              event.stopPropagation();

              if (event.button === 0) void copy(dimensions());
            }}
            onClick={(event) => {
              event.stopPropagation();

              if (event.detail === 0) void copy(dimensions());
            }}
          >{dimensions()}</button>}
      </div>
      <div class={`msr:mt-2 msr:min-h-0 msr:px-2 ${expanded() ? "mesurer-thin-scrollbar msr:max-h-[min(70vh,32rem)] msr:overflow-y-auto" : ""}`}>
        <div data-mesurer-inspect-details="true" class="msr:flex msr:flex-col msr:gap-0.5">
          <For each={typographyRows()}>{(row) => <InspectDetailRow row={row} copy={copy} passThrough={props.passThrough} onCopyResult={(success) => setCopyFeedback(success ? "Copied!" : "Copy failed")} />}</For>
          <Show when={props.layoutDetailsEnabled}>
            <For each={visible().visible}>{(row) => <InspectDetailRow row={row} copy={copy} passThrough={props.passThrough} onCopyResult={(success) => setCopyFeedback(success ? "Copied!" : "Copy failed")} />}</For>
          </Show>
        </div>
      </div>
      <Show when={!props.passThrough && (visible().hiddenCount > 0 || expanded())}>
        <div class="msr:mt-2 msr:px-2">
          <button
            type="button"
            aria-expanded={expanded() ? "true" : "false"}
            aria-label={expanded() ? "Show less CSS details" : `Show ${visible().hiddenCount} more CSS details`}
            class="msr:pointer-events-auto msr:rounded-[5px] msr:text-[10px] msr:text-ink-500 msr:hover:text-ink-900"
            onPointerUp={(event) => {
              event.stopPropagation();

              if (event.button === 0) setExpanded((value) => !value);
            }}
            onClick={(event) => {
              event.stopPropagation();

              if (event.detail === 0) setExpanded((value) => !value);
            }}
          >{expanded() ? "Show less" : `Show ${visible().hiddenCount} more`}</button>
        </div>
      </Show>
      <Show when={copyFeedback()}><span role="status" aria-live="polite" class="msr:px-2 msr:pt-1 msr:text-[9px] msr:text-ink-500">{copyFeedback()}</span></Show>
    </div>
  );
}
