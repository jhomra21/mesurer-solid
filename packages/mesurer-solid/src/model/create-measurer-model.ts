import { createMemo, createStore, onCleanup } from "solid-js";
import {
  createMeasurerModelCore,
  type GuidePreview,
  type MeasurerModelOptions,
  type MeasurerModelState,
  type MeasurerSettings,
  type SettingsTab,
} from "@jhomra21/mesurer-core";

export type {
  GuidePreview,
  MeasurerModelOptions,
  MeasurerModelState,
  MeasurerSettings,
  SettingsTab,
} from "@jhomra21/mesurer-core";

export function createMeasurerModel(options: MeasurerModelOptions = {}) {
  const core = createMeasurerModelCore<HTMLElement>(options);
  const [state, setState] = createStore<MeasurerModelState<HTMLElement>>(core.getSnapshot());
  const unsubscribe = core.subscribe((snapshot) => setState(() => snapshot));
  onCleanup(unsubscribe);

  const activeSelection = createMemo(
    () => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null,
  );

  return {
    ...core,
    state,
    activeSelection,
  };
}

export type MeasurerModel = ReturnType<typeof createMeasurerModel>;
