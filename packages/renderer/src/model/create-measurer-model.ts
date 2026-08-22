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

const activeModels: unknown[] = [];

export function getLatestMeasurerModel(): MeasurerModel | null {
  return (activeModels.at(-1) as MeasurerModel | undefined) ?? null;
}

export function createMeasurerModel(options: MeasurerModelOptions = {}) {
  const core = createMeasurerModelCore<HTMLElement>(options);
  const [state, setState] = createStore<MeasurerModelState<HTMLElement>>(core.getSnapshot());
  const unsubscribe = core.subscribe((snapshot) => setState(() => snapshot));
  const disposeCore = core.dispose;
  let disposed = false;
  let model: MeasurerModel;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const index = activeModels.indexOf(model);
    if (index >= 0) activeModels.splice(index, 1);
    unsubscribe();
    disposeCore();
  };
  if (getOwner()) onCleanup(dispose);

  const activeSelection = createMemo(
    () => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null,
  );

  model = {
    ...core,
    dispose,
    state,
    activeSelection,
  } as MeasurerModel;
  activeModels.push(model);
  return model;
}

export type MeasurerModel = ReturnType<typeof createMeasurerModel>;
