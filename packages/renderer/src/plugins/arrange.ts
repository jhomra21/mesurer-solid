import type {
  MesurerPlugin,
  MesurerPluginContext,
  PluginValue,
} from "@jhomra21/mesurer-solid-core";
import { presentationPreferences } from "../runtime/presentation-preferences";
import {
  MESURER_ARRANGE_ACTIVE_STATE_ID,
  MESURER_ARRANGE_SERVICE_ID,
  MESURER_ARRANGE_STATE_ID,
  arrangePlugin as arrangeCorePlugin,
  type MesurerArrangeService,
} from "./arrange-core";

export * from "./arrange-core";

type ArrangeIntentRef = {
  [key: string]: PluginValue;
  id: string;
};

type ArrangeStateRef = {
  [key: string]: PluginValue;
  intents: ArrangeIntentRef[];
};

/**
 * Keep Arrange intent separate from page presentation.
 *
 * The core owns drag geometry, reversible inline-transform ownership, history,
 * capture/review, and all Arrange UI. This wrapper owns only the user policy for
 * whether saved Desired transforms should remain visible after Arrange turns
 * off. The default is the untouched page; Keep Arrange changes opts into the
 * saved Desired presentation outside the tool.
 *
 * Policy checks are O(1): state array identity, one active bit, and one setting
 * bit. O(k) target resolution is invoked only when the presentation actually
 * changes or the intent array changes, never merely because unrelated plugin
 * state changed.
 */
const installArrangePresentationPolicy = (
  ctx: MesurerPluginContext,
  service: MesurerArrangeService,
) => {
  let disposed = false;
  let frame = 0;
  let previousVisible: boolean | null = null;
  let previousIntents: ArrangeIntentRef[] | null = null;

  const sync = () => {
    frame = 0;
    if (disposed) return;

    const active = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    const visible = active || presentationPreferences(ctx).keepArrangeChanges;
    const intents = ctx.state.get<ArrangeStateRef>(MESURER_ARRANGE_STATE_ID)?.intents ?? [];
    if (visible === previousVisible && intents === previousIntents) return;

    previousVisible = visible;
    previousIntents = intents;
    if (visible) {
      service.showCurrent();
      return;
    }

    // The core starts in Desired so persisted intents can be reviewed. Retire
    // that preview immediately when policy says Original. `show(..., "live")`
    // clears every Mesurer-owned preview while retaining intent/history.
    const latest = intents.at(-1);
    if (latest) service.show(latest.id, "live");
  };

  const schedule = () => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(sync);
  };

  const subscription = ctx.state.subscribe(schedule);
  // Correct the core's initial Desired presentation synchronously so a saved
  // Arrange layout cannot flash for one paint when the plugin is restored.
  sync();

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    subscription.dispose();
  });
};

export const arrangePlugin = (): MesurerPlugin => {
  const core = arrangeCorePlugin();
  return {
    ...core,
    async setup(ctx) {
      await core.setup(ctx);
      const service = ctx.service.get<MesurerArrangeService>(MESURER_ARRANGE_SERVICE_ID);
      if (!service) throw new Error("Arrange presentation policy requires the Arrange service.");
      installArrangePresentationPolicy(ctx, service);
    },
  };
};
