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

const DOCUMENT_SELECTED_MEASUREMENT = [
  "[data-mesurer-measurement='true']",
  "[data-mesurer-selected-measurement='true']",
  "[data-mesurer-inspector-ui='true']",
].join("");

const installArrangeDocumentMeasurementGuard = (
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) => {
  const body = runtime.ownerDocument.body;
  if (!body) return;

  const realm = runtime.ownerWindow as Window & typeof globalThis;
  const hiddenMeasurements = new Map<HTMLElement, HiddenMeasurement>();
  let active = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;

  const isDocumentMeasurement = (element: HTMLElement) =>
    element.matches(DOCUMENT_SELECTED_MEASUREMENT)
    && !runtime.portalTarget.contains(element);

  const hideMeasurement = (element: HTMLElement) => {
    if (!active || !isDocumentMeasurement(element)) return;
    if (!hiddenMeasurements.has(element)) {
      hiddenMeasurements.set(element, {
        value: element.style.getPropertyValue("visibility"),
        priority: element.style.getPropertyPriority("visibility"),
      });
    }
    if (
      element.style.getPropertyValue("visibility") !== "hidden"
      || element.style.getPropertyPriority("visibility") !== "important"
    ) {
      element.style.setProperty("visibility", "hidden", "important");
    }
  };

  const hideCurrentMeasurements = () => {
    if (!active) return;
    for (const candidate of body.querySelectorAll(DOCUMENT_SELECTED_MEASUREMENT)) {
      if (candidate instanceof realm.HTMLElement) hideMeasurement(candidate);
    }
  };

  const restoreMeasurements = () => {
    for (const [element, previous] of hiddenMeasurements) {
      if (!element.isConnected) continue;
      if (previous.value || previous.priority) {
        element.style.setProperty("visibility", previous.value, previous.priority);
      } else {
        element.style.removeProperty("visibility");
      }
    }
    hiddenMeasurements.clear();
  };

  const observer = new realm.MutationObserver((records) => {
    if (!active) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof realm.HTMLElement) hideMeasurement(node);
      }
    }
  });
  observer.observe(body, { childList: true });

  const subscription = ctx.state.subscribe(() => {
    const next = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
    if (next === active) return;
    active = next;
    if (active) hideCurrentMeasurements();
    else restoreMeasurements();
  });
  if (active) hideCurrentMeasurements();

  ctx.lifecycle.onDispose(() => {
    observer.disconnect();
    subscription.dispose();
    restoreMeasurements();
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
      installArrangeDocumentMeasurementGuard(ctx, runtime);
    },
  };
};
