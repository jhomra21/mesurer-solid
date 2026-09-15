import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  defineMesurerPlugin,
  type MesurerPlugin,
  type MesurerPluginHost,
} from "@jhomra21/mesurer-solid-core";
import ComposableMesurer, { type MesurerSolidRuntimeService } from "../src/ComposableMesurer";
import { render } from "../src/solid-dom";

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

const mounted: Array<() => void> = [];

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  await settle();
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
});

type Probe = {
  mount: HTMLElement;
  rendererRoot: HTMLElement | null;
};

const rootProbePlugin = (id: string, probes: Map<string, Probe>): MesurerPlugin => defineMesurerPlugin({
  id: `test.root-owner.${id}`,
  setup(ctx) {
    const runtime = ctx.service.get<MesurerSolidRuntimeService>("runtime:solid");
    if (!runtime) throw new Error(`Missing runtime:solid for ${id}`);
    const mount = runtime.createInspectorMount();
    mount.element.dataset.testRendererOwner = id;
    probes.set(id, {
      mount: mount.element,
      rendererRoot: mount.element.closest<HTMLElement>("[data-mesurer-root='true']"),
    });
    ctx.lifecycle.onDispose(() => mount.dispose());
  },
});

const readyPromise = () => {
  let resolve!: (host: MesurerPluginHost) => void;
  const promise = new Promise<MesurerPluginHost>((next) => { resolve = next; });
  return { promise, resolve };
};

describe("renderer runtime root ownership", () => {
  it("keeps each inspector mount inside the renderer root that owns its model", async () => {
    const pageTarget = document.createElement("main");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(pageTarget, firstHost, secondHost);

    const probes = new Map<string, Probe>();
    const firstReady = readyPromise();
    const secondReady = readyPromise();

    const disposeFirst = render(() => (
      <ComposableMesurer
        persistKey="runtime-root-owner-first"
        portalTarget={document.body}
        pageTarget={pageTarget}
        plugins={[rootProbePlugin("first", probes)]}
        onPluginsReady={firstReady.resolve}
      />
    ), firstHost);
    mounted.push(disposeFirst);
    await firstReady.promise;
    await settle();

    const disposeSecond = render(() => (
      <ComposableMesurer
        persistKey="runtime-root-owner-second"
        portalTarget={document.body}
        pageTarget={pageTarget}
        plugins={[rootProbePlugin("second", probes)]}
        onPluginsReady={secondReady.resolve}
      />
    ), secondHost);
    mounted.push(disposeSecond);
    await secondReady.promise;
    await settle();

    const roots = Array.from(document.body.querySelectorAll<HTMLElement>("[data-mesurer-root='true']"));
    expect(roots).toHaveLength(2);

    const first = probes.get("first");
    const second = probes.get("second");
    expect(first?.mount.isConnected).toBe(true);
    expect(second?.mount.isConnected).toBe(true);
    expect(first?.rendererRoot).toBe(roots[0]);
    expect(second?.rendererRoot).toBe(roots[1]);
    expect(first?.rendererRoot).not.toBe(second?.rendererRoot);
  });
});
