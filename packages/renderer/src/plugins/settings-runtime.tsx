import { createContext, useContext, type Accessor, type ParentComponent } from "solid-js";
import type {
  SettingsContribution,
  SettingsToggleContribution,
} from "@jhomra21/mesurer-solid-core";

export type MesurerPluginSettingsEntry = {
  id: string;
  label: string;
  enabled: boolean;
  busy: boolean;
  sections: SettingsContribution[];
};

export type MesurerPluginSettingsRuntime = {
  plugins: Accessor<MesurerPluginSettingsEntry[]>;
  version: Accessor<string>;
  setEnabled(pluginId: string, enabled: boolean): void;
  update(sectionId: string, control: SettingsToggleContribution, value: boolean): void;
  reset(): Promise<void>;
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
