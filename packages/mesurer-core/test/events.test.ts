import { describe, expect, it } from "vitest";
import { createEventBus } from "../src/events";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("event bus", () => {
  it("starts every listener before awaiting async listener work", async () => {
    const bus = createEventBus<{ changed: number }>();
    const gate = deferred();
    const seen: string[] = [];

    bus.on("changed", async () => {
      seen.push("first:start");
      await gate.promise;
      seen.push("first:end");
    });
    bus.on("changed", () => {
      seen.push("second");
    });

    const emitted = bus.emit("changed", 1);
    expect(seen).toEqual(["first:start", "second"]);

    gate.resolve();
    await emitted;
    expect(seen).toEqual(["first:start", "second", "first:end"]);
  });
});
