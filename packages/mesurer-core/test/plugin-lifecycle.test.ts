import { describe, expect, it, vi } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "../src/plugins";

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("async plugin lifecycle", () => {
  it("cancels an in-flight setup, disposes existing registrations, and rejects later registrations", async () => {
    const host = createMesurerPluginHost();
    const started = deferred();
    const finish = deferred();
    const disposed = vi.fn();

    const plugin = defineMesurerPlugin({
      id: "async.plugin",
      async setup(ctx) {
        ctx.service.provide("async.early", { active: true });
        ctx.lifecycle.onDispose(disposed);
        started.resolve();
        await finish.promise;
        ctx.service.provide("async.late", { active: true });
      },
    });

    const loading = host.load(plugin);
    await started.promise;
    expect(host.service.get("async.early")).toEqual({ active: true });

    expect(host.cancelLoad(plugin)).toBe(true);
    expect(host.service.get("async.early")).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(host.has(plugin.id)).toBe(false);

    finish.resolve();
    await loading;

    expect(host.service.get("async.early")).toBeUndefined();
    expect(host.service.get("async.late")).toBeUndefined();
    expect(host.has(plugin.id)).toBe(false);
    expect(host.describe().services).toEqual([]);
  });

  it("host disposal cancels pending setup without allowing it to resurrect resources", async () => {
    const host = createMesurerPluginHost();
    const started = deferred();
    const finish = deferred();
    const disposed = vi.fn();

    const plugin = defineMesurerPlugin({
      id: "async.dispose",
      async setup(ctx) {
        ctx.service.provide("async.dispose.early", true);
        ctx.lifecycle.onDispose(disposed);
        started.resolve();
        await finish.promise;
        ctx.service.provide("async.dispose.late", true);
      },
    });

    const loading = host.load(plugin);
    await started.promise;
    host.dispose();

    expect(disposed).toHaveBeenCalledTimes(1);
    expect(host.service.get("async.dispose.early")).toBeUndefined();

    finish.resolve();
    await loading;
    expect(host.service.get("async.dispose.late")).toBeUndefined();
    expect(host.has(plugin.id)).toBe(false);
  });
});
