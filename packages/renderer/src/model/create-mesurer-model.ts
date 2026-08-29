import { createContext, createMemo, createStore, getOwner, onCleanup, useContext } from "solid-js";
import {
  createMesurerModelCore,
  type MesurerCoreModel,
  type MesurerModelOptions,
  type MesurerModelState,
} from "@jhomra21/mesurer-solid-core";

export type {
  GuidePreview,
  MesurerModelOptions,
  MesurerModelState,
  MesurerSettings,
  SettingsTab,
} from "@jhomra21/mesurer-solid-core";

export type MesurerModel = MesurerCoreModel<HTMLElement> & {
  state: MesurerModelState<HTMLElement>;
};

const ignoreModelRegistration = (_model: MesurerModel) => undefined;

export const MesurerModelRegistrationContext = createContext<(model: MesurerModel) => void>(
  ignoreModelRegistration,
);

export function createMesurerModel(options: MesurerModelOptions = {}): MesurerModel {
  const owner = getOwner();
  const registerModel = owner ? useContext(MesurerModelRegistrationContext) : ignoreModelRegistration;
  const core = createMesurerModelCore<HTMLElement>(options);
  const [state, setState] = createStore<MesurerModelState<HTMLElement>>(core.getSnapshot());
  const unsubscribe = core.subscribe((snapshot) => setState(() => snapshot));
  const disposeCore = core.dispose;
  let disposed = false;
  const activeSelection = createMemo(
    () => state.selectedMeasurement ?? state.selectedMeasurements.at(-1) ?? null,
  );

  const model: MesurerModel = {
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
