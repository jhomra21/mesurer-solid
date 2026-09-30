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
 * Keep Edit movement intent separate from page presentation.
 *
 * The core owns drag geometry, reversible inline-transform ownership, history,
 * capture/review, and all Edit movement UI. This wrapper owns only the user policy for
 * whether saved Desired transforms should remain visible after Edit turns
 * off. The default is the untouched page; Keep Edit changes opts into the
 * saved Desired presentation outside the tool.
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

const TEXT_EDIT_RUNTIME = "[data-mesurer-text-edit-runtime='true']";

const TEXT_EDITOR = "[data-mesurer-text-editor='true']";

/**
 * Edit core suppresses measurements inside the normal renderer portal. A
 * selected page target can move its MeasurementBox root to <body>, outside that
 * portal, so this guard owns only that document-backed root. Direct text editing
 * temporarily takes visible selection-chrome ownership; while its editor exists,
 * release the document measurement instead of leaving the direct-edit surface
 * paintless.
 */
const installArrangeDocumentMeasurementGuard = (
  ctx: MesurerPluginContext,
  runtime: MesurerSolidRuntimeService,
) => {
  const body = runtime.ownerDocument.body;

  if (!body) return;

  // SAFETY: runtime.ownerWindow is the DOM realm that owns body, portalTarget, and the document-backed text runtime.
  const realm = runtime.ownerWindow as Window & typeof globalThis;
  const hiddenMeasurements = new Map<HTMLElement, HiddenMeasurement>();
  let active = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;
  let textRuntimeMounts: HTMLElement[] = [];
  let textObserver: MutationObserver | null = null;

  // MeasurementBox deliberately portals a document-backed selection directly
  // under <body>. Identify that ownership by its actual DOM mount instead of by
  // portalTarget containment: hosts are allowed to use <body> itself as the
  // renderer portal target, which would otherwise make the guard miss the
  // selected root and leave Edit plus selection chrome painted together.
  const isDocumentMeasurement = (element: HTMLElement) =>
    element.matches(DOCUMENT_SELECTED_MEASUREMENT)
    && element.getRootNode() === runtime.ownerDocument
    && element.parentElement === body;

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

  const directEditActive = () =>
    textRuntimeMounts.some((mount) =>
      mount.isConnected && Boolean(mount.querySelector(TEXT_EDITOR)));

  const hideMeasurement = (element: HTMLElement) => {
    if (!active || directEditActive() || !isDocumentMeasurement(element)) return;

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
    if (!active || directEditActive()) return;

    for (const candidate of body.querySelectorAll(DOCUMENT_SELECTED_MEASUREMENT)) {
      if (candidate instanceof realm.HTMLElement) hideMeasurement(candidate);
    }
  };

  const syncMeasurements = () => {
    if (!active || directEditActive()) restoreMeasurements();
    else hideCurrentMeasurements();
  };

  const observeTextRuntimes = () => {
    const mounts = Array.from(body.querySelectorAll<HTMLElement>(TEXT_EDIT_RUNTIME));

    if (
      mounts.length === textRuntimeMounts.length
      && mounts.every((mount, index) => mount === textRuntimeMounts[index])
    ) return;

    textObserver?.disconnect();
    textObserver = null;
    textRuntimeMounts = mounts;

    if (mounts.length > 0) {
      textObserver = new realm.MutationObserver(syncMeasurements);

      for (const mount of mounts) {
        textObserver.observe(mount, { childList: true, subtree: true });
      }
    }

    syncMeasurements();
  };

  observeTextRuntimes();

  // Both Solid-selected MeasurementBox portals and Mesurer text runtimes are
  // direct body children. Observe only those ownership roots, not host subtrees.
  const bodyObserver = new realm.MutationObserver((records) => {
    let runtimeMayHaveChanged = false;

    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof realm.HTMLElement)) continue;

        if (node.matches(TEXT_EDIT_RUNTIME)) runtimeMayHaveChanged = true;
        hideMeasurement(node);
      }

      for (const node of record.removedNodes) {
        if (
          node instanceof realm.HTMLElement
          && node.matches(TEXT_EDIT_RUNTIME)
        ) runtimeMayHaveChanged = true;
      }
    }

    if (runtimeMayHaveChanged) observeTextRuntimes();
  });

  bodyObserver.observe(body, { childList: true });

  const subscription = ctx.state.subscribe(() => {
    const next = ctx.state.get<boolean>(MESURER_ARRANGE_ACTIVE_STATE_ID) ?? false;

    if (next === active) return;
    active = next;
    syncMeasurements();
  });

  syncMeasurements();

  ctx.lifecycle.onDispose(() => {
    bodyObserver.disconnect();
    textObserver?.disconnect();
    textObserver = null;
    textRuntimeMounts = [];
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

      if (!service) throw new Error("Edit movement presentation policy requires the movement service.");
      const runtime = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");

      if (!runtime) throw new Error("Edit movement presentation policy requires the Solid renderer runtime.");
      installArrangePresentationPolicy(ctx, service, runtime.ownerWindow);
      installArrangeDocumentMeasurementGuard(ctx, runtime);
    },
  };
};
