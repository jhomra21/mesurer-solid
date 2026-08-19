import { createMemo, createStore } from "solid-js";
import type { InspectMeasurement, ToolMode } from "../core/types";

export type MeasurerModelOptions = {
  initialEnabled?: boolean;
  initialToolMode?: ToolMode;
};

export type MeasurerModelState = {
  enabled: boolean;
  toolMode: ToolMode;
  hover: InspectMeasurement | null;
  selected: InspectMeasurement | null;
};

export function createMeasurerModel(options: MeasurerModelOptions = {}) {
  const [state, setState] = createStore<MeasurerModelState>({
    enabled: options.initialEnabled ?? true,
    toolMode: options.initialToolMode ?? "select",
    hover: null,
    selected: null,
  });

  const activeMeasurement = createMemo(() => state.selected ?? state.hover);

  const setEnabled = (enabled: boolean) => {
    setState((draft) => {
      draft.enabled = enabled;
      if (!enabled) draft.hover = null;
    });
  };

  const toggleEnabled = () => {
    const next = !state.enabled;
    setEnabled(next);
    return next;
  };

  const setToolMode = (toolMode: ToolMode) => {
    setState((draft) => {
      draft.toolMode = toolMode;
      draft.hover = null;
    });
  };

  const toggleToolMode = (toolMode: ToolMode) => {
    const next: ToolMode = state.toolMode === toolMode ? "none" : toolMode;
    setToolMode(next);
    return next;
  };

  const setHover = (measurement: InspectMeasurement | null) => {
    setState((draft) => {
      draft.hover = measurement;
    });
  };

  const select = (measurement: InspectMeasurement | null) => {
    setState((draft) => {
      draft.selected = measurement;
      draft.hover = null;
    });
  };

  const clearSelection = () => select(null);

  return {
    state,
    activeMeasurement,
    setEnabled,
    toggleEnabled,
    setToolMode,
    toggleToolMode,
    setHover,
    select,
    clearSelection,
  };
}

export type MeasurerModel = ReturnType<typeof createMeasurerModel>;
