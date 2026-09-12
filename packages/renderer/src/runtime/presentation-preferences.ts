import type { MesurerPluginContext, PluginValue } from "@jhomra21/mesurer-solid-core";

export const MESURER_PRESENTATION_PREFERENCES_STATE_ID = "mesurer.presentation.preferences";
export const MESURER_PRESENTATION_SETTINGS_ID = "presentation";

export type MesurerPresentationPreferences = {
  keepTextChanges: boolean;
  keepArrangeChanges: boolean;
};

type PresentationPreferenceState = {
  [key: string]: PluginValue;
  keepTextChanges: boolean;
  keepArrangeChanges: boolean;
};

export const DEFAULT_MESURER_PRESENTATION_PREFERENCES: MesurerPresentationPreferences = {
  keepTextChanges: false,
  keepArrangeChanges: false,
};

export const presentationPreferences = (
  ctx: MesurerPluginContext,
): MesurerPresentationPreferences => {
  const value = ctx.state.get<PresentationPreferenceState>(MESURER_PRESENTATION_PREFERENCES_STATE_ID);
  return value ?? DEFAULT_MESURER_PRESENTATION_PREFERENCES;
};

export const updatePresentationPreferences = (
  ctx: MesurerPluginContext,
  patch: Partial<MesurerPresentationPreferences>,
) => {
  ctx.state.update<PresentationPreferenceState>(MESURER_PRESENTATION_PREFERENCES_STATE_ID, (current) => ({
    ...current,
    ...patch,
  }));
};

/**
 * Register user-owned page-presentation policy once on the runtime bridge.
 *
 * These are presentation preferences, not edit/arrange intent. They persist but
 * do not participate in content history. Reading either flag is O(1); applying
 * or restoring the affected page mutations is left to the owning feature and
 * occurs only when policy/tool/intent state changes.
 */
export const installPresentationPreferences = (ctx: MesurerPluginContext) => {
  ctx.state.register<PresentationPreferenceState>({
    id: MESURER_PRESENTATION_PREFERENCES_STATE_ID,
    initial: { ...DEFAULT_MESURER_PRESENTATION_PREFERENCES },
    persist: true,
  });

  ctx.settings.register({
    id: MESURER_PRESENTATION_SETTINGS_ID,
    label: "Changes",
    order: 20,
    controls: [
      {
        type: "toggle",
        id: "keep-text-changes",
        label: "Keep text changes",
        description: "Keep saved Typography text and style changes visible while another tool is active.",
        value: () => presentationPreferences(ctx).keepTextChanges,
        set: (keepTextChanges) => updatePresentationPreferences(ctx, { keepTextChanges }),
      },
      {
        type: "toggle",
        id: "keep-arrange-changes",
        label: "Keep Arrange changes",
        description: "Keep saved Arrange positions visible while another tool is active.",
        value: () => presentationPreferences(ctx).keepArrangeChanges,
        set: (keepArrangeChanges) => updatePresentationPreferences(ctx, { keepArrangeChanges }),
      },
    ],
  });
};
