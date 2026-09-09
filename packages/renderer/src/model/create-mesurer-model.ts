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
  const setGuides: typeof core.setGuides = (guides) => {
    const current = core.current.guides;
    const unchanged = current.length === guides.length
      && current.every((guide, index) => {
        const next = guides[index];
        return Boolean(
          next
          && next.id === guide.id
          && next.orientation === guide.orientation
          && next.position === guide.position,
        );
      });
    if (unchanged) return;
    core.setGuides(guides);
  };

  const model: MesurerModel = {
    ...core,
    setGuides,
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
