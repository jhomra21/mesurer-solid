import { createSignal } from "solid-js";
import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type PluginValue,
} from "@jhomra21/mesurer-solid-core";
import { LayoutGuidesOverlay } from "../components/LayoutGuidesOverlay";
import { LayoutGuidesPanel } from "../components/LayoutGuidesPanel";
import {
  layoutGuideLabel,
  normalizeLayoutGuide,
  normalizeLayoutGuides,
  type LayoutGuide,
  type LayoutGuideAlign,
  type LayoutGuideInput,
  type LayoutGuideKind,
} from "../core/layout-guides";
import type { MesurerSolidRuntimeService } from "../ComposableMesurer";
import { getMesurerPageKey, subscribeMesurerPageKey } from "../runtime/page-location";
import { render } from "../solid-dom";

export const MESURER_LAYOUT_GUIDES_PLUGIN_ID = "mesurer.layout-guides";

export const MESURER_LAYOUT_GUIDES_SERVICE_ID = "layout-guides:v1";

export const MESURER_LAYOUT_GUIDES_STATE_ID = "mesurer.layout-guides.pages";

export const MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID = "mesurer.layout-guides.active";

const RUNTIME_SERVICE_ID = "runtime:solid";

const TOGGLE_COMMAND = "layout-guides.toggle";

const ADD_COMMAND = "layout-guides.add";

const UPDATE_COMMAND = "layout-guides.update";

const REMOVE_COMMAND = "layout-guides.remove";

const CLEAR_COMMAND = "layout-guides.clear";

const PANEL_WIDTH = 280;

const PANEL_GAP = 8;

const VIEWPORT_PADDING = 8;

type LayoutGuideValue = {
  [key: string]: PluginValue;
  id: string;
  kind: LayoutGuideKind;
  visible: boolean;
  color: string;
  opacity: number;
  count: number;
  size: number;
  gutter: number;
  offset: number;
  align: LayoutGuideAlign;
};

type LayoutGuidesState = {
  [key: string]: PluginValue;
  pages: { [pageKey: string]: LayoutGuideValue[] };
};

const toValue = (guide: LayoutGuide): LayoutGuideValue => ({ ...guide });

const toValues = (guides: LayoutGuide[]): LayoutGuideValue[] => guides.map(toValue);

const asRecord = (value: PluginValue | undefined): { [key: string]: PluginValue } | null =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;

const inputFromRecord = (record: { [key: string]: PluginValue } | null): LayoutGuideInput => {
  if (!record) return {};
  const input: LayoutGuideInput = {};

  if (typeof record.id === "string") input.id = record.id;

  if (record.kind === "columns" || record.kind === "rows" || record.kind === "grid") input.kind = record.kind;

  if (typeof record.visible === "boolean") input.visible = record.visible;

  if (typeof record.color === "string") input.color = record.color;

  if (typeof record.opacity === "number") input.opacity = record.opacity;

  if (typeof record.count === "number") input.count = record.count;

  if (typeof record.size === "number") input.size = record.size;

  if (typeof record.gutter === "number") input.gutter = record.gutter;

  if (typeof record.offset === "number") input.offset = record.offset;

  if (
    record.align === "stretch"
    || record.align === "min"
    || record.align === "center"
    || record.align === "max"
  ) input.align = record.align;

  return input;
};

const inputToValue = (input: LayoutGuideInput): PluginValue => {
  const value: { [key: string]: PluginValue } = {};

  if (input.id !== undefined) value.id = input.id;

  if (input.kind !== undefined) value.kind = input.kind;

  if (input.visible !== undefined) value.visible = input.visible;

  if (input.color !== undefined) value.color = input.color;

  if (input.opacity !== undefined) value.opacity = input.opacity;

  if (input.count !== undefined) value.count = input.count;

  if (input.size !== undefined) value.size = input.size;

  if (input.gutter !== undefined) value.gutter = input.gutter;

  if (input.offset !== undefined) value.offset = input.offset;

  if (input.align !== undefined) value.align = input.align;

  return value;
};

