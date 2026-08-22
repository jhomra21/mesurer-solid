import { createContext, createMemo, createStore, getOwner, onCleanup, useContext } from "solid-js";
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

const ignoreModelRegistration = (_model: MeasurerModel) => undefined;

export const MeasurerModelRegistrationContext = createContext<(model: MeasurerModel) => void>(
  ignoreModelRegistration,
);

export function createMeasurerModel(options: MeasurerModelOptions = {}): MeasurerModel {
  const owner = getOwner();
  const registerModel = owner ? useContext(MeasurerModelRegistrationContext) : ignoreModelRegistration;
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
    unsubscribe();
    disposeCore();
  }

  registerModel(model);
  if (owner) onCleanup(dispose);
  return model;
}
