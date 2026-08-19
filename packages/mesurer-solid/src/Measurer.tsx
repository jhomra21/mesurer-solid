import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";
import { Portal } from "@solidjs/web";
import { getInspectMeasurement } from "./core/dom";
import type { ToolMode } from "./core/types";
import { MeasurementBox } from "./components/MeasurementBox";
import {
  createMeasurerModel,
  type MeasurerModel,
} from "./model/create-measurer-model";

export type MeasurerProps = {
  highlightColor?: string;
  initialEnabled?: boolean;
  initialToolMode?: ToolMode;
  portalTarget?: HTMLElement | ShadowRoot;
  onModel?: (model: MeasurerModel) => void;
};

const DEFAULT_HIGHLIGHT = "oklch(0.62 0.18 255)";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
};

export function Measurer(props: MeasurerProps) {
  const initial = untrack(() => ({
    initialEnabled: props.initialEnabled,
    initialToolMode: props.initialToolMode,
  }));
  const model = createMeasurerModel(initial);
  const [mountTarget, setMountTarget] = createSignal<HTMLElement | ShadowRoot | null>(null);

  createEffect(
    () => props.onModel,
    (onModel) => {
      onModel?.(model);
    },
  );

  onSettled(() => {
    const target = props.portalTarget ?? document.body;
    const ownerDocument = target.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const HTMLElementConstructor = ownerWindow.HTMLElement;
    setMountTarget(target);

    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const resolveTarget = (x: number, y: number) => {
      const element = ownerDocument.elementFromPoint(x, y);
      if (!(element instanceof HTMLElementConstructor)) return null;
      if (element.closest("[data-mesurer-root]")) return null;
      return element as HTMLElement;
    };

    const updateHover = () => {
      pointerFrame = 0;
      if (!model.state.enabled || model.state.toolMode !== "select") {
        model.setHover(null);
        return;
      }

      const element = resolveTarget(pointerX, pointerY);
      if (!element) {
        model.setHover(null);
        return;
      }

      if (model.state.hover?.elementRef === element) return;
      const next = getInspectMeasurement(element, ownerWindow);
      model.setHover(next);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (pointerFrame) return;
      pointerFrame = ownerWindow.requestAnimationFrame(updateHover);
    };

    const onClick = (event: MouseEvent) => {
      if (!model.state.enabled || model.state.toolMode !== "select") return;

      const element = resolveTarget(event.clientX, event.clientY);
      if (!element) return;

      // Selecting an element is an explicit inspection interaction. Prevent the
      // underlying page action while Select mode is active.
      event.preventDefault();
      event.stopPropagation();

      const next = getInspectMeasurement(element, ownerWindow);
      model.select(next);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        model.clearSelection();
        model.setHover(null);
        return;
      }

      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === "m") {
        model.toggleEnabled();
        return;
      }

      if (key === "s" && model.state.enabled) {
        model.toggleToolMode("select");
      }
    };

    const refreshPinnedMeasurements = () => {
      const selectedElement = model.state.selected?.elementRef;
      if (selectedElement?.isConnected) {
        const nextSelected = getInspectMeasurement(selectedElement, ownerWindow);
        model.select(nextSelected);
      }
    };

    ownerDocument.addEventListener("pointermove", onPointerMove, true);
    ownerDocument.addEventListener("click", onClick, true);
    ownerWindow.addEventListener("keydown", onKeyDown);
    ownerWindow.addEventListener("resize", refreshPinnedMeasurements);
    ownerWindow.addEventListener("scroll", refreshPinnedMeasurements, true);

    return () => {
      if (pointerFrame) ownerWindow.cancelAnimationFrame(pointerFrame);
      ownerDocument.removeEventListener("pointermove", onPointerMove, true);
      ownerDocument.removeEventListener("click", onClick, true);
      ownerWindow.removeEventListener("keydown", onKeyDown);
      ownerWindow.removeEventListener("resize", refreshPinnedMeasurements);
      ownerWindow.removeEventListener("scroll", refreshPinnedMeasurements, true);
    };
  });

  return (
    <Show when={mountTarget()}>
      <Portal mount={mountTarget()!}>
        <div
          data-mesurer-root
          class={[
            "msr-root",
            { "msr-root--disabled": !model.state.enabled },
          ]}
        >
          <Show when={model.state.enabled && model.state.toolMode === "select"}>
            <MeasurementBox
              measurement={model.state.hover}
              color={props.highlightColor ?? DEFAULT_HIGHLIGHT}
              variant="hover"
            />
            <MeasurementBox
              measurement={model.state.selected}
              color={props.highlightColor ?? DEFAULT_HIGHLIGHT}
              variant="selected"
            />
          </Show>

          <div class="msr-status">
            <span>{model.state.enabled ? "Mesurer" : "Mesurer off"}</span>
            <Show when={model.state.enabled}>
              <strong>{model.state.toolMode === "select" ? "Select" : "Idle"}</strong>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export default Measurer;
