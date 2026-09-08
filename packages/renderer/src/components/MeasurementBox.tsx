import { Show, createSignal, onSettled } from "solid-js";
import { Portal } from "@solidjs/web";
import type { InspectMeasurement, Measurement } from "../core/types";
import type { EdgeVisibility } from "../core/edge-visibility";
import { MEASURE_LABEL_OFFSET, MEASURE_TRANSITION_MS } from "../core/constants";

export type MeasurementBoxProps = {
  measurement: Measurement | InspectMeasurement | null;
  outlineColor: string;
  fillColor: string;
  edgeVisibility?: EdgeVisibility;
};

const allEdges: EdgeVisibility = { top: true, right: true, bottom: true, left: true };
const formatValue = (value: number) => Math.round(value);

export function MeasurementBox(props: MeasurementBoxProps) {
  let chromeElement: HTMLDivElement | undefined;
  let labelElement: HTMLDivElement | undefined;
  let portalObserver: MutationObserver | null = null;
  const [selectionPortalTarget, setSelectionPortalTarget] = createSignal<HTMLElement | null>(null);
  const edges = () => props.edgeVisibility ?? allEdges;
  const isSelectionGroup = () => Boolean(props.measurement?.id.startsWith("group-"));
  const isSelectedMeasurement = () => Boolean(props.measurement && "paddingRect" in props.measurement);
  const transition = () => isSelectedMeasurement()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease, width ${MEASURE_TRANSITION_MS}ms ease, height ${MEASURE_TRANSITION_MS}ms ease`;
  const labelTransition = () => isSelectedMeasurement()
    ? "none"
    : `left ${MEASURE_TRANSITION_MS}ms ease, top ${MEASURE_TRANSITION_MS}ms ease`;

  const liveSelectedTarget = () => {
    const measurement = props.measurement;
    if (!measurement || !("paddingRect" in measurement)) return null;
    const target = measurement.elementRef;
    return target?.isConnected ? target : null;
  };

  const syncSelectedGeometry = () => {
    const target = liveSelectedTarget();
    if (!target || !chromeElement || !labelElement) return;
    const rect = target.getBoundingClientRect();
    const ownerWindow = target.ownerDocument.defaultView;
    const selectionRoot = chromeElement.parentElement;
    // A selected measurement is portaled to <body> for the document native-
    // anchor path. Its absolute fallback therefore uses document coordinates,
    // not viewport coordinates. Keeping this fallback correct prevents a
    // transient native-anchor handoff during direct edit from subtracting the
    // page scroll offset a second time. Local/Shadow DOM overlays keep the
    // original viewport-coordinate behavior.
    const documentLayer = Boolean(
      ownerWindow
      && selectionRoot?.parentNode === target.ownerDocument.body,
    );
    const offsetX = documentLayer ? ownerWindow!.scrollX : 0;
    const offsetY = documentLayer ? ownerWindow!.scrollY : 0;
    const left = rect.left + offsetX;
    const top = rect.top + offsetY;
    Object.assign(chromeElement.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    Object.assign(labelElement.style, {
      left: `${left + rect.width / 2}px`,
      top: `${top + rect.height + MEASURE_LABEL_OFFSET}px`,
    });
  };

  const configureSelectionRoot = (root: HTMLDivElement) => {
    portalObserver?.disconnect();
    const ownerWindow = root.ownerDocument.defaultView;
    if (!ownerWindow) return;
    // SAFETY: ownerWindow owns root and therefore provides the matching DOM observer constructor.
    const realm = ownerWindow as Window & typeof globalThis;
    const preserveAnchorContainingBlock = () => {
      // document-scroll-anchoring may normalize a legacy selection wrapper to
      // absolute (0,0). A Solid Portal is already in the document layer, so
      // that normalization is unnecessary and would hide the page anchor from
      // its descendants. Keep only the harmless display/size normalization.
      root.style.removeProperty("position");
      root.style.removeProperty("left");
      root.style.removeProperty("top");
    };
    portalObserver = new realm.MutationObserver(preserveAnchorContainingBlock);
    portalObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
    preserveAnchorContainingBlock();
  };

  onSettled(() => {
    const target = liveSelectedTarget();
    const ownerWindow = target?.ownerDocument.defaultView;
    if (!target || !ownerWindow) return;

    // Only escape a document-root overlay. Shadow-root consumers keep their
    // existing local overlay ownership and skip document-level CSS anchoring.
    if (chromeElement?.getRootNode() === target.ownerDocument && target.ownerDocument.body) {
      setSelectionPortalTarget(target.ownerDocument.body);
    }

    const syncGeometry = () => syncSelectedGeometry();
    syncGeometry();
    ownerWindow.addEventListener("scroll", syncGeometry, true);
    ownerWindow.addEventListener("resize", syncGeometry, true);
    return () => {
      portalObserver?.disconnect();
      portalObserver = null;
      ownerWindow.removeEventListener("scroll", syncGeometry, true);
      ownerWindow.removeEventListener("resize", syncGeometry, true);
    };
  });

  const surfaces = (measurement: () => Measurement | InspectMeasurement) => <>
    <Show when={!isSelectionGroup()}>
      <div ref={chromeElement} class="msr:absolute" style={{
        left: `${measurement().rect.left}px`, top: `${measurement().rect.top}px`, width: `${measurement().rect.width}px`, height: `${measurement().rect.height}px`,
        "background-color": props.fillColor,
        transition: transition(),
        animation: "none",
      }}>
        <Show when={edges().top}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().right}><div class="msr:absolute msr:right-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().bottom}><div class="msr:absolute msr:bottom-0 msr:left-0 msr:h-px msr:w-full" style={{ "background-color": props.outlineColor }} /></Show>
        <Show when={edges().left}><div class="msr:absolute msr:left-0 msr:top-0 msr:h-full msr:w-px" style={{ "background-color": props.outlineColor }} /></Show>
      </div>
    </Show>
    <div ref={labelElement} class="msr:pointer-events-none msr:absolute msr:rounded msr:px-1 msr:py-0.5 msr:text-[10px] msr:text-ink-50 msr:tabular-nums msr:select-none msr:-translate-x-1/2 msr:bg-ink-900/90" style={{
      left: `${measurement().rect.left + measurement().rect.width / 2}px`,
      top: `${measurement().rect.top + measurement().rect.height + MEASURE_LABEL_OFFSET}px`,
      transition: labelTransition(),
      animation: "none",
    }}>
      {formatValue(measurement().rect.width)} x {formatValue(measurement().rect.height)}
    </div>
  </>;

  return (
    <Show when={props.measurement}>
      {(measurement) => <Show
        when={isSelectedMeasurement() && !isSelectionGroup() ? selectionPortalTarget() : null}
        fallback={<div class="msr:pointer-events-none" data-mesurer-measurement="true" data-mesurer-selected-measurement={"paddingRect" in measurement() ? "true" : undefined} data-mesurer-selection-group={isSelectionGroup() ? "true" : undefined}>
          {surfaces(measurement)}
        </div>}
      >
        {(mount) => <Portal mount={mount()}>
          <div
            ref={configureSelectionRoot}
            class="msr:pointer-events-none"
            data-mesurer-measurement="true"
            data-mesurer-selected-measurement="true"
            data-mesurer-inspector-ui="true"
          >
            {surfaces(measurement)}
          </div>
        </Portal>}
      </Show>}
    </Show>
  );
}
