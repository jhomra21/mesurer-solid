import { createContext, useContext, type Accessor, type ParentComponent } from "solid-js";
import type {
  SettingsContribution,
  SettingsToggleContribution,
} from "@jhomra21/mesurer-solid-core";

export type MesurerPluginSettingsRuntime = {
  sections: Accessor<SettingsContribution[]>;
  version: Accessor<string>;
  update(sectionId: string, control: SettingsToggleContribution, value: boolean): void;
  reset(): void;
};

const PluginSettingsContext = createContext<MesurerPluginSettingsRuntime | null>(null);

export const MesurerPluginSettingsProvider: ParentComponent<{
  runtime: MesurerPluginSettingsRuntime;
}> = (props) => (
  <PluginSettingsContext value={props.runtime}>
    {props.children}
  </PluginSettingsContext>
);

export const useMesurerPluginSettings = () => useContext(PluginSettingsContext);
