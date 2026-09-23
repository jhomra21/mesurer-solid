import { afterEach, describe, expect, it } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import type { MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import {
  MESURER_LAYOUT_GUIDES_SERVICE_ID,
  layoutGuidesPlugin,
  type MesurerLayoutGuidesService,
} from "../src/plugins/layout-guides";

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const setup = async () => {
  const host = createMesurerPluginHost();
  const rendererRoot = document.createElement("div");
  rendererRoot.dataset.mesurerRoot = "true";
  document.body.append(rendererRoot);

  const runtime: MesurerSolidRuntimeService = {
    ownerDocument: document,
    ownerWindow: window,
    portalTarget: document.body,
    pageTarget: document.body,
    rendererRoot,
    createWorkspaceRuntime() {
      throw new Error("Layout Guides does not require workspace selection runtime.");
    },
    createInspectorMount() {
      const element = document.createElement("div");
      element.dataset.mesurerInspectorUi = "true";
      document.body.append(element);

      return { element, dispose: () => element.remove() };
    },
  };

  await host.load(defineMesurerPlugin({
    id: "test.runtime",
    provides: ["runtime:solid"],
    setup(ctx) {
      ctx.service.provide("runtime:solid", runtime);
    },
  }));
  await host.load(layoutGuidesPlugin());

  const service = host.service.get<MesurerLayoutGuidesService>(MESURER_LAYOUT_GUIDES_SERVICE_ID);

  if (!service) throw new Error("Layout Guides service did not load.");

  return { host, service };
};

describe("layoutGuidesPlugin", () => {
  it("routes mutations through history-aware commands", async () => {
    const { host, service } = await setup();

    const guide = await service.add({
      kind: "columns",
      count: 6,
      gutter: 24,
      color: "#ff00aa",
    });

    expect(service.list()).toEqual([
      expect.objectContaining({
        id: guide.id,
        kind: "columns",
        count: 6,
        gutter: 24,
        color: "#ff00aa",
      }),
    ]);
    expect(host.canUndo()).toBe(true);

    expect(host.undo()).toBe(true);
    expect(service.list()).toEqual([]);
    expect(host.redo()).toBe(true);
    expect(service.list()[0]?.id).toBe(guide.id);

    await service.update(guide.id, { visible: false, align: "center", size: 96 });
    expect(service.list()[0]).toMatchObject({
      visible: false,
      align: "center",
      size: 96,
    });

    await expect(service.remove(guide.id)).resolves.toBe(true);
    expect(service.list()).toEqual([]);
    host.dispose();
  });

  it("keeps guide sets scoped to the current page route", async () => {
    const original = window.location.pathname + window.location.search + window.location.hash;
    const { host, service } = await setup();

    window.history.replaceState({}, "", "/layout-alpha?b=2&a=1");
    const alpha = await service.add({ kind: "rows", count: 4 });
    expect(service.list()[0]?.id).toBe(alpha.id);

    window.history.pushState({}, "", "/layout-beta");
    expect(service.list()).toEqual([]);
    const beta = await service.add({ kind: "grid", size: 16 });
    expect(service.list()[0]?.id).toBe(beta.id);

    window.history.replaceState({}, "", "/layout-alpha?a=1&b=2");
    expect(service.list()[0]?.id).toBe(alpha.id);

    host.dispose();
    window.history.replaceState({}, "", original || "/");
  });
});
