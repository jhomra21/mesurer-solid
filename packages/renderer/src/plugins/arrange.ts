import type {
  MesurerPlugin,
  MesurerPluginContext,
  PluginValue,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
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

type PresentationSnapshot = {
  visible: boolean;
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
 * State notifications perform only O(1) bit/array-identity checks. They do not
 * even schedule a frame when the relevant policy and intent array are unchanged.
 * O(k) target resolution is invoked only when visibility policy or Arrange
 * intent genuinely changes, never from scroll/pointer activity or unrelated
 * plugin state.
 */
const installArrangePresentationPolicy = (
  ctx: MesurerPluginContext,
  service: MesurerArrangeService,
  ownerWindow: Window,
) => {
  let disposed = false;
  let frame = 0;
  let applied: PresentationSnapshot | null = null;
  let pending: PresentationSnapshot | null = null;

  const readSnapshot = (): PresentationSnapshot => {
    const active = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    return {
      visible: active || presentationPreferences(ctx).keepArrangeChanges,
      intents: ctx.state.get<ArrangeStateRef>(MESURER_ARRANGE_STATE_ID)?.intents ?? [],
    };
  };

  const sameSnapshot = (left: PresentationSnapshot | null, right: PresentationSnapshot) =>
    left?.visible === right.visible && left.intents === right.intents;

  const apply = (snapshot: PresentationSnapshot) => {
    applied = snapshot;
    if (snapshot.visible) {
      service.showCurrent();
      return;
    }

    // The core starts in Desired so persisted intents can be reviewed. Retire
    // that preview immediately when policy says Original. `show(..., "live")`
    // clears every Mesurer-owned preview while retaining intent/history.
    const latest = snapshot.intents.at(-1);
    if (latest) service.show(latest.id, "live");
  };

  const flush = () => {
    frame = 0;
    if (disposed || !pending) return;
    const snapshot = pending;
    pending = null;
    if (!sameSnapshot(applied, snapshot)) apply(snapshot);
  };

  const scheduleIfChanged = () => {
    if (disposed) return;
    const next = readSnapshot();
    if (sameSnapshot(pending ?? applied, next)) return;
    pending = next;
    if (!frame) frame = ownerWindow.requestAnimationFrame(flush);
  };

  const subscription = ctx.state.subscribe(scheduleIfChanged);
  // Correct the core's initial Desired presentation synchronously so a saved
  // Arrange layout cannot flash for one paint when the plugin is restored.
  apply(readSnapshot());

  ctx.lifecycle.onDispose(() => {
    disposed = true;
    if (frame) ownerWindow.cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    subscription.dispose();
  });
};

type HiddenMeasurement = {
  value: string;
  priority: string;
};

/**
 * Arrange core owns the normal measurement hide/restore lifecycle. Solid can
 * remount or restyle measurement chrome while Arrange remains active, so this
 * guard closes only that late-mount gap. Measurements present when Arrange
 * activates stay core-owned; newly mounted measurement nodes are tracked here
 * and restored to their own prior visibility when Arrange exits.
 */
const installArrangeLateMeasurementGuard = (
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) => {
  // SAFETY: runtime.ownerWindow is the DOM realm that owns runtime.portalTarget
  // and all Mesurer nodes observed below, so realm-specific constructor checks
  // must use this Window's globals rather than the ambient test/browser realm.
  const realm = runtime.ownerWindow as Window & typeof globalThis;
  const hiddenLateMeasurements = new Map<HTMLElement, HiddenMeasurement>();
  const coreOwnedMeasurements = new Set<HTMLElement>();
  let active = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;

  const forceHidden = (element: HTMLElement) => {
    if (
      element.style.getPropertyValue("visibility") !== "hidden"
      || element.style.getPropertyPriority("visibility") !== "important"
    ) {
      element.style.setProperty("visibility", "hidden", "important");
    }
  };

  const hideLateMeasurement = (element: HTMLElement) => {
    if (!active) return;
    if (coreOwnedMeasurements.has(element)) {
      forceHidden(element);
      return;
    }
    if (!hiddenLateMeasurements.has(element)) {
      hiddenLateMeasurements.set(element, {
        value: element.style.getPropertyValue("visibility"),
        priority: element.style.getPropertyPriority("visibility"),
      });
    }
    forceHidden(element);
  };

  const hideNodeMeasurements = (node: Node) => {
    if (!active || !(node instanceof realm.Element)) return;
    if (node instanceof realm.HTMLElement && node.matches("[data-mesurer-measurement='true']")) {
      hideLateMeasurement(node);
    }
    for (const candidate of node.querySelectorAll("[data-mesurer-measurement='true']")) {
      if (candidate instanceof realm.HTMLElement) hideLateMeasurement(candidate);
    }
  };

  const claimCurrentMeasurementsForCore = () => {
    if (!active) return;
    for (const candidate of runtime.portalTarget.querySelectorAll("[data-mesurer-measurement='true']")) {
      if (!(candidate instanceof realm.HTMLElement)) continue;
      coreOwnedMeasurements.add(candidate);
      forceHidden(candidate);
    }
  };

  const restoreLateMeasurements = () => {
    for (const [element, previous] of hiddenLateMeasurements) {
      if (!element.isConnected) continue;
      if (previous.value || previous.priority) {
        element.style.setProperty("visibility", previous.value, previous.priority);
      } else {
        element.style.removeProperty("visibility");
      }
    }
    hiddenLateMeasurements.clear();
    coreOwnedMeasurements.clear();
  };

  const observer = new realm.MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof realm.HTMLElement) {
        if (record.target.matches("[data-mesurer-measurement='true']")) hideLateMeasurement(record.target);
        continue;
      }
      for (const node of record.addedNodes) hideNodeMeasurements(node);
    }
  });
  observer.observe(runtime.portalTarget, {
    attributes: true,
    attributeFilter: ["style"],
    childList: true,
    subtree: true,
  });

  const subscription = ctx.state.subscribe(() => {
    const next = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    if (next === active) return;
    active = next;
    if (active) claimCurrentMeasurementsForCore();
    else restoreLateMeasurements();
  });
  if (active) claimCurrentMeasurementsForCore();

  ctx.lifecycle.onDispose(() => {
    observer.disconnect();
    subscription.dispose();
    restoreLateMeasurements();
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
      const runtime = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");
      if (!runtime) throw new Error("Arrange presentation policy requires the Solid renderer runtime.");
      installArrangePresentationPolicy(ctx, service, runtime.ownerWindow);
      installArrangeLateMeasurementGuard(ctx, runtime);
    },
  };
};
