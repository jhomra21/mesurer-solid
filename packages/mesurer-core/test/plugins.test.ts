import { describe, expect, it } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "../src/plugins";

describe("Mesurer plugin host", () => {
  it("loads, describes, executes, histories, persists, removes, and replaces plugins", async () => {
    const host = createMesurerPluginHost();
    let calls = 0;
    const plugin = defineMesurerPlugin({
      id: "example",
      provides: ["tool:example"],
      setup(ctx) {
        ctx.state.register({ id: "example", initial: { enabled: true, count: 0 }, history: true, persist: true });
        ctx.command.register("example.toggle", () => {
          calls += 1;
          ctx.state.update("example", (value) => ({ ...value, enabled: !value.enabled, count: value.count + 1 }));
        });
        ctx.tool.register({ id: "example", label: "Example", command: "example.toggle", order: 10 });
      },
    });

    await host.load(plugin);
    expect(host.describe().tools.map((tool) => tool.id)).toEqual(["example"]);
    await host.command.execute("example.toggle");
    expect(calls).toBe(1);
    expect(host.state.get<{ enabled: boolean; count: number }>("example")).toEqual({ enabled: false, count: 1 });
    expect(host.canUndo()).toBe(true);
    expect(host.undo()).toBe(true);
    expect(host.state.get<{ enabled: boolean; count: number }>("example")).toEqual({ enabled: true, count: 0 });
    expect(host.redo()).toBe(true);
    expect(host.state.get<{ enabled: boolean; count: number }>("example")).toEqual({ enabled: false, count: 1 });
    expect(host.state.serialize("persist")).toEqual({ example: { enabled: false, count: 1 } });

    expect(host.remove("example")).toBe(true);
    expect(host.describe().tools).toHaveLength(0);
    expect(host.state.get("example")).toBeUndefined();
    expect(host.canUndo()).toBe(false);

    await host.replace(plugin);
    expect(host.has("example")).toBe(true);
    host.state.restore({ example: { enabled: false, count: 9 } }, "persist");
    expect(host.state.get("example")).toEqual({ enabled: false, count: 9 });
  });

  it("scopes opaque services and lifecycle cleanup to plugin lifetime", async () => {
    const host = createMesurerPluginHost();
    let disposals = 0;

    const servicePlugin = defineMesurerPlugin({
      id: "example.service",
      setup(ctx) {
        ctx.service.provide("example.runtime", { answer: 42 });
        ctx.lifecycle.onDispose(() => {
          disposals += 1;
        });
      },
    });

    await host.load(servicePlugin);
    expect(host.service.get<{ answer: number }>("example.runtime")).toEqual({ answer: 42 });
    expect(host.describe().services).toEqual(["example.runtime"]);

    await host.replace(servicePlugin);
    expect(disposals).toBe(1);
    expect(host.service.get<{ answer: number }>("example.runtime")).toEqual({ answer: 42 });

    expect(host.remove("example.service")).toBe(true);
    expect(disposals).toBe(2);
    expect(host.service.get("example.runtime")).toBeUndefined();
    expect(host.describe().services).toEqual([]);
  });

  it("disposes registrations created before plugin setup fails", async () => {
    const host = createMesurerPluginHost();
    let disposals = 0;

    await expect(host.load(defineMesurerPlugin({
      id: "example.failure",
      setup(ctx) {
        ctx.service.provide("example.failed-runtime", { active: true });
        ctx.lifecycle.onDispose(() => {
          disposals += 1;
        });
        throw new Error("boom");
      },
    }))).rejects.toThrow("boom");

    expect(disposals).toBe(1);
    expect(host.service.get("example.failed-runtime")).toBeUndefined();
    expect(host.has("example.failure")).toBe(false);
  });
});
