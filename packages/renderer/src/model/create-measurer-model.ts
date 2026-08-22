import { createMemo, createStore, getOwner, onCleanup } from "solid-js";
import {
  createMeasurerModelCore,
  type MeasurerCoreModel,
  type MeasurerModelOptions,
  type MeasurerModelState,
} from "@jhomra21/mesurer-solid-core";

export type {
  GuidePreview,
  MeasurerModelOptions,
  MeasurerModelState,
  MeasurerSettings,
  SettingsTab,
} from "@jhomra21/mesurer-solid-core";

export type MeasurerModel = MeasurerCoreModel<HTMLElement> & {
  state: MeasurerModelState<HTMLElement>;
};

const activeModels: MeasurerModel[] = [];

export function getLatestMeasurerModel(): MeasurerModel | null {
  return activeModels.at(-1) ?? null;
}

export function createMeasurerModel(options: MeasurerModelOptions = {}): MeasurerModel {
  const core = createMeasurerModelCore<HTMLElement>(options);
  const [state, setState] = createStore<MeasurerModelState<HTMLElement>>(core.getSnapshot());
  const unsubscribe = core.subscribe((snapshot) => setState(() => snapshot));
  const disposeCore = core.dispose;
  let disposed = false;
  const activeSelection = createMemo(
    () => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null,
  );

  const model: MeasurerModel = {
    ...core,
    dispose,
    state,
    activeSelection,
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    const index = activeModels.indexOf(model);
    if (index >= 0) activeModels.splice(index, 1);
    unsubscribe();
    disposeCore();
  }

  activeModels.push(model);
  if (getOwner()) onCleanup(dispose);
  return model;
}
