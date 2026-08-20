import { describe, expect, it } from "vitest";
import { createMesurerPluginHost, defineMesurerPlugin } from "../src/plugins";

describe("Mesurer plugin host", () => {
  it("loads, describes, executes, removes, and replaces plugins", async () => {
    const host = createMesurerPluginHost();
    let calls = 0;
    const plugin = defineMesurerPlugin({
      id: "example",
      provides: ["tool:example"],
      setup(ctx) {
        ctx.state.register({ id: "example", initial: { enabled: true }, history: true, persist: true });
        ctx.command.register("example.toggle", () => { calls += 1; });
        ctx.tool.register({ id: "example", label: "Example", command: "example.toggle", order: 10 });
      },
    });
    await host.load(plugin);
    expect(host.describe().tools.map((tool) => tool.id)).toEqual(["example"]);
    await host.command.execute("example.toggle");
    expect(calls).toBe(1);
    expect(host.remove("example")).toBe(true);
    expect(host.describe().tools).toHaveLength(0);
    await host.replace(plugin);
    expect(host.has("example")).toBe(true);
  });
});
