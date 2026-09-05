import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMesurerPluginHost,
  defineMesurerPlugin,
  type MesurerPlugin,
} from "@jhomra21/mesurer-solid-core";
import ComposableMesurer, { type MesurerAvailablePlugin } from "../src/ComposableMesurer";
import { render } from "../src/solid-dom";

const mounted: Array<() => void> = [];
const hosts: Array<ReturnType<typeof createMesurerPluginHost>> = [];

const settle = async () => {
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
};

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const mountComposable = (props: Parameters<typeof ComposableMesurer>[0]) => {
  const element = document.createElement("div");
  document.body.append(element);
  const dispose = render(() => <ComposableMesurer {...props} />, element);
  mounted.push(dispose);
  return dispose;
};

const disposeMounted = (dispose: () => void) => {
  const index = mounted.indexOf(dispose);
  if (index >= 0) mounted.splice(index, 1);
  dispose();
};

afterEach(async () => {
  while (mounted.length) mounted.pop()?.();
  while (hosts.length) hosts.pop()?.dispose();
  await settle();
  localStorage.clear();
  document.body.replaceChildren();
  document.head.querySelectorAll("#mesurer-solid-styles, #mesurer-solid-xray-styles").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("ComposableMesurer async plugin lifecycle", () => {
  it("does not start plugin setup when an available-plugin factory resolves after unmount", async () => {
    const host = createMesurerPluginHost();
    hosts.push(host);
    const factoryResult = deferred<MesurerPlugin>();
    const setup = vi.fn();
    const factory = vi.fn(() => factoryResult.promise);
    const entry: MesurerAvailablePlugin = {
      id: "test.deferred-factory",
      label: "Deferred factory",
      create: factory,
    };
    localStorage.setItem("deferred-factory:plugins:availability", JSON.stringify({
      version: 1,
      enabled: { "test.deferred-factory": true },
      state: {},
    }));

    const dispose = mountComposable({
      persistKey: "deferred-factory",
      pluginHost: host,
      availablePlugins: [entry],
    });
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));

    disposeMounted(dispose);
    factoryResult.resolve(defineMesurerPlugin({
      id: "test.deferred-factory",
      setup(ctx) {
        setup();
        ctx.service.provide("test.deferred-factory.service", true);
      },
    }));
    await settle();
    await settle();

    expect(setup).not.toHaveBeenCalled();
    expect(host.has("test.deferred-factory")).toBe(false);
    expect(host.service.get("test.deferred-factory.service")).toBeUndefined();
  });

  it("cancels setup in progress without disposing unrelated plugins on an external host", async () => {
    const host = createMesurerPluginHost();
    hosts.push(host);
    await host.load(defineMesurerPlugin({
      id: "test.unrelated",
      setup(ctx) {
        ctx.service.provide("test.unrelated.service", { alive: true });
      },
    }));

    const started = deferred();
    const finish = deferred();
    const disposed = vi.fn();
    const asyncPlugin = defineMesurerPlugin({
      id: "test.async-component",
      async setup(ctx) {
        ctx.service.provide("test.async-component.early", { alive: true });
        ctx.lifecycle.onDispose(disposed);
        started.resolve();
        await finish.promise;
        ctx.service.provide("test.async-component.late", { alive: true });
      },
    });

    const dispose = mountComposable({
      persistKey: "async-component",
      pluginHost: host,
      plugins: [asyncPlugin],
    });
    await started.promise;
    expect(host.service.get("test.async-component.early")).toEqual({ alive: true });

    disposeMounted(dispose);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(host.service.get("test.async-component.early")).toBeUndefined();
    expect(host.service.get("test.unrelated.service")).toEqual({ alive: true });
    expect(host.has("test.unrelated")).toBe(true);

    finish.resolve();
    await settle();
    await settle();

    expect(host.has("test.async-component")).toBe(false);
    expect(host.service.get("test.async-component.late")).toBeUndefined();
    expect(host.has("test.unrelated")).toBe(true);
    expect(host.service.get("test.unrelated.service")).toEqual({ alive: true });
  });

  it("still loads healthy plugins and reports setup failures", async () => {
    const host = createMesurerPluginHost();
    hosts.push(host);
    const onPluginError = vi.fn();
    const healthy = defineMesurerPlugin({
      id: "test.healthy",
      setup(ctx) {
        ctx.service.provide("test.healthy.service", 42);
      },
    });
    const failing = defineMesurerPlugin({
      id: "test.failing",
      setup() {
        throw new Error("expected setup failure");
      },
    });

    mountComposable({
      persistKey: "normal-plugin-loading",
      pluginHost: host,
      plugins: [healthy, failing],
      onPluginError,
    });

    await vi.waitFor(() => expect(host.has("test.healthy")).toBe(true));
    await vi.waitFor(() => expect(onPluginError).toHaveBeenCalled());
    expect(host.service.get("test.healthy.service")).toBe(42);
    expect(host.has("test.failing")).toBe(false);
    expect(onPluginError).toHaveBeenCalledWith(expect.any(Error), "test.failing");
  });
});