export type MesurerLayoutGuidesService = {
  list(): LayoutGuide[];
  add(input?: LayoutGuideInput): Promise<LayoutGuide>;
  update(id: string, patch: Partial<Omit<LayoutGuide, "id">>): Promise<LayoutGuide>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

const layoutGuideIcon = {
  viewBox: "0 0 256 256",
  paths: [
    "M48 48h160v8H48zM48 200h160v8H48zM48 56h8v144h-8zM200 56h8v144h-8z",
    "M101 56h8v144h-8zM147 56h8v144h-8z",
  ],
};

export const layoutGuidesPlugin = (): MesurerPlugin => defineMesurerPlugin({
  id: MESURER_LAYOUT_GUIDES_PLUGIN_ID,
  version: "0.1.0",
  requires: [RUNTIME_SERVICE_ID],
  provides: [MESURER_LAYOUT_GUIDES_SERVICE_ID, "tool:layout-guides"],
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>(RUNTIME_SERVICE_ID);

    if (!runtime) throw new Error("Layout Guides requires the Solid renderer runtime.");
    const rendererRoot = runtime.rendererRoot;

    if (!rendererRoot) throw new Error("Layout Guides requires a mounted renderer root.");

    ctx.state.register<LayoutGuidesState>({
      id: MESURER_LAYOUT_GUIDES_STATE_ID,
      initial: { pages: {} },
      history: true,
      persist: true,
    });

    ctx.state.register({
      id: MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID,
      initial: false,
    });

    let pageKey = getMesurerPageKey(runtime.ownerWindow);
    const [revision, setRevision] = createSignal(0);
    const listeners = new Set<() => void>();
    let positionFrame = 0;

    const state = () =>
      ctx.state.get<LayoutGuidesState>(MESURER_LAYOUT_GUIDES_STATE_ID) ?? { pages: {} };

    const active = () =>
      ctx.state.get<boolean>(MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID) ?? false;

    const list = () => normalizeLayoutGuides(state().pages[pageKey] ?? []);

    const setActive = (value: boolean) => {
      ctx.state.update<boolean>(MESURER_LAYOUT_GUIDES_ACTIVE_STATE_ID, () => value);
    };

    const updatePage = (update: (guides: LayoutGuide[]) => LayoutGuide[]) => {
      ctx.state.update<LayoutGuidesState>(MESURER_LAYOUT_GUIDES_STATE_ID, (current) => ({
        ...current,
        pages: {
          ...current.pages,
          [pageKey]: toValues(update(normalizeLayoutGuides(current.pages[pageKey] ?? []))),
        },
      }));
    };

    ctx.command.register(TOGGLE_COMMAND, () => {
      setActive(!active());

      return active();
    });

    ctx.command.register(ADD_COMMAND, (args) => {
      const guide = normalizeLayoutGuide(inputFromRecord(asRecord(args)));
      updatePage((current) => [...current, guide]);

      return { ...guide };
    });

    ctx.command.register(UPDATE_COMMAND, (args) => {
      const record = asRecord(args);
      const id = typeof record?.id === "string" ? record.id : null;
      const patch = inputFromRecord(asRecord(record?.patch));

      if (!id) throw new Error("layout-guides.update requires a guide id.");
      let updated: LayoutGuide | null = null;

      updatePage((current) => current.map((guide) => {
        if (guide.id !== id) return guide;
        updated = normalizeLayoutGuide({ ...guide, ...patch, id: guide.id });

        return updated;
      }));

      if (!updated) throw new Error(`Layout guide not found: ${id}`);

      return { ...updated };
    });

    ctx.command.register(REMOVE_COMMAND, (args) => {
      const record = asRecord(args);
      const id = typeof record?.id === "string" ? record.id : null;

      if (!id) throw new Error("layout-guides.remove requires a guide id.");
      let removed = false;

      updatePage((current) => current.filter((guide) => {
        if (guide.id !== id) return true;
        removed = true;

        return false;
      }));

      return removed;
    });

    ctx.command.register(CLEAR_COMMAND, () => {
      updatePage(() => []);
    });

    const commandGuide = async (
      id: string,
      args?: PluginValue,
    ): Promise<LayoutGuide> => {
      const result = await ctx.command.execute(id, args);
      const record = asRecord(result);

      if (!record) throw new Error(`${id} did not return a layout guide.`);

      return normalizeLayoutGuide(inputFromRecord(record));
    };

    const service: MesurerLayoutGuidesService = {
      list: () => list().map((guide) => ({ ...guide })),
      add: (input = {}) => commandGuide(ADD_COMMAND, inputToValue(input)),
      update: (id, patch) => commandGuide(UPDATE_COMMAND, {
        id,
        patch: inputToValue(patch),
      }),
      async remove(id) {
        return (await ctx.command.execute(REMOVE_COMMAND, { id })) === true;
      },
      async clear() {
        await ctx.command.execute(CLEAR_COMMAND);
      },
      subscribe(listener) {
        listeners.add(listener);
        let disposed = false;

        return () => {
          if (disposed) return;
          disposed = true;
          listeners.delete(listener);
        };
      },
    };

    ctx.service.provide(MESURER_LAYOUT_GUIDES_SERVICE_ID, service);

    ctx.tool.register({
      id: "layout-guides",
      label: "Layout guides",
      shortcut: "L",
      command: TOGGLE_COMMAND,
      order: 38,
      icon: layoutGuideIcon,
      active,
    });

    const overlayMount = runtime.ownerDocument.createElement("div");
    overlayMount.dataset.mesurerLayoutGuidesRoot = "true";
    overlayMount.dataset.mesurerLayer = "evidence";
    overlayMount.style.position = "absolute";
    overlayMount.style.inset = "0";
    overlayMount.style.pointerEvents = "none";
    rendererRoot.prepend(overlayMount);

    const disposeOverlay = render(() => {
      revision();

      return <LayoutGuidesOverlay guides={list()} />;
    }, overlayMount);

    const panelMount = runtime.createInspectorMount();
    panelMount.element.dataset.mesurerLayoutGuidesPanelRoot = "true";
    Object.assign(panelMount.element.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${PANEL_WIDTH}px`,
      zIndex: "95",
      pointerEvents: "none",
    });

    const positionPanel = () => {
      positionFrame = 0;

      if (!active()) return;
      const anchor = runtime.portalTarget.querySelector<HTMLElement>(
        "[data-mesurer-tool-id='layout-guides']",
      );

      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, rect.right - PANEL_WIDTH),
        Math.max(VIEWPORT_PADDING, runtime.ownerWindow.innerWidth - PANEL_WIDTH - VIEWPORT_PADDING),
      );
      const availableBelow = runtime.ownerWindow.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
      const estimatedHeight = Math.min(480, runtime.ownerWindow.innerHeight - VIEWPORT_PADDING * 2);
      const top = availableBelow >= Math.min(estimatedHeight, 320)
        ? rect.bottom + PANEL_GAP
        : Math.max(VIEWPORT_PADDING, rect.top - PANEL_GAP - estimatedHeight);

      panelMount.element.style.left = `${left}px`;
      panelMount.element.style.top = `${top}px`;
    };

    const schedulePanel = () => {
      if (positionFrame) return;
      positionFrame = runtime.ownerWindow.requestAnimationFrame(positionPanel);
    };

    const run = (promise: Promise<unknown>) => {
      void promise.catch(() => undefined);
    };

    const disposePanel = render(() => {
      revision();

      if (!active()) return null;
      queueMicrotask(schedulePanel);

      return (
        <LayoutGuidesPanel
          guides={list()}
          onAdd={() => run(service.add())}
          onUpdate={(id, patch) => run(service.update(id, patch))}
          onRemove={(id) => run(service.remove(id))}
          onClose={() => setActive(false)}
        />
      );
    }, panelMount.element);

    const notify = () => {
      setRevision((value) => value + 1);

      for (const listener of listeners) listener();

      if (active()) schedulePanel();
    };

    const stateSubscription = ctx.state.subscribe(notify);
    const unsubscribePage = subscribeMesurerPageKey(runtime.ownerWindow, (nextPageKey) => {
      if (pageKey === nextPageKey) return;
      pageKey = nextPageKey;
      notify();
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!active()) return;
      // SAFETY: runtime.ownerWindow owns the toolbar, panel, and pointer event realm.
      const realm = runtime.ownerWindow as Window & typeof globalThis;
      const target = event.target;

      if (!(target instanceof realm.Element)) return;

      if (panelMount.element.contains(target)) return;

      if (target.closest("[data-mesurer-tool-id='layout-guides']")) return;
      setActive(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active()) return;
      setActive(false);
    };

    runtime.ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    runtime.ownerDocument.addEventListener("keydown", handleKeyDown, true);
    runtime.ownerWindow.addEventListener("resize", schedulePanel);
    runtime.ownerWindow.addEventListener("pointerup", schedulePanel, true);

    ctx.lifecycle.onDispose(() => {
      runtime.ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      runtime.ownerDocument.removeEventListener("keydown", handleKeyDown, true);
      runtime.ownerWindow.removeEventListener("resize", schedulePanel);
      runtime.ownerWindow.removeEventListener("pointerup", schedulePanel, true);

      if (positionFrame) runtime.ownerWindow.cancelAnimationFrame(positionFrame);
      positionFrame = 0;
      listeners.clear();
      stateSubscription.dispose();
      unsubscribePage();
      disposePanel();
      panelMount.dispose();
      disposeOverlay();
      overlayMount.remove();
    });
  },
});
