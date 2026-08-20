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
});
