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

  it("describes interactive settings without leaking setters and notifies plugin state subscribers", async () => {
    const host = createMesurerPluginHost();
    let stateNotifications = 0;

    await host.load(defineMesurerPlugin({
      id: "settings.example",
      setup(ctx) {
        ctx.state.register({ id: "settings.example", initial: { enabled: true }, persist: true });
        ctx.state.subscribe(() => {
          stateNotifications += 1;
        });
        const enabled = () => ctx.state.get<{ enabled: boolean }>("settings.example")?.enabled ?? false;
        const setEnabled = (value: boolean) => {
          ctx.state.update<{ enabled: boolean }>("settings.example", (current) => ({ ...current, enabled: value }));
        };
        ctx.tool.register({
          id: "settings.example",
          label: "Example",
          command: "settings.example.toggle",
          hidden: () => !enabled(),
        });
        ctx.command.register("settings.example.toggle", () => setEnabled(!enabled()));
        ctx.settings.register({
          id: "example",
          label: "Example",
          controls: [{
            type: "toggle",
            id: "enabled",
            label: "Enabled",
            description: "Show the example tool.",
            value: enabled,
            set: setEnabled,
          }],
        });
      },
    }));

    expect(host.tools()[0]?.hidden?.()).toBe(false);
    expect(host.describe().settings).toEqual([{
      id: "example",
      label: "Example",
      controls: [{
        type: "toggle",
        id: "enabled",
        label: "Enabled",
        description: "Show the example tool.",
        value: true,
        disabled: false,
      }],
    }]);

    const control = host.settings()[0]?.controls?.[0];
    await control?.set(false);
    expect(host.tools()[0]?.hidden?.()).toBe(true);
    expect(stateNotifications).toBe(1);
    expect(host.describe().settings[0]?.controls[0]?.value).toBe(false);

    host.state.restore({ "settings.example": { enabled: true } }, "persist");
    expect(host.tools()[0]?.hidden?.()).toBe(false);
    expect(stateNotifications).toBe(2);
  });

  it("treats nested command dispatch as one history action", async () => {
    const host = createMesurerPluginHost();
    await host.load(defineMesurerPlugin({
      id: "nested",
      setup(ctx) {
        ctx.state.register({ id: "nested", initial: 0, history: true });
        ctx.command.register("nested.inner", () => {
          ctx.state.update<number>("nested", (value) => value + 1);
        });
        ctx.command.register("nested.outer", async () => {
          await ctx.command.execute("nested.inner");
        });
      },
    }));

    await host.command.execute("nested.outer");
    expect(host.state.get("nested")).toBe(1);
    expect(host.undo()).toBe(true);
    expect(host.state.get("nested")).toBe(0);
    expect(host.canUndo()).toBe(false);
    expect(host.redo()).toBe(true);
    expect(host.state.get("nested")).toBe(1);
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