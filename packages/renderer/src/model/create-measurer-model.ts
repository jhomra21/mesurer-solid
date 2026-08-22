import { createMemo, createStore, getOwner, onCleanup } from "solid-js";
import {
  createMeasurerModelCore,
  type GuidePreview,
  type MeasurerModelOptions,
  type MeasurerModelState,
  type MeasurerSettings,
  type SettingsTab,
} from "@jhomra21/mesurer-solid-core";

export type {
  GuidePreview,
  MeasurerModelOptions,
  MeasurerModelState,
  MeasurerSettings,
  SettingsTab,
} from "@jhomra21/mesurer-solid-core";

export function createMeasurerModel(options: MeasurerModelOptions = {}) {
  const core = createMeasurerModelCore<HTMLElement>(options);
  const [state, setState] = createStore<MeasurerModelState<HTMLElement>>(core.getSnapshot());
  const unsubscribe = core.subscribe((snapshot) => setState(() => snapshot));
  const disposeCore = core.dispose;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    disposeCore();
  };
  if (getOwner()) onCleanup(dispose);

  const activeSelection = createMemo(
    () => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null,
  );

  return {
    ...core,
    dispose,
    state,
    activeSelection,
  };
}

export type MeasurerModel = ReturnType<typeof createMeasurerModel>;
